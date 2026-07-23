#!/usr/bin/env python3
"""
java-project-structure/scripts/check-yaml.py
项目级 YAML + 启动类规范检测：

  YM-01  spring.application.name 格式须为 {service}-service
  YM-02  server.servlet.context-path 须为 /api/v1/{service}
  YM-03  服务端口须符合约定（system=10001 / platform=10002 / integration=10003 /
          hire=10004 / assess=10005），不同服务端口不可复用
  YM-04  spring.config.import 须包含 comp-redis 和 comp-rocket（通过 optional:nacos:）
  YM-05  spring.application.name 须与所在 web 模块目录名一致
  AP-01  启动类须有 @SpringBootApplication(scanBasePackages = "com.succaiss.{service}")
  AP-02  启动类须有 @MapperScan("com.succaiss.{service}.service.mapper")
  AP-03  启动类 @EnableFeignClients 须用 basePackages = "com.succaiss"（不可写具体子包）
  AP-04  启动类须在 *-web 模块，不能在 *-service / *-api
用法：python3 check-yaml.py <项目根目录>
"""

import sys
import os
import re
from pathlib import Path

RED    = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN  = '\033[0;32m'
NC     = '\033[0m'

errors   = 0
warnings = 0

# 服务名 → 约定端口
SERVICE_PORTS = {
    'system':      10001,
    'platform':    10002,
    'integration': 10003,
    'hire':        10004,
    'assess':      10005,
}


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


def infer_service_from_path(yml_path: Path) -> str:
    """从文件路径猜测所属服务名"""
    for part in yml_path.parts:
        for svc in SERVICE_PORTS:
            if svc in part:
                return svc
    return ''


def check_yaml(yml_path: Path):
    rel = os.path.relpath(str(yml_path))
    try:
        content = yml_path.read_text(encoding='utf-8', errors='replace')
    except Exception as e:
        print_warning(f"读取 YAML 失败 {rel}: {e}")
        return

    # ── YM-01  spring.application.name ────────────────────────────────
    app_name_match = re.search(r'spring:\s*\n(?:\s+[^\n]*\n)*?\s+application:\s*\n\s+name:\s*(\S+)',
                               content, re.MULTILINE)
    if not app_name_match:
        # 也尝试同行写法
        app_name_match = re.search(r'name:\s*(\S+)', content)

    app_name = app_name_match.group(1).strip() if app_name_match else ''

    if app_name:
        if not app_name.endswith('-service'):
            print_error(
                f"YM-01 spring.application.name 须以 '-service' 结尾"
                f"（如 assess-service），当前：{app_name}：{rel}"
            )
        # 额外验证服务名部分
        svc_from_name = app_name.replace('-service', '')
        if svc_from_name not in SERVICE_PORTS:
            print_warning(
                f"YM-01 spring.application.name [{app_name}] 中的服务名"
                f" [{svc_from_name}] 不在已知服务列表（{list(SERVICE_PORTS.keys())}）：{rel}"
            )
    else:
        print_warning(f"YM-01 未检测到 spring.application.name：{rel}")

    # ── YM-02  context-path ────────────────────────────────────────────
    ctx_match = re.search(r'context-path:\s*(\S+)', content)
    if ctx_match:
        ctx = ctx_match.group(1).strip()
        if not re.match(r'^/api/v\d+/[a-z]+$', ctx):
            print_warning(
                f"YM-02 context-path 格式建议为 /api/v1/{{service}}，当前：{ctx}：{rel}"
            )
        else:
            # 校验与 application.name 一致
            svc_from_ctx = ctx.split('/')[-1]
            svc_from_name = app_name.replace('-service', '') if app_name else ''
            if svc_from_name and svc_from_ctx != svc_from_name:
                print_error(
                    f"YM-02 context-path 中的服务名 [{svc_from_ctx}] 与 "
                    f"application.name [{app_name}] 不一致：{rel}"
                )
    else:
        print_warning(f"YM-02 未检测到 context-path 配置：{rel}")

    # ── YM-03  端口约定 ────────────────────────────────────────────────
    port_match = re.search(r'port:\s*(\d+)', content)
    if port_match:
        port = int(port_match.group(1))
        svc = infer_service_from_path(yml_path)
        if svc and svc in SERVICE_PORTS:
            expected_port = SERVICE_PORTS[svc]
            if port != expected_port:
                print_error(
                    f"YM-03 服务 [{svc}] 约定端口为 {expected_port}，"
                    f"当前配置 port: {port}：{rel}"
                )

    # ── YM-04  Nacos config.import 必须导入 comp-redis 和 comp-rocket ──
    has_redis  = 'comp-redis'  in content
    has_rocket = 'comp-rocket' in content
    if not has_redis:
        print_warning(
            f"YM-04 spring.config.import 缺少 comp-redis（Redis 连接配置），"
            f"服务运行时可能无法连接 Redis：{rel}"
        )
    if not has_rocket:
        print_warning(
            f"YM-04 spring.config.import 缺少 comp-rocket（RocketMQ 连接配置）：{rel}"
        )

    # ── YM-05  application.name 与 web 模块目录名一致 ──────────────────
    if app_name:
        svc_from_name = app_name.replace('-service', '')
        # web 模块路径应含服务名
        if svc_from_name and svc_from_name not in str(yml_path):
            print_warning(
                f"YM-05 application.name [{app_name}] 所在路径不含服务名 [{svc_from_name}]，"
                f"请确认配置文件放置位置正确：{rel}"
            )


def check_application_class(java_path: Path):
    rel = os.path.relpath(str(java_path))
    try:
        content = java_path.read_text(encoding='utf-8', errors='replace')
    except Exception as e:
        print_warning(f"读取启动类失败 {rel}: {e}")
        return

    # 判断是否是启动类（含 SpringApplication.run 或 @SpringBootApplication）
    if 'SpringApplication.run' not in content and '@SpringBootApplication' not in content:
        return

    # 推断服务名
    svc = ''
    for s in SERVICE_PORTS:
        if s in str(java_path).lower():
            svc = s
            break

    # ── AP-01  @SpringBootApplication 须有 scanBasePackages ──────────
    sba_match = re.search(r'@SpringBootApplication(\([^)]*\))?', content)
    if sba_match:
        annotation_body = sba_match.group(1) or ''
        if 'scanBasePackages' not in annotation_body:
            print_error(
                f"AP-01 @SpringBootApplication 缺少 scanBasePackages"
                f"（应配置 com.succaiss.{svc if svc else '{service}'}）：{rel}"
            )
        elif svc:
            expected = f'com.succaiss.{svc}'
            if expected not in annotation_body:
                print_error(
                    f"AP-01 scanBasePackages 应为 \"{expected}\"，"
                    f"当前：{annotation_body.strip()}：{rel}"
                )
    else:
        print_warning(f"AP-01 未找到 @SpringBootApplication 注解：{rel}")

    # ── AP-02  @MapperScan 须有正确包路径 ─────────────────────────────
    mapper_scan_match = re.search(r'@MapperScan\("([^"]+)"\)', content)
    if mapper_scan_match:
        mapper_pkg = mapper_scan_match.group(1)
        if svc and not mapper_pkg.endswith(f'{svc}.service.mapper'):
            print_error(
                f"AP-02 @MapperScan 包路径应为 com.succaiss.{svc}.service.mapper，"
                f"当前：{mapper_pkg}：{rel}"
            )
    else:
        if '@MapperScan' in content:
            pass  # 多参数形式，跳过
        else:
            print_warning(f"AP-02 启动类缺少 @MapperScan 注解：{rel}")

    # ── AP-03  @EnableFeignClients 须用 basePackages = "com.succaiss" ─
    feign_match = re.search(r'@EnableFeignClients(\([^)]*\))?', content)
    if feign_match:
        feign_body = feign_match.group(1) or ''
        if feign_body == '':
            # 无参数形式，没问题
            pass
        elif 'basePackages' not in feign_body:
            print_error(
                f"AP-03 @EnableFeignClients 应使用 basePackages = \"com.succaiss\""
                f"（禁止写具体子包，避免新增跨服务依赖时反复改启动类）：{rel}"
            )
        else:
            if '"com.succaiss"' not in feign_body and "'com.succaiss'" not in feign_body:
                # 可能写了子包路径
                print_error(
                    f"AP-03 @EnableFeignClients basePackages 应为 \"com.succaiss\""
                    f"（全包扫描），当前：{feign_body.strip()}：{rel}"
                )
    else:
        print_warning(f"AP-03 启动类缺少 @EnableFeignClients 注解，Feign 调用将不可用：{rel}")

    # ── AP-04  启动类须在 *-web 模块 ──────────────────────────────────
    path_str = str(java_path)
    in_web = '-web' in path_str or '/web/' in path_str
    in_service_module = ('-service' in path_str and '/service/' in path_str
                         and '-web' not in path_str)
    in_api_module = '-api' in path_str and '-web' not in path_str

    if in_service_module or in_api_module:
        print_error(
            f"AP-04 Spring Boot 启动类只能放在 *-web 模块，"
            f"当前放在 service/api 模块：{rel}"
        )


def main():
    if len(sys.argv) < 2:
        print("用法：python3 check-yaml.py <项目根目录>")
        sys.exit(1)

    root = sys.argv[1]
    if not os.path.isdir(root):
        print(f"路径不存在：{root}")
        sys.exit(1)

    print("============================================")
    print("  java-project-structure / check-yaml.py")
    print(f"  扫描根目录：{root}")
    print("============================================")

    # ── 扫描 application.yml ──────────────────────────────────────────
    yml_files = [
        p for p in Path(root).rglob('application.yml')
        if 'target' not in p.parts and 'test' not in p.parts
    ]
    print(f"\n  发现 {len(yml_files)} 个 application.yml\n")

    for yml_path in sorted(yml_files):
        # 只检查 web 模块的配置（启动入口）
        if '-web' not in str(yml_path) and '/web/' not in str(yml_path):
            continue
        check_yaml(yml_path)

    # ── 扫描启动类（*Application.java 且含 SpringApplication.run）────
    print()
    app_classes = [
        p for p in Path(root).rglob('*Application.java')
        if 'target' not in p.parts and 'test' not in p.parts
    ]
    print(f"  发现 {len(app_classes)} 个 Application 启动类\n")
    for java_path in sorted(app_classes):
        check_application_class(java_path)

    print()
    print("============================================")
    if errors > 0:
        print(f"{RED}❌ 检查完成：{errors} 个阻断错误，{warnings} 个警告{NC}")
        sys.exit(1)
    elif warnings > 0:
        print(f"{YELLOW}🟡 检查完成：0 个阻断错误，{warnings} 个警告{NC}")
    else:
        print_ok("全部通过，YAML / 启动类规范检查无问题")


if __name__ == '__main__':
    main()
