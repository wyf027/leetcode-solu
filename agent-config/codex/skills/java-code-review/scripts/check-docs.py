#!/usr/bin/env python3
"""
java-code-review/scripts/check-docs.py
覆盖：
  CR-23  类级 Javadoc 缺失
  CR-24  public 方法缺 Javadoc
  CR-25  @author 格式
  CR-26  @since 日期格式
  CR-27  字段缺少注释（成员变量 / static final 常量 / 枚举常量，行尾 // 注释同样有效）
  CR-28  private / protected 方法缺注释（Javadoc 或行尾 // 均可）

豁免规则（设计目的：避免对"已通过其它机制自描述"的代码强加机械占位注释）：
  · 字段（CR-27）
      1. serialVersionUID —— JDK Serializable 接口约定的版本号字段，无业务含义
      2. 仅被 Mockito 注解修饰的字段：@Mock / @InjectMocks / @Spy / @Captor /
         @MockBean / @SpyBean —— 注解本身已说明字段用途
      3. 仅被 Spring 注入注解修饰的字段：@Autowired / @Resource ——
         「类型 + 注入注解」已等价于"被注入的依赖"，再加 Javadoc 属重复信息
  · 方法（CR-28）
      4. 测试源码（路径含 `src/test`）下的 private / protected 方法 ——
         由所属 @Test 方法的 @DisplayName / 方法名上下文自描述
  · 方法（CR-24/CR-28）通用：向上查找 Javadoc / 单行注释时，可跨过任意条
    数的注解（含多行注解参数 `@Xxx(...)`），避免长注解链导致的误报

用法：python3 check-docs.py <java-file-or-dir>
"""

import sys
import os
import re
import subprocess

RED = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN = '\033[0;32m'
NC = '\033[0m'

errors = 0
warnings = 0

# @author 格式：{git user.name} and AI({工具} - {模型})
# 示例：LvYi and AI(Cursor - claude-sonnet-4-5)
AUTHOR_FORMAT_PATTERN = re.compile(
    r'@author\s+\S.*\s+and\s+AI\s*\(\s*\S[^)]*-\s*\S[^)]*\)'
)
SINCE_PATTERN = re.compile(r'@since\s+(\d{4})/(\d{2})/(\d{2})')
CLASS_JAVADOC_PATTERN = re.compile(r'/\*\*.*?\*/', re.DOTALL)
PUBLIC_METHOD_PATTERN = re.compile(
    r'^\s*public\s+(?:static\s+)?(?:final\s+)?(?:<[^>]+>\s+)?[\w<>\[\],\s]+\s+(\w+)\s*\([^)]*\)'
)
PRIVATE_PROTECTED_METHOD_PATTERN = re.compile(
    r'^\s*(private|protected)\s+(?:static\s+)?(?:final\s+)?(?:<[^>]+>\s+)?[\w<>\[\],\s]+\s+(\w+)\s*\([^)]*\)'
)
# 字段声明：private/protected/public [static] [final] Type name; 或带注解的字段
# 排除方法（含括号），排除 class/interface/enum 关键字
FIELD_PATTERN = re.compile(
    r'^\s*(?:@\w+[^;{(]*\n)*\s*(?:private|protected|public\s+static\s+final|private\s+static\s+final)\s+'
    r'(?:final\s+)?[\w<>\[\]?,\s]+\s+\w+\s*(?:=\s*[^;]+)?;'
)
# 更简单的字段行匹配（单行）：访问修饰符 + 类型 + 变量名 + 可选赋值 + 分号，无括号
FIELD_LINE_PATTERN = re.compile(
    r'^\s*(?:private|protected|public\s+static\s+final|private\s+static\s+final|protected\s+static\s+final)'
    r'\s+(?:final\s+)?[\w<>\[\]?,\s]+\s+\w+\s*(?:=[^;(]*)?\s*;'
)
# 枚举常量行：大写字母开头，后跟逗号或分号（在枚举体内）
ENUM_CONSTANT_PATTERN = re.compile(r'^\s{4}([A-Z][A-Z0-9_]*)\s*(?:\([^)]*\))?\s*[,;]')


def get_git_author():
    """
    获取当前 git 仓库的 user.name。
    优先读 repo 级别配置，回退到全局配置。
    返回空字符串表示未配置。
    """
    try:
        result = subprocess.run(
            ['git', 'config', 'user.name'],
            capture_output=True, text=True, timeout=5
        )
        name = result.stdout.strip()
        return name
    except Exception:
        return ''


# 启动时读一次，全局复用
GIT_AUTHOR = get_git_author()

# CR-27 字段豁免：自描述注解（注解类型 + 字段类型已等价于字段语义）
SELF_DESCRIBING_FIELD_ANNOTATIONS = {
    # Mockito
    'Mock', 'InjectMocks', 'Spy', 'Captor',
    # Spring Boot Test
    'MockBean', 'SpyBean', 'MockitoBean', 'MockitoSpyBean',
    # Spring 依赖注入
    'Autowired', 'Resource',
}

# 噪音注解：与字段语义无关的工具注解，允许与自描述注解共存而不破坏豁免
NOISE_FIELD_ANNOTATIONS = {
    'SuppressWarnings', 'Generated',
}


def find_doc_marker_above(lines, idx, max_lookup=20):
    """
    判断 lines[idx] 上方是否存在 Javadoc（/** ... */）或单行注释（//）。

    扫描逻辑（自下而上）：
        · 跳过空行
        · 跳过注解行（@Xxx、@Xxx(...)、@Xxx(... 多行参数 ...)）
        · 跳过被多行注解参数括号包裹的续行（如 prefix = "...", name = "..."）
        · 遇到 Javadoc 边界（含 /** 或 */）即返回 True
        · 遇到 // 起始的单行注释即返回 True
        · 遇到 *（Javadoc 中间行）继续向上
        · 其它实质代码行 → 返回 False
    """
    paren_balance = 0
    for j in range(idx - 1, max(idx - max_lookup - 1, -1), -1):
        stripped = lines[j].strip()
        if not stripped:
            continue
        opens = stripped.count('(')
        closes = stripped.count(')')
        prev_balance = paren_balance
        paren_balance += closes - opens
        # 处于多行注解括号内部（如 @ConditionalOnProperty( 跨多行）→ 跳过续行
        if prev_balance > 0:
            continue
        if stripped.startswith('@'):
            continue
        # 当前行让 balance 回到非正，但本身是注解头（@Xxx(）：上面已判断；保留兜底
        if paren_balance > 0:
            continue
        if '/**' in stripped or '*/' in stripped:
            return True
        if stripped.startswith('//'):
            return True
        if stripped.startswith('*'):
            continue
        return False
    return False


def collect_field_annotations(lines, idx, max_lookup=8):
    """
    收集 lines[idx] 上方紧邻的连续注解名集合（用于 CR-27 字段豁免判定）。
    跳过空行；遇到非注解、非空行即停止。
    多行注解 `@Xxx(\n    foo = bar\n)` 会被识别为单个注解 Xxx。
    """
    names = set()
    paren_balance = 0
    for j in range(idx - 1, max(idx - max_lookup - 1, -1), -1):
        stripped = lines[j].strip()
        if not stripped:
            continue
        opens = stripped.count('(')
        closes = stripped.count(')')
        prev_balance = paren_balance
        paren_balance += closes - opens
        # 多行注解参数续行：跳过
        if prev_balance > 0:
            continue
        if stripped.startswith('@'):
            m = re.match(r'@(\w+)', stripped)
            if m:
                names.add(m.group(1))
            continue
        # 非注解、非空行 → 停止
        break
    return names


def is_test_path(path):
    """判断是否为测试源码路径（兼容 *nix 与 Windows 路径分隔符）。"""
    normalized = path.replace('\\', '/')
    return '/src/test/' in normalized or normalized.endswith('/src/test') \
        or normalized.startswith('src/test/') or '/src/test/' in '/' + normalized


def print_error(msg):
    global errors
    print(f"{RED}❌ [ERROR]{NC} {msg}")
    errors += 1


def print_warning(msg):
    global warnings
    print(f"{YELLOW}🟡 [WARN] {NC} {msg}")
    warnings += 1


def print_ok(msg):
    print(f"{GREEN}✅ {msg}{NC}")


def check_file(path):
    if not path.endswith('.java'):
        return
    rel = os.path.relpath(path)

    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            content = f.read()
            lines = content.splitlines()
    except Exception as e:
        print_warning(f"无法读取 {rel}: {e}")
        return

    # CR-23  类级 Javadoc 缺失检查
    # 找到类声明行
    class_line_idx = None
    for i, line in enumerate(lines):
        if re.match(r'^\s*(public|abstract|final)\s+(class|interface|enum|@interface)\s+', line):
            class_line_idx = i
            break

    if class_line_idx is not None:
        # 类声明上方允许较长的注解链（Spring Boot @AutoConfiguration 类典型场景），
        # 因此向上扫描直到遇到非注解 / 非空 / 非注释行；只要在 import 之后存在 Javadoc 即视为通过。
        has_class_javadoc = False
        for i in range(class_line_idx - 1, -1, -1):
            stripped = lines[i].strip()
            if not stripped:
                continue
            if stripped.startswith('@'):
                continue
            if stripped.startswith('//'):
                continue
            if '*/' in stripped or stripped.startswith('/**') or stripped.startswith('*'):
                has_class_javadoc = True
                break
            # 遇到 import / package 等其它语句就停止
            break
        if not has_class_javadoc:
            print_warning(f"CR-23 类级 Javadoc 缺失：{rel}:{class_line_idx + 1}")

    # CR-25  @author 格式检查
    # 规范格式：{git user.name} and AI({工具} - {模型})
    # 示例：LvYi and AI(Cursor - claude-sonnet-4-5)
    if '@author' in content:
        author_match = re.search(r'@author\s+(.+)', content)
        if author_match:
            author_val = author_match.group(1).strip()
            if not author_val:
                print_error(f"CR-25 @author 后无内容：{rel}")
            elif not AUTHOR_FORMAT_PATTERN.search(content):
                print_error(
                    f"CR-25 @author 格式不符合规范，应为「{GIT_AUTHOR or '姓名'} and AI(工具 - 模型)」"
                    f"（当前：{author_val}）：{rel}"
                )
            elif GIT_AUTHOR:
                # 进一步检查：@author 中的姓名部分是否与 git user.name 一致
                # 提取 and AI 之前的姓名部分
                name_match = re.search(r'@author\s+(.+?)\s+and\s+AI\s*\(', content)
                if name_match:
                    author_name = name_match.group(1).strip()
                    if author_name != GIT_AUTHOR:
                        print_error(
                            f"CR-25 @author 姓名与 git user.name 不一致："
                            f"文件中「{author_name}」≠ git 配置「{GIT_AUTHOR}」：{rel}"
                        )
    else:
        # 类文件必须有 @author
        if class_line_idx is not None:
            print_error(f"CR-25 缺少 @author 标签：{rel}")

    # CR-26  @since 日期格式检查（yyyy/MM/dd）
    if '@since' in content:
        since_match = re.search(r'@since\s+(.+)', content)
        if since_match:
            since_val = since_match.group(1).strip()
            if not SINCE_PATTERN.search(content):
                print_warning(f"CR-26 @since 日期格式应为 yyyy/MM/dd（当前：{since_val}）：{rel}")

    # CR-24  public 方法缺 Javadoc 检查
    # 逐行扫描，找 public 方法；向上跨过任意条注解（含多行参数）查找 Javadoc。
    skip_keywords = {'class', 'interface', 'enum', 'abstract'}
    for i, line in enumerate(lines):
        m = PUBLIC_METHOD_PATTERN.match(line)
        if not m:
            continue
        method_name = m.group(1)
        # 跳过构造方法名与类名相同的情况（已由类 Javadoc 覆盖）
        if method_name in skip_keywords:
            continue
        # 排除 @Override 方法与 @Test 方法（不强制 Javadoc）
        pre_lines = '\n'.join(lines[max(0, i - 5):i])
        if '@Override' in pre_lines or '@Test' in pre_lines:
            continue
        if find_doc_marker_above(lines, i):
            continue
        print_warning(f"CR-24 public 方法缺少 Javadoc：{rel}:{i + 1} [{method_name}]")

    # CR-27  字段缺少注释（成员变量 / static final 常量 / 枚举常量）
    # 行尾 // 注释、上一行 // 注释、或 Javadoc /** */ 均视为有效注释
    is_enum = re.search(r'\benum\s+\w+', content) is not None
    in_enum_body = False
    brace_depth = 0
    for i, line in enumerate(lines):
        stripped = line.strip()

        # 简单跟踪大括号，判断是否进入枚举体
        brace_depth += stripped.count('{') - stripped.count('}')

        # 进入/离开枚举体
        if is_enum and re.search(r'\benum\s+\w+', line):
            in_enum_body = True

        # 跳过空行、纯注释行、注解行、import/package
        if not stripped or stripped.startswith('//') or stripped.startswith('*') \
                or stripped.startswith('/*') or stripped.startswith('@') \
                or stripped.startswith('import ') or stripped.startswith('package '):
            continue

        # --- 枚举常量检查 ---
        if in_enum_body and brace_depth >= 1:
            enum_m = ENUM_CONSTANT_PATTERN.match(line)
            if enum_m:
                has_comment = (
                    '//' in line or
                    (i > 0 and '//' in lines[i - 1]) or
                    any('*/' in lines[j] or '/**' in lines[j]
                        for j in range(max(0, i - 4), i))
                )
                if not has_comment:
                    print_warning(
                        f"CR-27 枚举常量缺少注释（行尾 // 或 Javadoc 均可）："
                        f"{rel}:{i + 1} [{enum_m.group(1)}]"
                    )
            continue

        # --- 普通字段检查 ---
        if not FIELD_LINE_PATTERN.match(line):
            continue
        # 跳过方法参数中的局部变量（字段行不含括号，方法内局部变量已被过滤）
        if '(' in line or ')' in line:
            continue

        has_comment = (
            '//' in line or                                          # 行尾注释
            (i > 0 and stripped and lines[i - 1].strip().startswith('//')) or  # 上一行单行注释
            any('*/' in lines[j] or '/**' in lines[j]
                for j in range(max(0, i - 5), i))                   # Javadoc
        )
        if has_comment:
            continue

        # 提取字段名（最后一个单词，位于 = 或 ; 之前）
        field_name_m = re.search(r'\b(\w+)\s*(?:=\s*[^;]+)?\s*;', line)
        fname = field_name_m.group(1) if field_name_m else '?'

        # 豁免 1：serialVersionUID 是 JDK Serializable 约定字段，无业务含义
        if fname == 'serialVersionUID':
            continue

        # 豁免 2/3：仅被 Mockito / Spring DI 注解（可叠加噪音注解）修饰的字段视为已自描述
        annos = collect_field_annotations(lines, i)
        if annos:
            describing = annos & SELF_DESCRIBING_FIELD_ANNOTATIONS
            other = annos - SELF_DESCRIBING_FIELD_ANNOTATIONS - NOISE_FIELD_ANNOTATIONS
            if describing and not other:
                continue

        print_warning(
            f"CR-27 字段缺少注释（行尾 // 或 Javadoc 均可）："
            f"{rel}:{i + 1} [{fname}]"
        )

    # CR-28  private / protected 方法缺注释
    # Javadoc /** */ 或紧邻上方的 // 单行注释均视为有效（多行注解链全部跨过）。
    # 豁免：测试源码（src/test）下的 private/protected helper 方法整体不强制注释。
    is_test = is_test_path(rel) or is_test_path(path)
    for i, line in enumerate(lines):
        m = PRIVATE_PROTECTED_METHOD_PATTERN.match(line)
        if not m:
            continue
        method_name = m.group(2)
        if method_name in skip_keywords:
            continue

        # 行尾注释直接算有效
        if '//' in line:
            continue

        pre_lines = '\n'.join(lines[max(0, i - 3):i])
        if '@Override' in pre_lines or '@Test' in pre_lines:
            continue

        # 豁免 4：测试源码下的 helper 方法不强制注释
        if is_test:
            continue

        if find_doc_marker_above(lines, i):
            continue

        print_warning(
            f"CR-28 private/protected 方法缺少注释（Javadoc 或方法前 // 均可）："
            f"{rel}:{i + 1} [{method_name}]"
        )


def main():
    if len(sys.argv) < 2:
        print("用法：python3 check-docs.py <java-file-or-dir>")
        sys.exit(1)

    print("============================================")
    print("  java-code-review / check-docs.py")
    if GIT_AUTHOR:
        print(f"  git user.name = {GIT_AUTHOR}")
        print(f"  期望 @author 格式：{GIT_AUTHOR} and AI(工具 - 模型)")
    else:
        print("  ⚠️  未读取到 git user.name，跳过姓名一致性检查")
        print("     请执行：git config user.name '你的名字'")
    print("============================================")

    for target in sys.argv[1:]:
        if os.path.isfile(target):
            check_file(target)
        elif os.path.isdir(target):
            for root, dirs, files in os.walk(target):
                dirs[:] = [d for d in dirs if d not in ['target', '.git', 'node_modules']]
                for fname in files:
                    if fname.endswith('.java'):
                        check_file(os.path.join(root, fname))
        else:
            print_warning(f"路径不存在：{target}")

    print()
    print("============================================")
    if errors > 0:
        print(f"{RED}❌ 检查完成：{errors} 个阻断错误，{warnings} 个警告{NC}")
        sys.exit(1)
    elif warnings > 0:
        print(f"{YELLOW}🟡 检查完成：0 个阻断错误，{warnings} 个警告{NC}")
    else:
        print_ok("全部通过，文档注释规范")


if __name__ == '__main__':
    main()
