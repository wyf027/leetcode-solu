#!/usr/bin/env python3
"""
java-testing/scripts/generate-test.py
根据已有的 Java 业务类自动生成测试骨架，免去手工写样板代码。

支持以下类型（自动从文件名推断）：
  *ServiceImpl.java  → XxxServiceImplTest.java（@ExtendWith + @Mock + @InjectMocks）
  *Controller.java   → XxxControllerTest.java（@WebMvcTest + MockMvc）
  *Listener.java     → XxxListenerTest.java（@ExtendWith + @Mock）
  *Handler.java      → XxxHandlerTest.java（@ExtendWith + @Mock）
  *Utils.java        → XxxUtilsTest.java（工具类静态方法测试）

用法：
  python3 generate-test.py <java-file-or-dir> [选项]

选项：
  --output  <dir>    输出目录（默认自动推断 src/test/java 同包路径）
  --dry-run          只打印，不写入文件
  --overwrite        覆盖已存在的测试文件（默认跳过）
  --type    <type>   强制指定类型（service|controller|listener|handler|utils）

示例：
  # 为单个 ServiceImpl 生成测试骨架
  python3 generate-test.py ./assess-service/src/main/java/com/succaiss/assess/service/service/impl/QuestionServiceImpl.java

  # 为整个 service 模块扫描缺失测试的类，批量生成
  python3 generate-test.py ./assess-service/src --dry-run

  # 生成 Controller 测试
  python3 generate-test.py ./assess-web/src/main/java/com/succaiss/assess/web/controller/QuestionController.java
"""

import sys
import os
import re
import subprocess
import argparse
from pathlib import Path
from datetime import date
from typing import Optional

# ── 颜色 ────────────────────────────────────────────────────────────────────
RED    = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN  = '\033[0;32m'
CYAN   = '\033[0;36m'
BOLD   = '\033[1m'
NC     = '\033[0m'

# ── 常量 ────────────────────────────────────────────────────────────────────
# 不生成测试的类型过滤
SKIP_PATTERNS = re.compile(
    r'(Test|Application|Config|Configuration|Constant|Const|Properties|Enum|Exception|ErrorCode)\.java$',
    re.IGNORECASE
)

CLASS_TYPE_MAP = {
    'serviceimpl': 'service',
    'controller':  'controller',
    'listener':    'listener',
    'handler':     'handler',
    'utils':       'utils',
    'util':        'utils',
    'helper':      'utils',
}


# ── 工具函数 ────────────────────────────────────────────────────────────────

def get_git_author() -> str:
    try:
        r = subprocess.run(['git', 'config', 'user.name'],
                           capture_output=True, text=True, timeout=5)
        return r.stdout.strip() or 'Unknown'
    except Exception:
        return 'Unknown'


def get_tool_model() -> str:
    return 'Cursor - claude-sonnet'


def today_str() -> str:
    return date.today().strftime('%Y/%m/%d')


def infer_class_type(filename: str, force_type: Optional[str] = None) -> Optional[str]:
    if force_type:
        return force_type.lower()
    name = Path(filename).stem.lower()
    for suffix, t in CLASS_TYPE_MAP.items():
        if name.endswith(suffix):
            return t
    return None


def parse_java_class(java_path: str) -> dict:
    """
    解析 Java 文件，提取：
    - package, class_name, simple_name（去 Impl 后缀）
    - injected_fields: [{type, name}]  (@Resource / @Autowired 字段)
    - public_methods:  [{return_type, name, params_str}]
    - extends_service_impl: bool
    """
    content = Path(java_path).read_text(encoding='utf-8', errors='replace')

    # 包名
    pkg_m = re.search(r'^package\s+([\w.]+)\s*;', content, re.MULTILINE)
    pkg   = pkg_m.group(1) if pkg_m else ''

    # 类名
    cls_m = re.search(r'(?:public\s+)?(?:class|interface)\s+(\w+)', content)
    class_name = cls_m.group(1) if cls_m else Path(java_path).stem

    # 简名（去 Impl/Controller/Listener/Handler 等后缀）
    simple = re.sub(r'(ServiceImpl|Impl|Controller|Listener|Handler)$', '', class_name)

    # 是否继承 ServiceImpl（MyBatis-Plus，需 @Spy 模式）
    extends_service_impl = bool(re.search(r'extends\s+ServiceImpl\s*<', content))

    # 注入字段（@Resource 或 @Autowired 标注的字段）
    injected = []
    for m in re.finditer(
        r'@(?:Resource|Autowired)[^;]*?\n\s+(?:private\s+)?([\w<>?,\s]+)\s+(\w+)\s*;',
        content, re.MULTILINE
    ):
        ftype = m.group(1).strip()
        fname = m.group(2).strip()
        injected.append({'type': ftype, 'name': fname})

    # public 方法（排除 @Override 的 getter/setter 等，取有意义的业务方法）
    methods = []
    for m in re.finditer(
        r'public\s+([\w<>?,\[\]\s]+?)\s+(\w+)\s*\(([^)]*)\)',
        content
    ):
        ret    = m.group(1).strip()
        mname  = m.group(2).strip()
        params = m.group(3).strip()
        # 过滤掉 class/interface 关键字被误匹配
        if mname in ('class', 'interface', 'extends', 'implements'):
            continue
        # 过滤辅助方法前缀（只保留常见业务方法名）
        if re.match(r'^(get|set|is|equals|hashCode|toString|main)$', mname):
            continue
        methods.append({'return_type': ret, 'name': mname, 'params': params})

    return {
        'package':              pkg,
        'class_name':           class_name,
        'simple_name':          simple,
        'injected_fields':      injected,
        'public_methods':       methods,
        'extends_service_impl': extends_service_impl,
    }


# ── 测试类生成 ──────────────────────────────────────────────────────────────

def gen_service_test(info: dict, author: str, today: str) -> str:
    cls   = info['class_name']
    simple = info['simple_name']
    pkg   = re.sub(r'\.service\.impl$', '', info['package'])  # 推断根包
    test_pkg = pkg + '.service.impl'

    camel = simple[0].lower() + simple[1:]
    spy_mode = info['extends_service_impl']

    lines = [
        f'package {test_pkg};',
        '',
        'import com.baomidou.mybatisplus.extension.plugins.pagination.Page;',
        'import org.junit.jupiter.api.BeforeEach;',
        'import org.junit.jupiter.api.DisplayName;',
        'import org.junit.jupiter.api.Test;',
        'import org.junit.jupiter.api.extension.ExtendWith;',
        'import org.mockito.InjectMocks;',
        ('import org.mockito.Spy;' if spy_mode else ''),
        'import org.mockito.Mock;',
        'import org.mockito.junit.jupiter.MockitoExtension;',
        '',
        'import static org.assertj.core.api.Assertions.assertThat;',
        'import static org.assertj.core.api.Assertions.assertThatThrownBy;',
        'import static org.junit.jupiter.api.Assertions.*;',
        'import static org.mockito.ArgumentMatchers.*;',
        'import static org.mockito.Mockito.*;',
        '',
        f'/**',
        f' * {cls} 单元测试。',
        f' *',
        f' * <p>职责：验证 Service 层业务逻辑，所有依赖全部 Mock，',
        f' * 不依赖数据库和 Spring 容器，每个测试方法数据完全自给自足。',
    ]

    if spy_mode:
        lines += [
            f' *',
            f' * <p><b>@Spy 模式说明</b>：{cls} 继承 ServiceImpl，',
            f' * 使用 @Spy @InjectMocks 并在 @BeforeEach 中 lenient stub 继承方法，',
            f' * 避免 MybatisPlusException: baseMapper can not be null。',
        ]

    lines += [
        f' *',
        f' * @author {author} and AI({get_tool_model()})',
        f' * @since {today}',
        f' */',
        '@ExtendWith(MockitoExtension.class)',
        f'class {cls}Test {{',
        '',
    ]

    # Mock 依赖注入字段
    if spy_mode:
        lines.append(f'    @Spy')
        lines.append(f'    @InjectMocks')
        lines.append(f'    private {cls} {camel}Service;')
    else:
        lines.append(f'    @InjectMocks')
        lines.append(f'    private {cls} {camel}Service;')
    lines.append('')

    for field in info['injected_fields']:
        lines.append(f'    @Mock')
        lines.append(f'    private {field["type"]} {field["name"]};')
        lines.append('')

    # BeforeEach
    lines += [
        '    @BeforeEach',
        '    void setUp() {',
    ]
    if spy_mode:
        lines += [
            '        // ── ServiceImpl 继承方法 lenient stub ──────────────────────────',
            f'        lenient().doReturn(true).when({camel}Service).save(any());',
            f'        lenient().doReturn(true).when({camel}Service).updateById(any());',
            f'        lenient().doReturn(true).when({camel}Service).removeById(anyLong());',
        ]
    lines.append('    }')
    lines.append('')

    # 业务方法测试占位
    methods = info['public_methods']
    if methods:
        for method in methods:
            mname = method['name']
            lines += [
                f'    // ── {mname} ──────────────────────────────────────────────────',
                '',
                '    /**',
                f'     * [TC-??] TODO：补充正常场景描述。',
                '     */',
                '    @Test',
                f'    @DisplayName("{mname} - 正常场景")',
                f'    void {mname}_normalCase_TODO() {{',
                '        // Given',
                '        // TODO：准备 Mock 数据',
                '',
                '        // When',
                f'        // {camel}Service.{mname}(...);',
                '',
                '        // Then',
                '        // assertThat(...).isEqualTo(...);',
                '    }',
                '',
                '    /**',
                f'     * [TC-??] TODO：补充异常场景描述。',
                '     */',
                '    @Test',
                f'    @DisplayName("{mname} - 异常场景")',
                f'    void {mname}_exceptionCase_TODO() {{',
                '        // Given',
                '        // TODO：准备触发异常的 Mock 数据',
                '',
                '        // When / Then',
                f'        assertThatThrownBy(() -> {camel}Service.{mname}(/* TODO */null))',
                '                .isInstanceOf(/* TODO */RuntimeException.class);',
                '    }',
                '',
            ]
    else:
        lines += [
            '    // TODO：根据业务方法补充测试用例',
            '    // 每个 public 方法至少覆盖：正常场景 / 边界场景 / 异常场景 / 状态流转',
            '',
        ]

    lines.append('}')
    # 过滤掉空字符串行（Spy 相关条件未选时产生）
    return '\n'.join(l for l in lines if l is not None)


def gen_controller_test(info: dict, author: str, today: str) -> str:
    cls    = info['class_name']
    simple = info['simple_name']
    pkg    = re.sub(r'\.controller$', '', info['package'])
    test_pkg = pkg + '.controller'

    camel_service = simple[0].lower() + simple[1:] + 'Service'

    lines = [
        f'package {test_pkg};',
        '',
        'import com.fasterxml.jackson.databind.ObjectMapper;',
        'import org.junit.jupiter.api.Test;',
        'import org.junit.jupiter.api.DisplayName;',
        'import org.springframework.beans.factory.annotation.Autowired;',
        'import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;',
        'import org.springframework.boot.test.mock.mockito.MockBean;',
        'import org.springframework.http.MediaType;',
        'import org.springframework.test.web.servlet.MockMvc;',
        '',
        'import static org.mockito.ArgumentMatchers.*;',
        'import static org.mockito.Mockito.*;',
        'import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;',
        'import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;',
        '',
        f'/**',
        f' * {cls} 单元测试（@WebMvcTest 模式）。',
        f' *',
        f' * <p>只加载 Web 层，Service 全部 Mock，不启动完整容器。',
        f' * 侧重验证：URL 映射 / HTTP 状态码 / 请求校验 / 响应结构。',
        f' *',
        f' * @author {author} and AI({get_tool_model()})',
        f' * @since {today}',
        f' */',
        f'@WebMvcTest({cls}.class)',
        f'class {cls}Test {{',
        '',
        '    @Autowired',
        '    private MockMvc mockMvc;',
        '',
        '    @Autowired',
        '    private ObjectMapper objectMapper;',
        '',
        '    // TODO：按实际注入的 Service 类型替换',
        f'    @MockBean',
        f'    private /* TODO {simple}Service */ Object {camel_service};',
        '',
    ]

    # 业务方法测试
    methods = info['public_methods']
    if methods:
        for method in methods:
            mname = method['name']
            lines += [
                '    @Test',
                f'    @DisplayName("{mname} - TODO 补充描述")',
                f'    void {mname}_TODO() throws Exception {{',
                '        // Given',
                '        // when({camel_service}.{mname}(any())).thenReturn(...);',
                '',
                '        // When / Then',
                '        mockMvc.perform(get("/TODO-PATH")  // TODO：填写正确 HTTP Method 和路径',
                '                        .contentType(MediaType.APPLICATION_JSON))',
                '               .andExpect(status().isOk())',
                '               .andExpect(jsonPath("$.code").value(200));',
                '    }',
                '',
            ]
    else:
        lines += [
            '    // TODO：补充接口测试用例',
            '',
        ]

    lines.append('}')
    return '\n'.join(lines)


def gen_listener_test(info: dict, author: str, today: str) -> str:
    cls  = info['class_name']
    pkg  = info['package']
    test_pkg = pkg

    lines = [
        f'package {test_pkg};',
        '',
        'import org.junit.jupiter.api.BeforeEach;',
        'import org.junit.jupiter.api.DisplayName;',
        'import org.junit.jupiter.api.Test;',
        'import org.junit.jupiter.api.extension.ExtendWith;',
        'import org.mockito.InjectMocks;',
        'import org.mockito.Mock;',
        'import org.mockito.junit.jupiter.MockitoExtension;',
        '',
        'import static org.mockito.ArgumentMatchers.*;',
        'import static org.mockito.Mockito.*;',
        '',
        f'/**',
        f' * {cls} 单元测试。',
        f' *',
        f' * <p>验证消息消费逻辑：正常处理 / 入参为空 / Service 抛异常时异常上抛（不静默吞掉）。',
        f' *',
        f' * @author {author} and AI({get_tool_model()})',
        f' * @since {today}',
        f' */',
        '@ExtendWith(MockitoExtension.class)',
        f'class {cls}Test {{',
        '',
        '    @InjectMocks',
        f'    private {cls} listener;',
        '',
    ]

    for field in info['injected_fields']:
        lines.append(f'    @Mock')
        lines.append(f'    private {field["type"]} {field["name"]};')
        lines.append('')

    lines += [
        '    @Test',
        '    @DisplayName("onPayload - 正常消息 → 处理成功，Service 被调用")',
        '    void onPayload_normalMessage_processedSuccessfully() {',
        '        // Given',
        '        // TODO：构造合法消息体',
        '',
        '        // When',
        '        // listener.onPayload(message);',
        '',
        '        // Then',
        '        // verify(xxxService).doSomething(any());',
        '    }',
        '',
        '    @Test',
        '    @DisplayName("onPayload - 消息体为空 → 抛出异常（不静默 return）")',
        '    void onPayload_nullMessage_throwsException() {',
        '        // TODO：验证 onPayload(null) 或校验失败时抛异常，而非 catch 后 return',
        '        // assertThatThrownBy(() -> listener.onPayload(null))',
        '        //         .isInstanceOf(IllegalArgumentException.class);',
        '    }',
        '',
        '    @Test',
        '    @DisplayName("onPayload - Service 抛异常 → 异常向上传播，不被 catch 吞掉")',
        '    void onPayload_serviceThrowsException_exceptionPropagated() {',
        '        // Given',
        '        // doThrow(new RuntimeException("DB error")).when(xxxService).doSomething(any());',
        '',
        '        // Then',
        '        // assertThatThrownBy(() -> listener.onPayload(message))',
        '        //         .isInstanceOf(RuntimeException.class);',
        '    }',
        '',
        '}',
    ]
    return '\n'.join(lines)


def gen_utils_test(info: dict, author: str, today: str) -> str:
    cls  = info['class_name']
    pkg  = info['package']
    test_pkg = pkg
    methods = info['public_methods']

    lines = [
        f'package {test_pkg};',
        '',
        'import org.junit.jupiter.api.DisplayName;',
        'import org.junit.jupiter.api.Test;',
        'import org.junit.jupiter.params.ParameterizedTest;',
        'import org.junit.jupiter.params.provider.NullSource;',
        'import org.junit.jupiter.params.provider.ValueSource;',
        '',
        'import static org.assertj.core.api.Assertions.assertThat;',
        'import static org.assertj.core.api.Assertions.assertThatThrownBy;',
        '',
        f'/**',
        f' * {cls} 单元测试。',
        f' *',
        f' * <p>工具类测试：所有方法为静态方法，无 Mock，纯输入输出验证。',
        f' * 重点覆盖：null 入参 / 空集合 / 边界值 / 格式异常输入。',
        f' *',
        f' * @author {author} and AI({get_tool_model()})',
        f' * @since {today}',
        f' */',
        f'class {cls}Test {{',
        '',
    ]

    if methods:
        for method in methods:
            mname = method['name']
            lines += [
                '    @Test',
                f'    @DisplayName("{mname} - 正常输入")',
                f'    void {mname}_normalInput_TODO() {{',
                '        // TODO：调用静态方法并断言返回值',
                f'        // assertThat({cls}.{mname}(...)).isEqualTo(...);',
                '    }',
                '',
                '    @ParameterizedTest',
                '    @NullSource',
                f'    @DisplayName("{mname} - null 入参")',
                f'    void {mname}_nullInput_TODO(Object input) {{',
                '        // TODO：验证 null 入参行为（抛异常或返回默认值）',
                '    }',
                '',
            ]
    else:
        lines += [
            '    // TODO：补充工具方法静态调用测试',
            '',
        ]

    lines.append('}')
    return '\n'.join(lines)


def gen_generic_test(info: dict, author: str, today: str) -> str:
    """通用：Handler 等。"""
    cls  = info['class_name']
    pkg  = info['package']
    test_pkg = pkg

    lines = [
        f'package {test_pkg};',
        '',
        'import org.junit.jupiter.api.BeforeEach;',
        'import org.junit.jupiter.api.DisplayName;',
        'import org.junit.jupiter.api.Test;',
        'import org.junit.jupiter.api.extension.ExtendWith;',
        'import org.mockito.InjectMocks;',
        'import org.mockito.Mock;',
        'import org.mockito.junit.jupiter.MockitoExtension;',
        '',
        'import static org.assertj.core.api.Assertions.assertThat;',
        'import static org.mockito.Mockito.*;',
        '',
        f'/**',
        f' * {cls} 单元测试。',
        f' *',
        f' * @author {author} and AI({get_tool_model()})',
        f' * @since {today}',
        f' */',
        '@ExtendWith(MockitoExtension.class)',
        f'class {cls}Test {{',
        '',
        '    @InjectMocks',
        f'    private {cls} handler;',
        '',
    ]

    for field in info['injected_fields']:
        lines.append(f'    @Mock')
        lines.append(f'    private {field["type"]} {field["name"]};')
        lines.append('')

    lines += [
        '    // TODO：补充具体测试用例',
        '',
        '}',
    ]
    return '\n'.join(lines)


GENERATOR_MAP = {
    'service':    gen_service_test,
    'controller': gen_controller_test,
    'listener':   gen_listener_test,
    'utils':      gen_utils_test,
    'handler':    gen_generic_test,
}


# ── 路径推断 ────────────────────────────────────────────────────────────────

def infer_test_path(java_path: str, output_dir: Optional[str]) -> str:
    """从 main 路径推断 test 路径，替换 src/main/java → src/test/java。"""
    abs_path = os.path.abspath(java_path)
    test_path = abs_path.replace(
        os.sep + 'src' + os.sep + 'main' + os.sep + 'java' + os.sep,
        os.sep + 'src' + os.sep + 'test' + os.sep + 'java' + os.sep
    )
    stem = Path(test_path).stem
    parent = os.path.dirname(test_path)
    test_file = os.path.join(parent, f'{stem}Test.java')

    if output_dir:
        filename = f'{stem}Test.java'
        test_file = os.path.join(output_dir, filename)

    return test_file


def collect_java_files(path: str) -> list[str]:
    """收集目录下的 Java 文件（排除 Test / 枚举等）。"""
    if os.path.isfile(path):
        return [path]
    result = []
    for p in Path(path).rglob('*.java'):
        if 'test' in str(p).lower():
            continue
        if SKIP_PATTERNS.search(p.name):
            continue
        result.append(str(p))
    return result


# ── 主流程 ──────────────────────────────────────────────────────────────────

def process_file(java_path: str, args, author: str, today: str) -> tuple[int, int]:
    """处理单个文件，返回 (written, skipped)。"""
    class_type = infer_class_type(java_path, args.type)
    if not class_type:
        return 0, 0  # 不支持的类型

    generator = GENERATOR_MAP.get(class_type)
    if not generator:
        return 0, 0

    try:
        info = parse_java_class(java_path)
    except Exception as e:
        print(f'{YELLOW}  🟡 解析失败，跳过：{java_path}（{e}）{NC}')
        return 0, 0

    test_path = infer_test_path(java_path, args.output)
    test_name = os.path.basename(test_path)

    if os.path.exists(test_path) and not args.overwrite:
        print(f'{YELLOW}  ⟳ 已存在，跳过：{test_name}{NC}')
        return 0, 1

    try:
        code = generator(info, author, today)
    except Exception as e:
        print(f'{YELLOW}  🟡 生成失败，跳过：{java_path}（{e}）{NC}')
        return 0, 0

    if args.dry_run:
        print(f'{CYAN}── [DRY-RUN] {class_type.upper()} 测试 → {test_name}{NC}')
        print(code)
        print()
        return 0, 0

    os.makedirs(os.path.dirname(test_path), exist_ok=True)
    Path(test_path).write_text(code, encoding='utf-8')
    print(f'{GREEN}  ✅ 已生成：{os.path.relpath(test_path)}（{class_type}）{NC}')
    return 1, 0


def main():
    parser = argparse.ArgumentParser(
        description='根据 Java 业务类自动生成测试骨架',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('path',
                        help='Java 文件路径或目录（目录时批量扫描）')
    parser.add_argument('--output',
                        help='输出目录（默认自动推断 src/test/java 同包路径）')
    parser.add_argument('--dry-run', action='store_true',
                        help='只打印，不写入文件')
    parser.add_argument('--overwrite', action='store_true',
                        help='覆盖已存在的测试文件（默认跳过）')
    parser.add_argument('--type',
                        choices=['service', 'controller', 'listener', 'handler', 'utils'],
                        help='强制指定类型（否则自动推断）')
    args = parser.parse_args()

    target = os.path.expanduser(args.path)
    if not os.path.exists(target):
        print(f'{RED}❌ 路径不存在：{target}{NC}')
        sys.exit(1)

    author = get_git_author()
    today  = today_str()

    java_files = collect_java_files(target)
    if not java_files:
        print(f'{YELLOW}🟡 未找到需要生成测试的 Java 文件。{NC}')
        sys.exit(0)

    print(f'\n{BOLD}╔══════════════════════════════════════════╗{NC}')
    print(f'{BOLD}║       Java 测试骨架生成器               ║{NC}')
    print(f'{BOLD}╚══════════════════════════════════════════╝{NC}')
    print(f'  目标路径：{target}')
    print(f'  Java 文件：{len(java_files)} 个')
    print()

    total_written  = 0
    total_skipped  = 0

    for jf in sorted(java_files):
        w, s = process_file(jf, args, author, today)
        total_written  += w
        total_skipped  += s

    print()
    print(f'{BOLD}╔══════════════════════════════════════════╗{NC}')
    print(f'{BOLD}║                 生成完成                ║{NC}')
    print(f'{BOLD}╚══════════════════════════════════════════╝{NC}')
    print(f'  生成：{total_written} 个  跳过：{total_skipped} 个')
    if total_written > 0 and not args.dry_run:
        print()
        print(f'{GREEN}  后续必做：{NC}')
        print('  1. 将 TODO 注释替换为具体业务断言')
        print('  2. 每个方法至少覆盖：正常 / 边界 / 异常 / 状态流转 四维度')
        print('  3. 执行 check-test-style.sh 验证测试命名规范')
        print('  4. 执行 check-test-coverage.py 验证覆盖率')
    print()


if __name__ == '__main__':
    main()
