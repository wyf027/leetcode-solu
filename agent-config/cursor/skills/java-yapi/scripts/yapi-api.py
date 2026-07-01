#!/usr/bin/env python3
# java-yapi/scripts/yapi-api.py
# 覆盖：
#   YA-02  获取 YApi 项目接口列表
#   YA-03  新增 YApi 接口分类
#   YA-04  运行 YApi 自动化测试
#   YA-06  查询 YApi 接口分类列表
#
# 依赖：Python 3.6+（仅用标准库，无第三方依赖）
#
# 用法（需提供 YApi server + token，可通过参数或 yapi-import.json 读取）：
#
#   # 方式一：从 yapi-import.json 读取 server 和 token
#   python3 yapi-api.py --config /path/to/project/yapi-import.json <命令> [选项]
#
#   # 方式二：直接传参
#   python3 yapi-api.py --server http://yapi.example.com --token xxx <命令> [选项]
#
# 命令列表：
#   list-interfaces                          # YA-02 获取接口列表（默认第1页100条）
#     [--page N] [--limit N]                 # 翻页参数
#     [--cat-id N]                           # 按分类筛选
#     [--output-format table|json]           # 输出格式
#
#   list-categories                          # YA-06 获取接口分类列表
#
#   add-category --name <名称>               # YA-03 新增接口分类
#     [--parent-id N]                        # 父分类（默认为顶层）
#
#   run-tests                                # YA-04 运行 YApi 自动化测试
#     [--env-id N]                           # 指定测试环境 ID
#     [--col-id N]                           # 指定测试用例集 ID
#
# 示例：
#   python3 yapi-api.py --config ./yapi-import.json list-categories
#   python3 yapi-api.py --config ./yapi-import.json list-interfaces --page 1 --limit 50
#   python3 yapi-api.py --config ./yapi-import.json add-category --name "招聘管理"
#   python3 yapi-api.py --config ./yapi-import.json run-tests --env-id 3

import sys
import json
import os
import argparse
import urllib.request
import urllib.error
import urllib.parse

# ────────────────────────────────────────────────
# ANSI 颜色
# ────────────────────────────────────────────────
RED = "\033[0;31m"
YELLOW = "\033[1;33m"
GREEN = "\033[0;32m"
CYAN = "\033[0;36m"
BOLD = "\033[1m"
NC = "\033[0m"


def info(msg):    print(f"{CYAN}ℹ  {msg}{NC}")
def ok(msg):      print(f"{GREEN}✅ {msg}{NC}")
def warn(msg):    print(f"{YELLOW}🟡 {msg}{NC}")
def error(msg):   print(f"{RED}❌ {msg}{NC}", file=sys.stderr)


# ────────────────────────────────────────────────
# HTTP 工具
# ────────────────────────────────────────────────
def api_get(server: str, path: str, params: dict = None) -> dict:
    url = f"{server}{path}"
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        error(f"HTTP {e.code} {url}\n{body}")
        sys.exit(1)
    except Exception as e:
        error(f"请求失败 {url}：{e}")
        sys.exit(1)


def api_post(server: str, path: str, body: dict) -> dict:
    url = f"{server}{path}"
    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        error(f"HTTP {e.code} {url}\n{body}")
        sys.exit(1)
    except Exception as e:
        error(f"请求失败 {url}：{e}")
        sys.exit(1)


def assert_ok(resp: dict, action: str):
    if resp.get("errcode") != 0:
        error(f"{action} 失败：{resp}")
        sys.exit(1)


# ────────────────────────────────────────────────
# 获取项目 ID（通过 token 查询）
# ────────────────────────────────────────────────
def get_project_id(server: str, token: str) -> int:
    resp = api_get(server, "/api/project/get", {"token": token})
    assert_ok(resp, "获取项目信息")
    pid = resp["data"]["_id"]
    pname = resp["data"].get("name", "?")
    info(f"项目：{pname}（ID: {pid}）")
    return pid


# ────────────────────────────────────────────────
# YA-06  查询接口分类列表
# ────────────────────────────────────────────────
def cmd_list_categories(server: str, token: str, project_id: int, **kwargs):
    print(f"\n{BOLD}【YA-06】接口分类列表{NC}")
    resp = api_get(server, "/api/interface/getCatMenu", {
        "project_id": project_id,
        "token": token
    })
    assert_ok(resp, "获取分类列表")
    cats = resp.get("data", [])
    if not cats:
        info("暂无接口分类")
        return

    # 表格输出
    print(f"\n{'ID':>8}  {'名称':<30}  {'接口数':>6}  {'描述'}")
    print("-" * 70)
    for c in cats:
        cat_id = c.get("_id", "-")
        name = c.get("name", "-")
        count = c.get("interface_num", 0)
        desc = c.get("desc", "")
        print(f"{cat_id:>8}  {name:<30}  {count:>6}  {desc}")

    print()
    ok(f"共 {len(cats)} 个分类")


# ────────────────────────────────────────────────
# YA-02  获取接口列表
# ────────────────────────────────────────────────
def cmd_list_interfaces(server: str, token: str, project_id: int,
                        page: int = 1, limit: int = 100,
                        cat_id: int = None,
                        output_format: str = "table", **kwargs):
    print(f"\n{BOLD}【YA-02】接口列表{NC}")

    params = {
        "project_id": project_id,
        "token": token,
        "page": page,
        "limit": limit
    }
    if cat_id:
        params["catid"] = cat_id

    path = "/api/interface/list"
    resp = api_get(server, path, params)
    assert_ok(resp, "获取接口列表")

    data = resp.get("data", {})
    total = data.get("total", 0)
    interfaces = data.get("list", [])

    info(f"第 {page} 页，每页 {limit} 条，共 {total} 条接口")

    if not interfaces:
        info("暂无接口")
        return

    if output_format == "json":
        print(json.dumps(interfaces, ensure_ascii=False, indent=2))
        return

    # 表格输出
    print(f"\n{'ID':>8}  {'方法':<8}  {'路径':<50}  {'名称':<30}  {'状态'}")
    print("-" * 110)
    for ifc in interfaces:
        ifc_id = ifc.get("_id", "-")
        method = ifc.get("method", "-").upper()
        path_val = ifc.get("path", "-")
        title = ifc.get("title", "-")
        status = ifc.get("status", "-")
        status_label = "✅ 完成" if status == "done" else "🔧 开发中"
        print(f"{ifc_id:>8}  {method:<8}  {path_val:<50}  {title:<30}  {status_label}")

    print()
    remaining = total - page * limit
    if remaining > 0:
        info(f"还有 {remaining} 条，使用 --page {page + 1} 继续查看")
    ok(f"本页显示 {len(interfaces)} 条接口")


# ────────────────────────────────────────────────
# YA-03  新增接口分类
# ────────────────────────────────────────────────
def cmd_add_category(server: str, token: str, project_id: int,
                     name: str = None, parent_id: int = 0, **kwargs):
    if not name:
        error("--name 为必填项")
        sys.exit(1)

    print(f"\n{BOLD}【YA-03】新增接口分类{NC}")
    info(f"分类名称：{name}")

    resp = api_post(server, "/api/interface/add_cat", {
        "project_id": project_id,
        "token": token,
        "name": name,
        "desc": "",
        "parent_id": parent_id
    })
    assert_ok(resp, "新增接口分类")
    cat_data = resp.get("data", {})
    cat_id = cat_data.get("_id", "?")

    ok(f"分类「{name}」创建成功（ID: {cat_id}）")
    return cat_id


# ────────────────────────────────────────────────
# YA-04  运行 YApi 自动化测试
# ────────────────────────────────────────────────
def cmd_run_tests(server: str, token: str, project_id: int,
                  env_id: int = None, col_id: int = None, **kwargs):
    print(f"\n{BOLD}【YA-04】运行自动化测试{NC}")

    # 先获取测试用例集列表
    resp = api_get(server, "/api/col/list", {
        "project_id": project_id,
        "token": token
    })
    assert_ok(resp, "获取测试用例集")
    cols = resp.get("data", {}).get("list", [])

    if not cols:
        warn("该项目暂无测试用例集，请先在 YApi 中创建")
        return

    if col_id is None:
        # 显示所有用例集，提示用户选择
        print(f"\n{'ID':>8}  {'名称':<40}  {'用例数':>6}")
        print("-" * 60)
        for col in cols:
            print(f"{col.get('_id', '-'):>8}  {col.get('name', '-'):<40}  {col.get('col_case_count', 0):>6}")
        print()
        warn("请使用 --col-id N 指定要运行的测试用例集 ID")
        return

    # 如未指定环境，获取环境列表
    if env_id is None:
        env_resp = api_get(server, "/api/project/get", {"token": token})
        assert_ok(env_resp, "获取项目信息")
        envs = env_resp.get("data", {}).get("env", [])
        if envs:
            print(f"\n可用测试环境：")
            for idx, e in enumerate(envs):
                print(f"  {idx}. {e.get('name', '?')}（域名: {e.get('domain', '?')}）")
            warn("请使用 --env-id N 指定测试环境序号（从 0 开始）")
        else:
            warn("该项目未配置测试环境，请先在 YApi 中配置")
        return

    # 运行测试
    info(f"运行用例集 {col_id}，环境 {env_id}...")
    run_resp = api_get(server, "/api/col/run", {
        "token": token,
        "project_id": project_id,
        "col_id": col_id,
        "env_id": env_id,
        "mode": "json"
    })
    assert_ok(run_resp, "运行测试")

    results = run_resp.get("data", {})
    total = results.get("total", 0)
    passed = results.get("success", 0)
    failed = total - passed

    print()
    print(f"  总用例：{total}")
    print(f"  通过：  {GREEN}{passed}{NC}")
    print(f"  失败：  {RED}{failed}{NC}")

    if failed > 0:
        # 打印失败的用例
        print(f"\n{RED}失败用例：{NC}")
        for case in results.get("list", []):
            if case.get("status") != "success":
                print(f"  ❌ {case.get('name', '?')} → {case.get('res_body', '')[:100]}")
        sys.exit(1)
    else:
        ok(f"全部 {total} 个用例通过")


# ────────────────────────────────────────────────
# 主函数
# ────────────────────────────────────────────────
def load_config(config_path: str) -> dict:
    if not os.path.exists(config_path):
        error(f"配置文件不存在：{config_path}")
        sys.exit(1)
    try:
        with open(config_path, encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        error(f"配置文件 JSON 解析失败：{e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="YApi HTTP API 操作工具（YA-02/03/04/06）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
命令示例：
  python3 yapi-api.py --config ./yapi-import.json list-categories
  python3 yapi-api.py --config ./yapi-import.json list-interfaces --page 1 --limit 50
  python3 yapi-api.py --config ./yapi-import.json add-category --name "招聘管理"
  python3 yapi-api.py --config ./yapi-import.json run-tests --col-id 12 --env-id 0
        """
    )

    # 连接参数（二选一）
    conn_group = parser.add_mutually_exclusive_group(required=True)
    conn_group.add_argument("--config", help="yapi-import.json 配置文件路径")
    conn_group.add_argument("--server", help="YApi 服务地址（需同时指定 --token）")

    parser.add_argument("--token", help="YApi project token（--server 模式使用）")

    # 子命令
    subparsers = parser.add_subparsers(dest="command", metavar="命令")
    subparsers.required = True

    # list-categories
    subparsers.add_parser("list-categories", help="YA-06 获取接口分类列表")

    # list-interfaces
    p_list = subparsers.add_parser("list-interfaces", help="YA-02 获取接口列表")
    p_list.add_argument("--page", type=int, default=1, help="页码（默认 1）")
    p_list.add_argument("--limit", type=int, default=100, help="每页条数（默认 100）")
    p_list.add_argument("--cat-id", type=int, dest="cat_id", help="按分类 ID 筛选")
    p_list.add_argument("--output-format", choices=["table", "json"],
                        default="table", dest="output_format", help="输出格式")

    # add-category
    p_add_cat = subparsers.add_parser("add-category", help="YA-03 新增接口分类")
    p_add_cat.add_argument("--name", required=True, help="分类名称")
    p_add_cat.add_argument("--parent-id", type=int, default=0, dest="parent_id",
                           help="父分类 ID（默认顶层）")

    # run-tests
    p_test = subparsers.add_parser("run-tests", help="YA-04 运行 YApi 自动化测试")
    p_test.add_argument("--env-id", type=int, dest="env_id", help="测试环境序号")
    p_test.add_argument("--col-id", type=int, dest="col_id", help="测试用例集 ID")

    args = parser.parse_args()

    # 解析 server + token
    if args.config:
        cfg = load_config(args.config)
        server = cfg.get("server", "").rstrip("/")
        token = cfg.get("token", "")
        if not server or not token:
            error("yapi-import.json 中缺少 server 或 token 字段")
            sys.exit(1)
    else:
        server = args.server.rstrip("/")
        token = args.token
        if not token:
            error("使用 --server 时必须同时指定 --token")
            sys.exit(1)

    print("============================================")
    print("  java-yapi / yapi-api.py")
    print(f"  服务：{server}")
    print("============================================")

    project_id = get_project_id(server, token)

    kwargs = vars(args)
    command = args.command

    if command == "list-categories":
        cmd_list_categories(server, token, project_id, **kwargs)
    elif command == "list-interfaces":
        cmd_list_interfaces(server, token, project_id, **kwargs)
    elif command == "add-category":
        cmd_add_category(server, token, project_id, **kwargs)
    elif command == "run-tests":
        cmd_run_tests(server, token, project_id, **kwargs)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
