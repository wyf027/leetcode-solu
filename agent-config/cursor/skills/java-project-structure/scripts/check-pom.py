#!/usr/bin/env python3
"""
java-project-structure/scripts/check-pom.py
覆盖 pom.xml 规范检测：
  POM-01  api 模块禁止引入 common-spring / common-gateway-starter / web 相关重量依赖
  POM-02  api 模块反向依赖 service/web（PS-02/API-07）
  POM-03  service 模块必须依赖本服务 {service}-api
  POM-04  service 模块反向依赖 web
  POM-05  web 模块必须有 spring-boot-maven-plugin（否则无法打 Fat Jar）
  POM-06  web 模块必须依赖 common-gateway-starter
  POM-07  所有子模块 groupId 应为 com.succaiss
  POM-08  子模块 version 不应硬编码（应从父继承）
  POM-09  服务根 pom 缺少 modules 声明（api/service/web 三子模块）
  POM-10  service 模块不应引入 common-gateway-starter（太重）
  POM-11  api 模块中不应有 Entity/Mapper/Controller/Swagger 依赖
用法：python3 check-pom.py <项目根目录>
"""

import sys
import os
import re
from pathlib import Path
import xml.etree.ElementTree as ET

RED   = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN  = '\033[0;32m'
NC    = '\033[0m'

errors = 0
warnings = 0

GROUP_ID = 'com.succaiss'
PARENT_ARTIFACT = 'antview-parent'

# api 模块禁止引入的重量依赖（包含传递大依赖的 starter）
API_BANNED_DEPS = {
    'common-spring',
    'common-gateway-starter',
    'spring-boot-starter-web',
    'spring-boot-starter-data-jpa',
    'mybatis-plus-boot-starter',
    'spring-boot-starter-security',
}

# service 模块禁止引入的依赖
SERVICE_BANNED_DEPS = {
    'common-gateway-starter',
    'spring-cloud-starter-gateway',
}

# api 模块禁止引入的框架（暗示业务逻辑）
API_LOGIC_DEPS = {
    'springdoc-openapi',
    'springfox-boot-starter',
    'swagger',
    'mybatis',
    'jpa',
    'hibernate',
}

NS = {'m': 'http://maven.apache.org/POM/4.0.0'}


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


def parse_pom(pom_path):
    """解析 pom.xml，返回 dict，包含 artifactId、parent、dependencies、modules 等"""
    try:
        tree = ET.parse(str(pom_path))
        root = tree.getroot()
    except ET.ParseError as e:
        print_warning(f"pom.xml 解析失败 {pom_path}: {e}")
        return None

    def text(el):
        return el.text.strip() if el is not None and el.text else ''

    def find(tag):
        result = root.find(f'm:{tag}', NS)
        if result is None:
            result = root.find(tag)
        return result

    def find_all(parent_el, tag):
        result = parent_el.findall(f'm:{tag}', NS)
        if not result:
            result = parent_el.findall(tag)
        return result

    def find_child(parent_el, tag):
        result = parent_el.find(f'm:{tag}', NS)
        if result is None:
            result = parent_el.find(tag)
        return result

    artifact_id = text(find('artifactId'))
    group_id    = text(find('groupId'))
    version     = text(find('version'))
    packaging   = text(find('packaging')) or 'jar'

    parent_el = find('parent')
    parent_artifact = ''
    parent_group    = ''
    if parent_el is not None:
        parent_artifact = text(find_child(parent_el, 'artifactId'))
        parent_group    = text(find_child(parent_el, 'groupId'))

    # 子模块列表
    modules_el = find('modules')
    modules = []
    if modules_el is not None:
        for m in find_all(modules_el, 'module'):
            modules.append(text(m))

    # 依赖列表（仅 <dependencies>，不含 <dependencyManagement>）
    deps_el = find('dependencies')
    deps = []
    if deps_el is not None:
        for dep in find_all(deps_el, 'dependency'):
            g = text(find_child(dep, 'groupId'))
            a = text(find_child(dep, 'artifactId'))
            s = text(find_child(dep, 'scope'))
            deps.append({'groupId': g, 'artifactId': a, 'scope': s})

    # plugins
    build_el = find('build')
    plugins = []
    if build_el is not None:
        plugins_el = find_child(build_el, 'plugins')
        if plugins_el is not None:
            for p in find_all(plugins_el, 'plugin'):
                a = text(find_child(p, 'artifactId'))
                plugins.append(a)

    return {
        'path': str(pom_path),
        'rel': os.path.relpath(str(pom_path)),
        'artifactId': artifact_id,
        'groupId': group_id,
        'version': version,
        'packaging': packaging,
        'parentArtifact': parent_artifact,
        'parentGroup': parent_group,
        'modules': modules,
        'deps': deps,
        'dep_ids': {d['artifactId'] for d in deps},
        'plugins': plugins,
    }


def dep_ids(pom):
    return pom['dep_ids']


def check_api_module(pom):
    rel = pom['rel']

    # POM-01  api 模块禁止引入重量依赖
    banned = dep_ids(pom) & API_BANNED_DEPS
    if banned:
        for b in sorted(banned):
            print_error(
                f"POM-01 api 模块引入了禁用依赖 [{b}]"
                f"（api 层只允许 common-openfeign-starter）：{rel}"
            )

    # POM-11  api 模块不应有 Swagger/ORM 依赖
    for dep_id in dep_ids(pom):
        for banned_kw in API_LOGIC_DEPS:
            if banned_kw.lower() in dep_id.lower():
                print_error(
                    f"POM-11 api 模块引入了业务框架依赖 [{dep_id}]"
                    f"（api 层禁止 Swagger/Mybatis/JPA 等）：{rel}"
                )

    # POM-02  api 反向依赖 service/web
    for dep in pom['deps']:
        a = dep['artifactId']
        if a.endswith('-service') or a.endswith('-web'):
            print_error(
                f"POM-02 api 模块反向依赖了 [{a}]"
                f"（api 禁止依赖 service/web）：{rel}"
            )

    # 验证 common-openfeign-starter 存在
    if 'common-openfeign-starter' not in dep_ids(pom):
        print_warning(
            f"POM-01 api 模块缺少 common-openfeign-starter 依赖"
            f"（api 层的标准唯一依赖）：{rel}"
        )


def check_service_module(pom, service_name):
    rel = pom['rel']

    # POM-03  service 模块必须依赖本服务 {service}-api
    api_dep = f"{service_name}-api"
    if api_dep not in dep_ids(pom):
        print_error(
            f"POM-03 service 模块缺少对本服务 api 的依赖 [{api_dep}]：{rel}"
        )

    # POM-04  service 反向依赖 web
    for dep in pom['deps']:
        a = dep['artifactId']
        if a.endswith('-web'):
            print_error(
                f"POM-04 service 模块反向依赖了 web 模块 [{a}]：{rel}"
            )

    # POM-10  service 不应引入 common-gateway-starter
    banned = dep_ids(pom) & SERVICE_BANNED_DEPS
    for b in sorted(banned):
        print_error(
            f"POM-10 service 模块引入了 [{b}]（该依赖属于 web 层），"
            f"service 层应使用 common-spring：{rel}"
        )

    # 验证 common-spring 存在
    if 'common-spring' not in dep_ids(pom):
        print_warning(
            f"POM-03 service 模块缺少 common-spring 依赖（提供 Redis/MyBatis-Plus/RocketMQ）：{rel}"
        )


def check_web_module(pom):
    rel = pom['rel']

    # POM-05  web 必须有 spring-boot-maven-plugin
    if 'spring-boot-maven-plugin' not in pom['plugins']:
        print_error(
            f"POM-05 web 模块缺少 spring-boot-maven-plugin"
            f"（web 是唯一可打 Fat Jar 的模块，必须配置此插件）：{rel}"
        )

    # POM-06  web 必须依赖 common-gateway-starter
    if 'common-gateway-starter' not in dep_ids(pom):
        print_error(
            f"POM-06 web 模块缺少 common-gateway-starter 依赖"
            f"（提供 Web/Security/OAuth2/Nacos 等基础能力）：{rel}"
        )

    # web 必须有 spring-cloud-starter-loadbalancer（Feign 负载均衡）
    if 'spring-cloud-starter-loadbalancer' not in dep_ids(pom):
        print_warning(
            f"POM-06 web 模块缺少 spring-cloud-starter-loadbalancer"
            f"（Feign 按服务名负载均衡必需，缺少会报 No Feign Client for loadBalancing defined）：{rel}"
        )


def check_root_module(pom, service_name):
    rel = pom['rel']

    # POM-09  服务根 pom 必须有 api/service/web 三个子模块声明
    expected = {f"{service_name}-api", f"{service_name}-service", f"{service_name}-web"}
    declared = set(pom['modules'])
    missing = expected - declared
    if missing:
        print_error(
            f"POM-09 服务根 pom.xml 缺少子模块声明：{sorted(missing)}：{rel}"
        )


def check_common_rules(pom):
    rel = pom['rel']

    # POM-07  所有有 groupId 的 pom 应为 com.succaiss
    if pom['groupId'] and pom['groupId'] != GROUP_ID:
        print_warning(
            f"POM-07 groupId 应为 {GROUP_ID}（当前：{pom['groupId']}）：{rel}"
        )

    # POM-08  子模块不应硬编码 version（父 pom 统一管理）
    if pom['version'] and pom['parentArtifact']:
        # 子模块（有 parent）自己声明了 version
        # 允许：version 与父相同（有些构建工具会继承）
        # 禁止：硬编码不同版本或独立版本字符串
        if not re.search(r'\$\{', pom['version']):
            print_warning(
                f"POM-08 子模块 pom.xml 硬编码了 version [{pom['version']}]，"
                f"建议从父 pom 继承，无需在子模块中声明：{rel}"
            )


def infer_module_type(pom):
    """根据 artifactId 后缀推断模块类型"""
    a = pom['artifactId']
    if a.endswith('-api'):
        return 'api', a[:-4]
    if a.endswith('-service'):
        return 'service', a[:-8]
    if a.endswith('-web'):
        return 'web', a[:-4]
    # 服务根 pom（无后缀）
    return 'root', a


def main():
    if len(sys.argv) < 2:
        print("用法：python3 check-pom.py <项目根目录>")
        sys.exit(1)

    root_dir = sys.argv[1]
    if not os.path.isdir(root_dir):
        print(f"路径不存在：{root_dir}")
        sys.exit(1)

    print("============================================")
    print("  java-project-structure / check-pom.py")
    print(f"  扫描根目录：{root_dir}")
    print("============================================")

    pom_files = [p for p in Path(root_dir).rglob('pom.xml')
                 if 'target' not in p.parts and '.git' not in p.parts]

    if not pom_files:
        print_warning("未找到任何 pom.xml 文件")
        sys.exit(0)

    print(f"  发现 {len(pom_files)} 个 pom.xml\n")

    for pom_path in sorted(pom_files):
        pom = parse_pom(pom_path)
        if pom is None:
            continue

        module_type, service_name = infer_module_type(pom)

        print(f"── {pom['rel']}  [{module_type}:{pom['artifactId']}]")

        check_common_rules(pom)

        if module_type == 'api':
            check_api_module(pom)
        elif module_type == 'service':
            check_service_module(pom, service_name)
        elif module_type == 'web':
            check_web_module(pom)
        elif module_type == 'root':
            # 服务根 pom（有子模块）才检查
            if pom['modules']:
                check_root_module(pom, service_name)

    print()
    print("============================================")
    if errors > 0:
        print(f"{RED}❌ 检查完成：{errors} 个阻断错误，{warnings} 个警告{NC}")
        sys.exit(1)
    elif warnings > 0:
        print(f"{YELLOW}🟡 检查完成：0 个阻断错误，{warnings} 个警告{NC}")
    else:
        print_ok("全部通过，pom.xml 规范检查无问题")


if __name__ == '__main__':
    main()
