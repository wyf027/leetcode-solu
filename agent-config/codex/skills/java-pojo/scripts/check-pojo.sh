#!/usr/bin/env bash
# java-pojo/scripts/check-pojo.sh
# 覆盖：
#   PO-01  VO 含 is_deleted / 内部流转字段
#   PO-02  Entity 混入展示字段（xxxDesc / xxxName 非数据库字段）
#   PO-03  Controller 直接返回 Entity（含 @TableName 的类作为出参）
#   PO-04  @Data 有继承未加 @EqualsAndHashCode(callSuper = true) / @ToString(callSuper = true)
#   PO-05  Entity 重复声明公共字段（id / createdAt / updatedAt / createdBy / updatedBy）
#   PO-06  跨服务 DTO 缺少 @NoArgsConstructor（api 层 DTO 须有无参构造）
#   PO-07  POJO 字段使用基本类型（必须用包装类型 Long/Integer/Boolean/Character/Double，禁止 long/int/boolean/char/double 等）
# 用法：bash check-pojo.sh <扫描路径> [--files file1 file2 ...]

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

print_error() { echo -e "${RED}❌ [ERROR]${NC} $1"; ((ERRORS++)) || true; }
print_warning() { echo -e "${YELLOW}🟡 [WARN] ${NC} $1"; ((WARNINGS++)) || true; }
print_ok() { echo -e "${GREEN}✅ $1${NC}"; }

# --files 模式：只扫特定文件
FILES_MODE=false
SCAN_ROOT=""
SPECIFIC_FILES=()

parse_args() {
  if [[ $# -eq 0 ]]; then
    echo "用法：bash check-pojo.sh <路径> [--files file1 ...]"
    exit 1
  fi
  if [[ "$1" == "--files" ]]; then
    FILES_MODE=true
    shift
    SPECIFIC_FILES=("$@")
  else
    SCAN_ROOT="$1"
  fi
}

parse_args "$@"

# 构造要扫描的 Java 文件列表
get_java_files() {
  if [[ "$FILES_MODE" == "true" ]]; then
    for f in "${SPECIFIC_FILES[@]}"; do
      [[ "$f" == *.java ]] && echo "$f"
    done
  else
    find "$SCAN_ROOT" -name "*.java" \
      ! -path "*/target/*" \
      ! -path "*Test.java" \
      ! -path "*Tests.java"
  fi
}

echo "============================================"
echo "  java-pojo / check-pojo.sh"
echo "============================================"

# ─────────────────────────────────────────────────
# PO-01  VO 含 is_deleted / 内部流转字段
# ─────────────────────────────────────────────────
echo ""
echo "【PO-01】检查 VO 是否含内部流转字段（is_deleted 等）..."
PO01_FOUND=false
while IFS= read -r f; do
  fname=$(basename "$f")
  [[ "$fname" != *VO.java ]] && continue
  if grep -qE 'isDeleted|is_deleted|deletedAt|deleted_at' "$f" 2>/dev/null; then
    print_error "PO-01 VO 类含逻辑删除字段（isDeleted/is_deleted），VO 不应暴露内部流转字段：$f"
    PO01_FOUND=true
  fi
  # 内部流转枚举字段（如 flowStatus / internalStatus）
  if grep -qE 'private\s+\w*(Status|Flow|State|Internal)\w*\s+' "$f" 2>/dev/null; then
    # 仅警告，不一定是问题
    :
  fi
done < <(get_java_files)
[[ "$PO01_FOUND" == false ]] && print_ok "PO-01 通过"

# ─────────────────────────────────────────────────
# PO-02  Entity 混入展示字段（xxxDesc / xxxName 非 DB 注解字段）
# ─────────────────────────────────────────────────
echo ""
echo "【PO-02】检查 Entity 是否混入展示字段..."
PO02_FOUND=false
while IFS= read -r f; do
  fname=$(basename "$f")
  [[ "$fname" != *Entity.java ]] && continue

  # 查找没有 @TableField 注解保护的 xxxDesc / xxxName 字段
  # 逻辑：行中有 private xxx xxxDesc/xxxName，且上一行不是 @TableField
  python3 - "$f" <<'PYEOF'
import sys, re

path = sys.argv[1]
try:
    lines = open(path, encoding='utf-8', errors='replace').readlines()
except Exception:
    sys.exit(0)

display_pat = re.compile(r'private\s+\w[\w<>,\s]*\s+\w*(Desc|Name|Label|Text|Title)\s*;')
table_field_pat = re.compile(r'@TableField')

for i, line in enumerate(lines):
    if display_pat.search(line):
        # 向上找 5 行，看有没有 @TableField 或 @TableId
        context = lines[max(0, i-5):i]
        has_annotation = any(table_field_pat.search(c) for c in context)
        if not has_annotation:
            field_name = re.search(r'private\s+\w[\w<>,\s]*\s+(\w+)\s*;', line)
            fname = field_name.group(1) if field_name else '?'
            print(f"\033[0;31m❌ [ERROR]\033[0m PO-02 Entity 含展示字段 [{fname}]（无 @TableField 标注，建议移至 VO）：{path}:{i+1}")
PYEOF
  [[ $? -ne 0 ]] || true
done < <(get_java_files)
# 没有简单方法判断是否输出了 ERROR，改为 rg 快速初筛（无匹配时 grep 返回 1，加 || true 防止 set -e 早退）
rg_result=$(get_java_files | grep -c "Entity.java$" 2>/dev/null || echo 0)
[[ "$rg_result" == "0" ]] && print_ok "PO-02 通过（无 Entity 文件）"

# ─────────────────────────────────────────────────
# PO-03  Controller 直接返回 Entity（Result<*Entity>）
# ─────────────────────────────────────────────────
echo ""
echo "【PO-03】检查 Controller 是否直接返回 Entity..."
PO03_HITS=$(get_java_files | grep "Controller.java$" | \
  xargs grep -n 'Result<.*Entity' 2>/dev/null || true)
if [[ -n "$PO03_HITS" ]]; then
  while IFS= read -r line; do
    print_error "PO-03 Controller 直接返回 Entity，应转为 VO 再返回：$line"
  done <<< "$PO03_HITS"
else
  print_ok "PO-03 通过"
fi

# ─────────────────────────────────────────────────
# PO-04  @Data 有继承未加 @EqualsAndHashCode(callSuper=true) 和 @ToString(callSuper=true)
# ─────────────────────────────────────────────────
echo ""
echo "【PO-04】检查 @Data 继承类是否补充 callSuper = true..."
PO04_FOUND=false
while IFS= read -r f; do
  # 有 @Data 且 extends（用 rg 支持 lookahead）
  if rg -q '@Data' "$f" 2>/dev/null && \
     rg -q 'class\s+\w+\s+extends\s+\w' "$f" 2>/dev/null; then
    # 排除 extends Object（实际不会写，但排除 extends BaseEntity 外的误报过滤）
    if ! rg -q 'callSuper\s*=\s*true' "$f" 2>/dev/null; then
      print_error "PO-04 类含 @Data + 继承但缺少 @EqualsAndHashCode(callSuper = true) / @ToString(callSuper = true)：$f"
      PO04_FOUND=true
    fi
  fi
done < <(get_java_files)
[[ "$PO04_FOUND" == false ]] && print_ok "PO-04 通过"

# ─────────────────────────────────────────────────
# PO-05  Entity 重复声明公共字段（id / createdAt / updatedAt / createdBy / updatedBy）
# ─────────────────────────────────────────────────
echo ""
echo "【PO-05】检查 Entity 是否重复声明 BaseEntity 公共字段..."
PO05_FOUND=false
BASE_FIELDS_RG='private\s+(Long\s+id|LocalDateTime\s+createdAt|LocalDateTime\s+updatedAt|Long\s+createdBy|Long\s+updatedBy)\s*;'
while IFS= read -r f; do
  fname=$(basename "$f")
  [[ "$fname" != *Entity.java ]] && continue
  if rg -q 'extends BaseEntity' "$f" 2>/dev/null; then
    HITS=$(rg -n "$BASE_FIELDS_RG" "$f" 2>/dev/null || true)
    if [[ -n "$HITS" ]]; then
      while IFS= read -r h; do
        field=$(echo "$h" | rg -o 'private\s+\w+\s+\w+' 2>/dev/null || echo '?')
        print_error "PO-05 Entity 继承 BaseEntity 后重复声明公共字段 [$field]（BaseEntity 已包含此字段）：$f"
      done <<< "$HITS"
      PO05_FOUND=true
    fi
  fi
done < <(get_java_files)
[[ "$PO05_FOUND" == false ]] && print_ok "PO-05 通过"

# ─────────────────────────────────────────────────
# PO-06  api 层 DTO 缺少 @NoArgsConstructor
# ─────────────────────────────────────────────────
echo ""
echo "【PO-06】检查 api 层 DTO 是否有 @NoArgsConstructor..."
PO06_FOUND=false
while IFS= read -r f; do
  fname=$(basename "$f")
  [[ "$fname" != *DTO.java ]] && continue
  # 只检查 *-api 模块下的 DTO
  [[ "$f" != *-api/* && "$f" != */api/* ]] && continue
  content=$(cat "$f" 2>/dev/null) || continue
  if ! grep -q '@NoArgsConstructor' "$f" && ! grep -q 'AllArgsConstructor' "$f"; then
    if grep -q '@Data' "$f"; then
      print_warning "PO-06 api 层 DTO 缺少 @NoArgsConstructor，跨服务反序列化可能失败：$f"
      PO06_FOUND=true
    fi
  fi
done < <(get_java_files)
[[ "$PO06_FOUND" == false ]] && print_ok "PO-06 通过"

# ─────────────────────────────────────────────────
# PO-07  POJO 字段使用基本类型（必须用包装类型）
# 触发：文件名以 Entity / DTO / VO / Request / Response 结尾
# 检测：字段声明中出现 byte/short/int/long/float/double/boolean/char
# 例外：final 字段（含 static final / final static 常量）、局部变量；数组字段不纳入本规则
# ─────────────────────────────────────────────────
echo ""
echo "【PO-07】检查 POJO 字段是否使用基本类型..."
PO07_FOUND=false
while IFS= read -r f; do
  fname=$(basename "$f")
  case "$fname" in
    *Entity.java|*DTO.java|*VO.java|*Request.java|*Response.java) ;;
    *) continue ;;
  esac
  # 匹配非 final 字段声明；覆盖 private/protected/public 与 static/transient/volatile 修饰符
  HITS=$(rg -n '^\s*(public|protected|private)\s+(static\s+|transient\s+|volatile\s+)*(byte|short|int|long|float|double|boolean|char)\s+\w+\s*[=;]' "$f" 2>/dev/null || true)
  if [[ -n "$HITS" ]]; then
    while IFS= read -r h; do
      print_error "PO-07 POJO 字段禁用任何基本类型，须改包装类型（Long/Integer/Boolean/Character/Double，金额用 BigDecimal）：$f → $h"
      PO07_FOUND=true
    done <<< "$HITS"
  fi
done < <(get_java_files)
[[ "$PO07_FOUND" == false ]] && print_ok "PO-07 通过"

echo ""
echo "============================================"
if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}❌ 检查完成：${ERRORS} 个阻断错误，${WARNINGS} 个警告${NC}"
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo -e "${YELLOW}🟡 检查完成：0 个阻断错误，${WARNINGS} 个警告${NC}"
else
  print_ok "全部通过，POJO 规范检查无问题"
fi
