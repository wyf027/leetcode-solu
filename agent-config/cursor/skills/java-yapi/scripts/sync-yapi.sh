#!/usr/bin/env bash
# YApi 接口同步脚本（java-controller skill 内置，勿放入业务工程）
# 用法：bash sync-yapi.sh <project_dir>
#   project_dir：业务工程根目录（含 yapi-import.json 和 AI 生成的 OpenAPI，默认文件名见配置 file）
#   导入成功后默认清理：file 指向的 OpenAPI、skill 约定的临时工作区 .yapi-tmp/
#   yapi-import.json 可选 "cleanup": ["相对路径", ...] —— 仅用于额外的非标产物（须在项目根下）
#
# merge 策略说明（在 yapi-import.json 中配置）：
#   normal      —— 普通模式：同路径接口覆盖，旧接口保留
#   good        —— 智能合并：尽量保留手工改动
#   mergeNoCheck—— 强制覆盖：同路径接口直接覆盖，旧接口保留
#   fullReplace —— 全量覆盖：先删除项目内所有接口，再重新导入（无残留）
set -e

PROJECT_DIR="${1:?用法: bash sync-yapi.sh <project_dir>}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
CONFIG_FILE="$PROJECT_DIR/yapi-import.json"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "错误：未找到 yapi-import.json：$CONFIG_FILE" >&2
  exit 1
fi

# 读取配置
SERVER=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c['server'])")
TOKEN=$(python3  -c "import json; c=json.load(open('$CONFIG_FILE')); print(c['token'])")
FILE=$(python3   -c "import json; c=json.load(open('$CONFIG_FILE')); print(c['file'])")
MERGE=$(python3  -c "import json; c=json.load(open('$CONFIG_FILE')); print(c['merge'])")
TYPE=$(python3   -c "import json; c=json.load(open('$CONFIG_FILE')); print(c['type'])")

SWAGGER_FILE="$PROJECT_DIR/$FILE"
if [ ! -f "$SWAGGER_FILE" ]; then
  echo "错误：未找到 $FILE：$SWAGGER_FILE" >&2
  echo "请先让 AI 生成 yapi.json 后再执行同步" >&2
  exit 1
fi

echo "正在同步接口到 YApi..."
echo "  项目：$(basename "$PROJECT_DIR")"
echo "  服务：$SERVER"

# ── 全量覆盖模式：先删除项目内所有接口分类，再导入 ──────────────────────────
#
# 降级链：
#   正常路径  del_cat 全部成功 → mergeNoCheck 导入（分类已清空，等价全量重建）
#   Level-1   任意 del_cat 失败（权限不足等）→ mergeNoCheck 全量覆盖更新（废弃路径需手动清理）
#
if [ "$MERGE" = "fullReplace" ]; then
  echo "  模式：全量覆盖（先删除所有接口，再重新导入）"
  set +e
  python3 - "$SERVER" "$TOKEN" <<'PYEOF'
import sys, json, urllib.request

server, token = sys.argv[1], sys.argv[2]

def api_get(url):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def api_post(url, body):
    payload = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=payload,
                                  headers={"Content-Type": "application/json"},
                                  method="POST")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

# 1. 获取项目 ID
proj = api_get(f"{server}/api/project/get?token={token}")
if proj.get('errcode') != 0:
    print(f"获取项目信息失败：{proj}", file=sys.stderr)
    sys.exit(1)
project_id = proj['data']['_id']
print(f"  项目 ID：{project_id}")

# 2. 获取所有接口分类
cats_resp = api_get(f"{server}/api/interface/getCatMenu?project_id={project_id}&token={token}")
if cats_resp.get('errcode') != 0:
    print(f"获取接口分类失败：{cats_resp}", file=sys.stderr)
    sys.exit(1)
cats = cats_resp.get('data', [])
print(f"  共找到 {len(cats)} 个接口分类")

# 3. 逐一删除分类（分类下的接口随之删除）
failed = []
for cat in cats:
    cat_id = cat['_id']
    cat_name = cat.get('name', str(cat_id))
    result = api_post(f"{server}/api/interface/del_cat", {"id": cat_id, "token": token})
    if result.get('errcode') != 0:
        print(f"  ⚠ 删除分类「{cat_name}」失败：{result.get('errmsg', result)}", file=sys.stderr)
        failed.append(cat_name)
    else:
        print(f"  ✓ 已删除分类：{cat_name}")

if failed:
    # exit 2 = 部分删除失败，由 bash 降级到原生 fullReplace 模式
    print(f"⚠ {len(failed)}/{len(cats)} 个分类删除失败：{', '.join(failed)}", file=sys.stderr)
    sys.exit(2)

print("已清除项目内所有接口，准备重新导入...")
PYEOF
  DEL_EXIT=$?
  set -e

  case "$DEL_EXIT" in
    0) IMPORT_MERGE="mergeNoCheck" ;;   # 分类已清空，mergeNoCheck 等价全量重建
    2) echo "  ⚠ 分类删除部分失败（权限不足），降级 Level-1：使用 mergeNoCheck 全量覆盖更新"
       IMPORT_MERGE="mergeNoCheck" ;;   # 无删除权限时以覆盖更新方式全量同步
    *) echo "❌ 无法获取项目信息，同步中止" >&2; exit 1 ;;
  esac
else
  echo "  模式：$MERGE"
  IMPORT_MERGE="$MERGE"
fi

# ── 导入接口数据 ──────────────────────────────────────────────────────────────
RESPONSE=$(python3 - "$SERVER" "$TYPE" "$TOKEN" "$IMPORT_MERGE" "$SWAGGER_FILE" <<'PYEOF'
import sys, json, urllib.request, urllib.error

server, type_, token, merge, filepath = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]

with open(filepath, 'r', encoding='utf-8') as f:
    swagger_str = f.read()

payload = json.dumps({
    "type": type_,
    "token": token,
    "merge": merge,
    "json": swagger_str
}).encode('utf-8')

req = urllib.request.Request(
    f"{server}/api/open/import_data",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST"
)
try:
    with urllib.request.urlopen(req) as resp:
        print(resp.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(e.read().decode('utf-8'))
PYEOF
)

python3 -c "
import json, sys
r = json.load(sys.stdin)
if r.get('errcode') == 0:
    print('同步成功')
else:
    print('同步失败：' + str(r), file=sys.stderr)
    sys.exit(1)
" <<< "$RESPONSE"

# 同步成功后删除本次导入产生的临时文件
#   1) 主 file（yapi.json 等）—— 由脚本必删
#   2) skill 约定的临时工作区 .yapi-tmp/ —— 默认必删（无需在 yapi-import.json 声明）
#   3) yapi-import.json 中可选 cleanup 列表 —— 仅用于额外的非标准产物
rm -f "$SWAGGER_FILE"
echo "已清理临时文件：$FILE"

python3 - "$PROJECT_DIR" "$CONFIG_FILE" <<'PYEOF'
import json, os, shutil, sys

project_dir = os.path.realpath(sys.argv[1])
config_path = sys.argv[2]
prefix = project_dir + os.sep

# 默认清理列表：skill 流程内固定约定的临时产物
DEFAULT_CLEANUP = [".yapi-tmp"]

with open(config_path, encoding="utf-8") as f:
    c = json.load(f)

extra = c.get("cleanup", [])
if not isinstance(extra, list):
    extra = []

# 默认项 + 业务自定义项（去重，保持顺序）
seen = set()
targets = []
for rel in (*DEFAULT_CLEANUP, *extra):
    if not isinstance(rel, str) or not rel.strip() or rel in seen:
        continue
    seen.add(rel)
    targets.append(rel)

for rel in targets:
    path = os.path.realpath(os.path.join(project_dir, rel))
    if not path.startswith(prefix):
        print(f"跳过 cleanup（路径不在项目根下）：{rel}", file=sys.stderr)
        continue
    if os.path.isfile(path):
        os.remove(path)
        print(f"已清理：{rel}")
    elif os.path.isdir(path):
        shutil.rmtree(path)
        print(f"已清理目录：{rel}")
PYEOF
