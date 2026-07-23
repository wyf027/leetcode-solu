#!/usr/bin/env python3
"""
java-project-structure/scripts/check-structure.py
覆盖：
  PS-02  模块依赖方向（web→service→api，禁止反向）
  PS-04  端口号冲突
  PS-05  pom.xml 基本规范（groupId/version 变量化）
  PS-06  Entity/Mapper 不应在 web 模块
  PS-07  Controller 不应在 service 模块
  PS-08  跨服务调用必须通过 .api. 包（禁止直接导入其他服务 .service/.entity/.mapper）
  PS-09  包命名规范（com.succaiss.{svc}.{module}.{layer}）
  PS-10  web 模块必须有 XxxApplication 启动类
  PS-11  service 模块包结构完整性（entity/mapper/service 三包必须存在）
  API-07 api 模块引入 service 依赖
用法：python3 check-structure.py <项目根目录>
"""

import sys
import os
import re
from pathlib import Path
from collections import defaultdict

RED = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN = '\033[0;32m'
NC = '\033[0m'

errors = 0
warnings = 0


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


def parse_pom_dependencies(pom_path):
    """简单提取 pom.xml 中的 <artifactId> 列表"""
    try:
        content = Path(pom_path).read_text(encoding='utf-8', errors='replace')
    except Exception:
        return []

    deps = re.findall(r'<artifactId>([^<]+)</artifactId>', content)
    return deps


def check_ps02_ps05_api07(root):
    """PS-02 模块依赖方向 + API-07 api 模块引入 service 依赖"""
    print("\n【PS-02 / API-07】检查模块依赖方向...")

    # 规则：web 模块可依赖 service、api；service 模块可依赖 api；api 不能依赖 service/web
    violation_found = False
    for pom_path in Path(root).rglob('pom.xml'):
        parts = pom_path.parts
        if 'target' in parts:
            continue

        # 判断当前 pom 属于哪层
        pom_dir = str(pom_path.parent.name)
        deps = parse_pom_dependencies(str(pom_path))

        if pom_dir.endswith('-api'):
            # api 模块不能依赖 service / web
            for dep in deps:
                if dep.endswith('-service') or dep.endswith('-web'):
                    print_error(
                        f"API-07/PS-02 api 模块 [{pom_dir}] 反向依赖了 service/web 模块 [{dep}]："
                        f"{os.path.relpath(str(pom_path))}"
                    )
                    violation_found = True

        elif pom_dir.endswith('-service'):
            # service 模块不能依赖 web
            for dep in deps:
                if dep.endswith('-web'):
                    print_error(
                        f"PS-02 service 模块 [{pom_dir}] 反向依赖了 web 模块 [{dep}]："
                        f"{os.path.relpath(str(pom_path))}"
                    )
                    violation_found = True

    if not violation_found:
        print_ok("PS-02/API-07 通过，模块依赖方向正确")


def check_ps04(root):
    """PS-04 端口号冲突检查"""
    print("\n【PS-04】检查 application.yml 端口号冲突...")

    port_map = defaultdict(list)
    for yml_path in Path(root).rglob('application.yml'):
        parts = yml_path.parts
        if 'target' in parts or 'test' in parts:
            continue
        try:
            content = yml_path.read_text(encoding='utf-8', errors='replace')
        except Exception:
            continue

        # 提取 port: xxxx
        m = re.search(r'port\s*:\s*(\d+)', content)
        if m:
            port = int(m.group(1))
            port_map[port].append(str(yml_path))

    conflict = False
    for port, files in port_map.items():
        if len(files) > 1:
            print_error(f"PS-04 端口号 {port} 冲突，被以下配置文件同时使用：{files}")
            conflict = True

    if not conflict:
        print_ok(f"PS-04 通过，共扫描 {len(port_map)} 个端口配置，无冲突")


def check_ps06_ps07(root):
    """PS-06 Entity/Mapper 在 web 模块；PS-07 Controller 在 service 模块"""
    print("\n【PS-06 / PS-07】检查文件分层位置...")

    violation = False
    for java_path in Path(root).rglob('*.java'):
        parts = java_path.parts
        if 'target' in parts or 'test' in parts:
            continue

        path_str = str(java_path)
        fname = java_path.name

        # PS-06  Entity/Mapper 在 web 模块
        if ('-web' in path_str or '/web/' in path_str) and \
           (fname.endswith('Entity.java') or fname.endswith('Mapper.java')):
            print_error(
                f"PS-06 Entity/Mapper 不应放在 web 模块（应在 service 模块）："
                f"{os.path.relpath(path_str)}"
            )
            violation = True

        # PS-07  Controller 在 service 模块
        if ('-service' in path_str or '/service/' in path_str) and \
           fname.endswith('Controller.java') and \
           '-web' not in path_str:
            print_error(
                f"PS-07 Controller 不应放在 service 模块（应在 web 模块）："
                f"{os.path.relpath(path_str)}"
            )
            violation = True

    if not violation:
        print_ok("PS-06/PS-07 通过，文件分层位置正确")


def check_ps05(root):
    """PS-05 新建微服务 pom.xml 规范"""
    print("\n【PS-05】检查 pom.xml 基本规范...")

    for pom_path in Path(root).rglob('pom.xml'):
        parts = pom_path.parts
        if 'target' in parts:
            continue
        try:
            content = pom_path.read_text(encoding='utf-8', errors='replace')
        except Exception:
            continue

        rel = os.path.relpath(str(pom_path))

        # 检查 groupId 是否使用变量（避免硬编码）
        if re.search(r'<groupId>(?!\$\{)[a-z]', content):
            # 允许父 pom 有 groupId
            if not re.search(r'<parent>', content):
                print_warning(f"PS-05 pom.xml 的 groupId 建议从父 pom 继承，避免重复声明：{rel}")

        # 检查 version 是否使用变量
        own_version = re.search(r'<version>(?!\$\{)[0-9]', content)
        if own_version and re.search(r'<parent>', content):
            print_warning(
                f"PS-05 子模块 pom.xml 的 version 建议通过 ${{revision}} 等变量统一管理：{rel}"
            )


def check_ps08(root):
    """PS-08 跨服务调用必须通过 .api. 包，禁止直接导入其他服务的 .service/.entity/.mapper"""
    print("\n【PS-08】检查跨服务导入规范（必须通过 .api. 包）...")

    # 识别当前项目属于哪个服务（从目录名提取）
    root_name = Path(root).name  # 如 assess、hire
    known_services = ['system', 'platform', 'integration', 'hire', 'assess']

    # 禁止跨服务直接导入的层
    forbidden_layers = ['service', 'entity', 'mapper', 'web', 'controller', 'repository']

    violation = False
    for java_path in Path(root).rglob('*.java'):
        parts = java_path.parts
        if 'target' in parts or 'test' in parts:
            continue

        try:
            content = java_path.read_text(encoding='utf-8', errors='replace')
        except Exception:
            continue

        for line_no, line in enumerate(content.splitlines(), 1):
            line = line.strip()
            if not line.startswith('import com.succaiss.'):
                continue

            # 提取导入的服务名
            m = re.match(r'import com\.succaiss\.(\w+)\.(\w+)\.', line)
            if not m:
                continue

            imported_svc = m.group(1)
            imported_module = m.group(2)

            # 跳过自身服务的导入
            if imported_svc == root_name or imported_svc not in known_services:
                continue

            # 导入其他服务的非 api 层 → 违规
            if imported_module in forbidden_layers:
                print_error(
                    f"PS-08 跨服务导入必须通过 .api. 包，"
                    f"禁止直接导入 [{imported_svc}.{imported_module}]："
                    f"{os.path.relpath(str(java_path))}:{line_no}  {line}"
                )
                violation = True

    if not violation:
        print_ok("PS-08 通过，跨服务调用均通过 .api. 包")


def check_ps09(root):
    """PS-09 包命名规范：Java 包名须符合 com.succaiss.{svc}.{module}.{layer} 层次"""
    print("\n【PS-09】检查包命名规范...")

    root_name = Path(root).name

    # 允许的顶层 layer 包名
    allowed_api_layers     = {'feign', 'dto', 'vo', 'message', 'constant', 'enums', 'event'}
    allowed_service_layers = {'entity', 'mapper', 'service', 'convert', 'dto', 'vo', 'enums',
                               'constant', 'config', 'listener', 'handler', 'util', 'cache', 'event'}
    allowed_web_layers     = {'controller', 'convert', 'vo', 'config'}

    violation = False
    for java_path in Path(root).rglob('*.java'):
        parts = java_path.parts
        if 'target' in parts or 'test' in parts:
            continue

        try:
            first_lines = java_path.read_text(encoding='utf-8', errors='replace').splitlines()[:5]
        except Exception:
            continue

        pkg_line = next((l.strip() for l in first_lines if l.strip().startswith('package ')), None)
        if not pkg_line:
            continue

        pkg = pkg_line[len('package '):].rstrip(';').strip()

        # 必须以 com.succaiss. 开头
        if not pkg.startswith('com.succaiss.'):
            print_warning(f"PS-09 包名不符合规范（应以 com.succaiss. 开头）：{pkg} → {os.path.relpath(str(java_path))}")
            violation = True
            continue

        parts_pkg = pkg.split('.')
        if len(parts_pkg) < 5:
            # com.succaiss.{svc}.{module} 至少 4 段，但 Application 类可能在第 4 段
            continue

        svc    = parts_pkg[2]   # assess / hire / ...
        module = parts_pkg[3]   # service / web / api
        layer  = parts_pkg[4] if len(parts_pkg) > 4 else ''

        if not layer:
            continue  # Application 类在模块根包，允许

        if module == 'api':
            if layer not in allowed_api_layers:
                print_warning(
                    f"PS-09 api 模块不应有 [{layer}] 包（允许：{sorted(allowed_api_layers)}）："
                    f"{os.path.relpath(str(java_path))}"
                )
                violation = True
        elif module == 'service':
            if layer not in allowed_service_layers:
                print_warning(
                    f"PS-09 service 模块出现非规范包 [{layer}]（允许：{sorted(allowed_service_layers)}）："
                    f"{os.path.relpath(str(java_path))}"
                )
                violation = True
        elif module == 'web':
            if layer not in allowed_web_layers:
                print_warning(
                    f"PS-09 web 模块出现非规范包 [{layer}]（允许：{sorted(allowed_web_layers)}）："
                    f"{os.path.relpath(str(java_path))}"
                )
                violation = True

    if not violation:
        print_ok("PS-09 通过，包命名规范")


def check_ps10(root):
    """PS-10 web 模块必须有 XxxApplication 启动类"""
    print("\n【PS-10】检查 web 模块启动类...")

    violation = False
    for web_dir in Path(root).glob('*-web'):
        if not web_dir.is_dir():
            continue

        java_src = web_dir / 'src' / 'main' / 'java'
        if not java_src.exists():
            continue

        app_files = list(java_src.rglob('*Application.java'))
        if not app_files:
            print_error(
                f"PS-10 web 模块 [{web_dir.name}] 缺少启动类（*Application.java）"
            )
            violation = True
        else:
            # 检查启动类是否有 @SpringBootApplication
            for app_file in app_files:
                try:
                    content = app_file.read_text(encoding='utf-8', errors='replace')
                except Exception:
                    continue
                if '@SpringBootApplication' not in content:
                    print_warning(
                        f"PS-10 启动类 [{app_file.name}] 缺少 @SpringBootApplication 注解："
                        f"{os.path.relpath(str(app_file))}"
                    )
                    violation = True

    if not violation:
        print_ok("PS-10 通过，web 模块启动类存在且规范")


def check_ps11(root):
    """PS-11 service 模块包结构完整性（entity/mapper/service 三包必须存在）"""
    print("\n【PS-11】检查 service 模块包结构完整性...")

    required_layers = ['entity', 'mapper', 'service']
    violation = False

    for svc_dir in Path(root).glob('*-service'):
        if not svc_dir.is_dir():
            continue

        java_src = svc_dir / 'src' / 'main' / 'java'
        if not java_src.exists():
            continue

        # 找到实际包根
        found_layers = set()
        for d in java_src.rglob('*'):
            if d.is_dir() and d.name in required_layers:
                found_layers.add(d.name)

        missing = [l for l in required_layers if l not in found_layers]
        if missing:
            print_error(
                f"PS-11 service 模块 [{svc_dir.name}] 缺少必要包：{missing}（entity/mapper/service 三包必须存在）"
            )
            violation = True

    if not violation:
        print_ok("PS-11 通过，service 模块包结构完整")


def main():
    if len(sys.argv) < 2:
        print("用法：python3 check-structure.py <项目根目录>")
        sys.exit(1)

    root = sys.argv[1]
    if not os.path.isdir(root):
        print(f"路径不存在：{root}")
        sys.exit(1)

    print("============================================")
    print("  java-project-structure / check-structure.py")
    print(f"  扫描根目录：{root}")
    print("============================================")

    check_ps02_ps05_api07(root)
    check_ps04(root)
    check_ps05(root)
    check_ps06_ps07(root)
    check_ps08(root)
    check_ps09(root)
    check_ps10(root)
    check_ps11(root)

    print()
    print("============================================")
    if errors > 0:
        print(f"{RED}❌ 检查完成：{errors} 个阻断错误，{warnings} 个警告{NC}")
        sys.exit(1)
    elif warnings > 0:
        print(f"{YELLOW}🟡 检查完成：0 个阻断错误，{warnings} 个警告{NC}")
    else:
        print_ok("全部通过，项目结构规范")


if __name__ == '__main__':
    main()
