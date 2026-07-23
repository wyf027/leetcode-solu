#!/usr/bin/env bash
# java-yapi/scripts/check-yapi.sh
# 覆盖：YA-07  同步前校验（pre-sync validation）
#
# 检查项：
#   [1] Controller @Operation summary 格式（须为「业务名称 - 操作」，含" - "）
#   [2] Controller 方法 Javadoc 第一行格式（与 GENERATION_RULES.md 一致）
#   [3] yapi.json paths 中 summary 格式（若文件存在）
#   [4] yapi.json 分页接口的列表 items 是否为具名 $ref（非匿名 object）
#   [5] yapi.json 中 example / mock 字段是否完整（至少存在）
#   [6] yapi.json 中枚举字段是否携带 enum 数组（description 含「 / 」则必须有 enum）
#
# 用法：
#   bash check-yapi.sh <模块路径>              # 检查 Controller @Operation summary
#   bash check-yapi.sh <项目根路径>            # 同时检查 yapi.json（若存在）
#   bash check-yapi.sh --files file1.java ...  # 增量模式（pre-commit）
#
# 示例：
#   bash ~/cursor/skills/java-yapi/scripts/check-yapi.sh ~/IdeaProjects/hire
#   bash ~/cursor/skills/java-yapi/scripts/check-yapi.sh ~/IdeaProjects/hire/hire-web/src

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

pass()  { echo -e "${GREEN}  ✅ $*${NC}"; }
fail()  { echo -e "${RED}  ❌ $*${NC}"; ((ERRORS++)) || true; }
warn()  { echo -e "${YELLOW}  🟡 $*${NC}"; ((WARNINGS++)) || true; }
section(){ echo -e "\n${BOLD}━━━ $* ━━━${NC}"; }

# ── 参数解析 ──────────────────────────────────────────────────────────────────
TARGET_PATH=""
FILE_LIST=""

if [[ "${1:-}" == "--files" ]]; then
  shift
  FILE_LIST="$*"
  # 过滤出 Controller 文件
  JAVA_FILES=$(echo "$FILE_LIST" | tr ' ' '\n' | grep 'Controller\.java$' || true)
  YAPI_JSON=""
else
  TARGET_PATH="${1:?用法: bash check-yapi.sh <模块路径>}"
  TARGET_PATH="$(cd "$TARGET_PATH" && pwd)"
  JAVA_FILES=$(find "$TARGET_PATH" -name '*Controller.java' \
    ! -path '*/target/*' ! -path '*/test/*' 2>/dev/null | sort || true)
  # 查找 yapi.json（在 TARGET_PATH 或其父目录）
  YAPI_JSON=""
  for candidate in "$TARGET_PATH/yapi.json" \
                   "$(dirname "$TARGET_PATH")/yapi.json" \
                   "$(dirname "$(dirname "$TARGET_PATH")")/yapi.json"; do
    if [[ -f "$candidate" ]]; then
      YAPI_JSON="$candidate"
      break
    fi
  done
fi

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     YApi 同步前校验（YA-07）             ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"

# ── [1] Controller @Operation summary 格式检查 ────────────────────────────────
section "[1] Controller @Operation summary 格式"

SUMMARY_ERRORS=0
FILE_COUNT=0

if [[ -z "$JAVA_FILES" ]]; then
  warn "未找到 Controller 文件，跳过 @Operation summary 检查"
else
  while IFS= read -r java_file; do
    [[ -f "$java_file" ]] || continue
    ((FILE_COUNT++)) || true

    # 提取所有 @Operation(summary = "...") 值
    while IFS= read -r summary_val; do
      [[ -z "$summary_val" ]] && continue
      # 检查格式：必须包含 " - "
      if ! echo "$summary_val" | grep -qP ' - '; then
        fail "@Operation summary 格式不符（须为「业务名称 - 操作」）：\"$summary_val\""
        echo "       文件：$(basename "$java_file")"
        ((SUMMARY_ERRORS++)) || true
      fi
    done < <(grep -oP '(?<=@Operation\s{0,5}\(\s{0,5}summary\s{0,5}=\s{0,5}")([^"]+)' \
             "$java_file" 2>/dev/null || true)

    # 检查 summary = "TODO" 的占位符
    if grep -qP '@Operation\s*\(\s*summary\s*=\s*"TODO' "$java_file" 2>/dev/null; then
      warn "存在未填写的 @Operation(summary = \"TODO...\")：$(basename "$java_file")"
    fi
  done <<< "$JAVA_FILES"

  if [[ $SUMMARY_ERRORS -eq 0 && $FILE_COUNT -gt 0 ]]; then
    pass "所有 @Operation summary 格式正确（检查 $FILE_COUNT 个 Controller）"
  elif [[ $FILE_COUNT -eq 0 ]]; then
    warn "未找到含 @Operation 注解的 Controller 文件"
  fi
fi

# ── [2] yapi.json 检查（若存在）──────────────────────────────────────────────
if [[ -n "$YAPI_JSON" ]]; then

  section "[2] yapi.json → summary 格式检查"
  echo "  文件：$YAPI_JSON"

  SUMMARY_JSON_ERRORS=0
  # 提取所有 "summary": "..." 值（使用 python3 解析 JSON 更准确）
  python3 - "$YAPI_JSON" <<'PYEOF'
import sys, json

yapi_path = sys.argv[1]
RED     = '\033[0;31m'
YELLOW  = '\033[1;33m'
GREEN   = '\033[0;32m'
NC      = '\033[0m'

try:
    with open(yapi_path, encoding='utf-8') as f:
        doc = json.load(f)
except Exception as e:
    print(f'{RED}  ❌ yapi.json 解析失败：{e}{NC}')
    sys.exit(1)

paths = doc.get('paths', {})
errors = 0
warns  = 0

for path, methods in paths.items():
    if not isinstance(methods, dict):
        continue
    for method, op in methods.items():
        if not isinstance(op, dict):
            continue
        summary = op.get('summary', '')
        if not summary:
            print(f'{RED}  ❌ 缺少 summary：{method.upper()} {path}{NC}')
            errors += 1
            continue
        if ' - ' not in summary:
            print(f'{RED}  ❌ summary 格式不符（须含「 - 」）："{summary}" [{method.upper()} {path}]{NC}')
            errors += 1
        elif 'TODO' in summary:
            print(f'{YELLOW}  🟡 summary 未完善（含 TODO）："{summary}" [{method.upper()} {path}]{NC}')
            warns += 1

if errors == 0 and warns == 0:
    print(f'{GREEN}  ✅ 全部 {len([op for ms in paths.values() for op in ms.values()])} 个接口 summary 格式正确{NC}')
elif errors == 0:
    print(f'{YELLOW}  🟡 {warns} 个接口 summary 含 TODO，建议完善后再同步{NC}')

sys.exit(1 if errors > 0 else 0)
PYEOF
  SUMMARY_JSON_RC=$?
  [[ $SUMMARY_JSON_RC -ne 0 ]] && ((ERRORS++)) || true

  # ── [3] yapi.json → 分页接口 $ref 检查 ────────────────────────────────
  section "[3] yapi.json → 分页接口列表项 \$ref 检查"

  python3 - "$YAPI_JSON" <<'PYEOF'
import sys, json

yapi_path = sys.argv[1]
RED    = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN  = '\033[0;32m'
NC     = '\033[0m'

def check_items(schema, path_hint):
    """递归检查分页结构中 records/list 数组的 items 是否为具名 $ref。"""
    if not isinstance(schema, dict):
        return 0
    errors = 0
    props = schema.get('properties', {})
    for key in ('records', 'list', 'data'):
        if key in props:
            sub = props[key]
            if sub.get('type') == 'array':
                items = sub.get('items', {})
                if '$ref' not in items and items.get('type') == 'object':
                    print(f'{RED}  ❌ 分页 {key} 的 items 为匿名 object（应改为具名 $ref）：{path_hint}{NC}')
                    errors += 1
            # 递归检查嵌套 data
            if isinstance(sub, dict):
                errors += check_items(sub, path_hint)
    return errors

try:
    with open(yapi_path, encoding='utf-8') as f:
        doc = json.load(f)
except Exception as e:
    print(f'{RED}  ❌ yapi.json 解析失败：{e}{NC}')
    sys.exit(1)

paths = doc.get('paths', {})
total_errors = 0
paged_count = 0

for path, methods in paths.items():
    if not isinstance(methods, dict):
        continue
    for method, op in methods.items():
        if not isinstance(op, dict):
            continue
        resp = op.get('responses', {}).get('200', {})
        content = resp.get('content', {}).get('application/json', {})
        schema = content.get('schema', {})
        errs = check_items(schema, f'{method.upper()} {path}')
        if errs > 0:
            total_errors += errs
            paged_count += 1

if total_errors == 0:
    print(f'{GREEN}  ✅ 未发现匿名 object 分页列表项问题{NC}')
else:
    print(f'{RED}  ❌ 共 {total_errors} 处分页列表项使用了匿名 object，须改为具名 $ref{NC}')

sys.exit(1 if total_errors > 0 else 0)
PYEOF
  [[ $? -ne 0 ]] && ((ERRORS++)) || true

  # ── [4] yapi.json → mock 字段完整性检查（抽样警告）────────────────────
  section "[4] yapi.json → mock 字段完整性检查（抽样）"

  python3 - "$YAPI_JSON" <<'PYEOF'
import sys, json

yapi_path = sys.argv[1]
RED    = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN  = '\033[0;32m'
NC     = '\033[0m'

def count_missing_mock(schema, path='', missing=None):
    """递归检查所有 property 是否都带了 mock 字段（抽样，只报前 10 个）。"""
    if missing is None:
        missing = []
    if not isinstance(schema, dict):
        return missing
    if len(missing) >= 10:
        return missing

    props = schema.get('properties', {})
    for fname, fschema in props.items():
        if not isinstance(fschema, dict):
            continue
        if fschema.get('type') in ('object', 'array'):
            count_missing_mock(fschema, f'{path}.{fname}', missing)
            if 'items' in fschema:
                count_missing_mock(fschema['items'], f'{path}.{fname}[]', missing)
        elif '$ref' not in fschema and 'mock' not in fschema:
            missing.append(f'{path}.{fname}')
    return missing

try:
    with open(yapi_path, encoding='utf-8') as f:
        doc = json.load(f)
except Exception as e:
    print(f'{RED}  ❌ yapi.json 解析失败：{e}{NC}')
    sys.exit(1)

schemas = doc.get('components', {}).get('schemas', {})
all_missing = []
for sname, schema in schemas.items():
    missing = count_missing_mock(schema, sname)
    all_missing.extend(missing)

if not all_missing:
    print(f'{GREEN}  ✅ 所有 Schema 字段均含 mock 数据{NC}')
else:
    print(f'{YELLOW}  🟡 以下字段缺少 mock 字段（共 {len(all_missing)} 个，显示前 10）：{NC}')
    for m in all_missing[:10]:
        print(f'      - {m}')
    if len(all_missing) > 10:
        print(f'      ... 还有 {len(all_missing) - 10} 个')

sys.exit(0)  # mock 缺失仅警告，不阻断
PYEOF
  [[ $? -ne 0 ]] && ((WARNINGS++)) || true

  # ── [5] yapi.json → 枚举字段 enum 数组检查 ────────────────────────────
  section "[5] yapi.json → 枚举字段 enum 数组检查"

  python3 - "$YAPI_JSON" <<'PYEOF'
import sys, json, re

yapi_path = sys.argv[1]
RED    = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN  = '\033[0;32m'
NC     = '\033[0m'

# description 中包含「 / 」且格式像枚举（「X.Y / X.Y」或「A / B」）则判定为枚举字段
ENUM_DESC_RE = re.compile(r'.+\s/\s.+')

def check_enum_arrays(schema, path, missing):
    """递归检查所有 property：有枚举描述但缺 enum 数组的字段。"""
    if not isinstance(schema, dict):
        return
    props = schema.get('properties', {})
    for fname, fschema in props.items():
        if not isinstance(fschema, dict):
            continue
        ftype = fschema.get('type', '')
        desc  = fschema.get('description', '')
        if ftype in ('integer', 'string') and ENUM_DESC_RE.match(desc) and 'enum' not in fschema:
            missing.append(f'{path}.{fname}（description: "{desc[:60]}"）')
        # 递归
        check_enum_arrays(fschema, f'{path}.{fname}', missing)
        if 'items' in fschema:
            check_enum_arrays(fschema['items'], f'{path}.{fname}[]', missing)

try:
    with open(yapi_path, encoding='utf-8') as f:
        doc = json.load(f)
except Exception as e:
    print(f'{RED}  ❌ yapi.json 解析失败：{e}{NC}')
    sys.exit(1)

missing = []

# 检查 components.schemas
for sname, schema in doc.get('components', {}).get('schemas', {}).items():
    check_enum_arrays(schema, sname, missing)

# 检查 paths 内联 schema（parameters / requestBody）
for path, methods in doc.get('paths', {}).items():
    if not isinstance(methods, dict):
        continue
    for method, op in methods.items():
        if not isinstance(op, dict):
            continue
        for param in op.get('parameters', []):
            s = param.get('schema', {})
            ftype = s.get('type', '')
            desc  = s.get('description', param.get('description', ''))
            if ftype in ('integer', 'string') and ENUM_DESC_RE.match(desc) and 'enum' not in s:
                missing.append(f'paths[{path}][{method}].param[{param.get("name","")}]（description: "{desc[:60]}"）')

if not missing:
    print(f'{GREEN}  ✅ 所有枚举字段均携带 enum 数组{NC}')
else:
    print(f'{RED}  ❌ 以下枚举字段缺少 enum 数组（共 {len(missing)} 个）：{NC}')
    for m in missing[:15]:
        print(f'      - {m}')
    if len(missing) > 15:
        print(f'      ... 还有 {len(missing) - 15} 个')

sys.exit(1 if missing else 0)
PYEOF
  [[ $? -ne 0 ]] && ((ERRORS++)) || true

else
  if [[ -z "$FILE_LIST" ]]; then
    warn "未找到 yapi.json，跳过 JSON 格式检查（请先执行 mapping-to-openapi.py 生成）"
  fi
fi

# ── [6] YApi 项目 basepath 与 mapping/yapi.json 路径冲突检测 ──────────────────
section "[6] YApi 项目 basepath 冲突检测"

if [[ -n "$TARGET_PATH" ]]; then
  YAPI_IMPORT_CFG=""
  for _c in "$TARGET_PATH/yapi-import.json" "$(dirname "$TARGET_PATH")/yapi-import.json"; do
    [[ -f "$_c" ]] && YAPI_IMPORT_CFG="$_c" && break
  done

  # 找 _meta.yaml（.yapi-tmp/mapping/ 或 .yapi-tmp/）
  META_YAML=""
  for _m in "$TARGET_PATH/.yapi-tmp/mapping/_meta.yaml" \
             "$(dirname "$TARGET_PATH")/.yapi-tmp/mapping/_meta.yaml"; do
    [[ -f "$_m" ]] && META_YAML="$_m" && break
  done

  if [[ -z "$YAPI_IMPORT_CFG" ]]; then
    warn "未找到 yapi-import.json，跳过 basepath 冲突检测"
  else
    python3 - "$YAPI_IMPORT_CFG" "${META_YAML:-}" "${YAPI_JSON:-}" <<'PYEOF'
import sys, json, os, re

RED    = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN  = '\033[0;32m'
NC     = '\033[0m'

yapi_import_path, meta_path, yapi_json_path = sys.argv[1], sys.argv[2], sys.argv[3]

# ── 读 yapi-import.json ───────────────────────────────────────────────────────
try:
    with open(yapi_import_path, encoding='utf-8') as f:
        cfg = json.load(f)
    server = cfg.get('server', '').rstrip('/')
    token  = cfg.get('token', '')
except Exception as e:
    print(f'{YELLOW}  🟡 读取 yapi-import.json 失败（{e}），跳过检测{NC}')
    sys.exit(0)

# ── 查询 YApi 项目 basepath ───────────────────────────────────────────────────
try:
    import urllib.request
    resp = urllib.request.urlopen(f"{server}/api/project/get?token={token}", timeout=5)
    proj = json.loads(resp.read().decode())
    proj_basepath = (proj.get('data', {}).get('basepath', '') or '').rstrip('/')
    print(f'  YApi 项目 basepath: {proj_basepath!r}')
except Exception as e:
    print(f'{YELLOW}  🟡 无法连接 YApi（{e}），跳过 basepath 检测{NC}')
    sys.exit(0)

if not proj_basepath:
    print(f'{GREEN}  ✅ YApi 项目未设置 basepath，无冲突风险{NC}')
    sys.exit(0)

errors = 0

# ── 检查 _meta.yaml base_path ─────────────────────────────────────────────────
if meta_path and os.path.isfile(meta_path):
    try:
        with open(meta_path, encoding='utf-8') as f:
            content = f.read()
        m = re.search(r'base_path\s*:\s*(.+)', content)
        if m:
            raw = m.group(1).strip().strip('"\'').rstrip('/')
            mapping_bp = raw if raw not in ('""', "''", '') else ''
            if mapping_bp:
                print(f'  _meta.yaml base_path: {mapping_bp!r}')
                if mapping_bp == proj_basepath or mapping_bp.startswith(proj_basepath + '/'):
                    print(f'{RED}  ❌ _meta.yaml base_path 与 YApi 项目 basepath 重复！{NC}')
                    print(f'     会导致接口路径出现双重前缀：{proj_basepath}{mapping_bp}/...{NC}')
                    print(f'     修复：将 _meta.yaml 的 base_path 改为 "" 或直接删除该行')
                    errors += 1
                else:
                    print(f'{GREEN}  ✅ _meta.yaml base_path 与 YApi basepath 不重叠{NC}')
            else:
                print(f'{GREEN}  ✅ _meta.yaml base_path 为空，YApi basepath 由项目级别承担{NC}')
        else:
            print(f'{GREEN}  ✅ _meta.yaml 未声明 base_path，无冲突风险{NC}')
    except Exception as e:
        print(f'{YELLOW}  🟡 读取 _meta.yaml 失败（{e}）{NC}')
else:
    print(f'  未找到 .yapi-tmp/mapping/_meta.yaml，跳过 mapping 层检查')

# ── 检查已生成的 yapi.json 路径 ────────────────────────────────────────────────
if yapi_json_path and os.path.isfile(yapi_json_path):
    try:
        with open(yapi_json_path, encoding='utf-8') as f:
            doc = json.load(f)
        bad = [p for p in doc.get('paths', {})
               if p == proj_basepath or p.startswith(proj_basepath + '/')]
        if bad:
            print(f'{RED}  ❌ yapi.json 中 {len(bad)} 个路径含 YApi 项目 basepath 前缀，导入后将出现双重路径：{NC}')
            for p in bad[:5]:
                print(f'       {p}')
            if len(bad) > 5:
                print(f'       ... 还有 {len(bad) - 5} 个')
            print(f'     修复：_meta.yaml base_path 改为 ""，endpoint path 直接写相对路径')
            errors += 1
        else:
            print(f'{GREEN}  ✅ yapi.json 路径无双重前缀{NC}')
    except Exception as e:
        print(f'{YELLOW}  🟡 读取 yapi.json 失败（{e}）{NC}')

sys.exit(1 if errors > 0 else 0)
PYEOF
    [[ $? -ne 0 ]] && ((ERRORS++)) || true
  fi
else
  warn "非目录模式（--files），跳过 basepath 冲突检测"
fi

# ── 汇总 ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║              校验结果汇总                ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"

if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}❌ 发现 $ERRORS 个阻断错误，$WARNINGS 个警告${NC}"
  echo -e "${RED}   请修复后再执行 sync-yapi.sh 同步${NC}"
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo -e "${YELLOW}🟡 通过（$WARNINGS 个警告，建议修复后再同步）${NC}"
  exit 0
else
  echo -e "${GREEN}✅ 全部校验通过，可以执行同步${NC}"
  echo ""
  echo "  下一步：bash ~/cursor/skills/java-yapi/scripts/sync-yapi.sh <项目根路径>"
  exit 0
fi
