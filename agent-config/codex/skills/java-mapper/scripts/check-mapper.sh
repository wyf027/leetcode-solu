#!/usr/bin/env bash
# java-mapper/scripts/check-mapper.sh
# 覆盖：MP-03（IN 空集合保护）、MP-05（saveBatch 分批）、MP-06（Mapper 层打日志）、MP-08（BaseMapper 继承）
# 用法：bash check-mapper.sh [目标目录] [--files "file1 file2 ..."]

set -euo pipefail

TARGET="${1:-.}"
INCREMENTAL_FILES=()
if [[ "${1:-}" == "--files" ]]; then
  read -ra INCREMENTAL_FILES <<< "${2:-}"
  TARGET="."
fi

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

ERRORS=0
WARNINGS=0
print_error()   { echo -e "${RED}❌ [ERROR]${NC} $*"; ((ERRORS++)) || true; }
print_warning() { echo -e "${YELLOW}🟡 [WARN] ${NC} $*"; ((WARNINGS++)) || true; }
print_ok()      { echo -e "${GREEN}✅ $*${NC}"; }

run_rg() {
  local pattern="$1"; shift
  local flags=("$@")
  if [[ ${#INCREMENTAL_FILES[@]} -gt 0 ]]; then
    rg --no-heading -n "${flags[@]+"${flags[@]}"}" "$pattern" "${INCREMENTAL_FILES[@]}" 2>/dev/null || true
  else
    rg --no-heading -n "${flags[@]+"${flags[@]}"}" "$pattern" "$TARGET" 2>/dev/null || true
  fi
}

echo "============================================"
echo "  java-mapper / check-mapper.sh"
echo "  扫描范围: $TARGET"
echo "============================================"

# MP-03  IN 子句无空集合保护（含 DB-14）
echo ""
echo "【MP-03】检查 IN 子句无空集合保护..."
# 在 XML 中扫描 foreach in 语句
HITS=$(run_rg '<foreach[^>]*collection=' -g '*.xml' -l || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r file; do
    # 检查 foreach 前是否有空集合判断
    if ! rg -q 'CollectionUtils\.isEmpty\|\.isEmpty()\|!.*\.isEmpty\|size\s*==\s*0' "$file" 2>/dev/null; then
      # 进一步检查 if test 包含非空判断
      if ! rg -q '<if\s+test="[^"]*!=\s*null[^"]*&&\s*[^"]*\.size' "$file" 2>/dev/null; then
        print_error "XML mapper 中 IN 查询（foreach）缺少空集合保护，传入空集合会导致 SQL 语法错误：$file"
      fi
    fi
  done <<< "$HITS"
else
  print_ok "MP-03 通过"
fi

# MP-03 (Java)  lambdaQuery IN 无空集合保护
HITS=$(run_rg '\.in\s*\([^)]*\)' -g '*.java' -l || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r file; do
    # 检查 in 调用前是否有 isEmpty 保护
    if ! rg -q 'isEmpty\(\)|CollectionUtils\.isEmpty|CollUtil\.isEmpty' "$file" 2>/dev/null; then
      print_warning "lambdaQuery().in() 调用可能缺少空集合保护，建议在调用前检查集合是否为空：$file"
    fi
  done <<< "$HITS"
fi

# MP-05  saveBatch / 批量写入无分批（含 DB-16）
echo ""
echo "【MP-05】检查 saveBatch 无分批..."
HITS=$(run_rg 'saveBatch\s*\(' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    # 检查是否传入了 batch size 参数
    if ! echo "$line" | grep -qE 'saveBatch\s*\([^,)]+,\s*[0-9]+\)'; then
      print_warning "saveBatch 建议显式指定批次大小（如 saveBatch(list, 500)），避免单次写入过多数据：$line"
    fi
  done <<< "$HITS"
else
  print_ok "MP-05 通过"
fi

# MP-06  Mapper 层打业务日志
echo ""
echo "【MP-06】检查 Mapper 层打业务日志..."
if [[ ${#INCREMENTAL_FILES[@]} -gt 0 ]]; then
  # 增量模式：rg 对显式文件路径不应用 --glob 过滤，须手动按文件名筛选
  HITS=""
  for f in "${INCREMENTAL_FILES[@]}"; do
    case "$f" in
      *Mapper.java|*Mapper.xml)
        result=$(rg --no-heading -n 'log\.(info|warn|error|debug)\s*\(' "$f" 2>/dev/null || true)
        [[ -n "$result" ]] && HITS="${HITS}${result}"$'\n'
        ;;
    esac
  done
else
  HITS=$(rg --no-heading -n -g '*Mapper.java' -g '*Mapper.xml' 'log\.(info|warn|error|debug)\s*\(' "$TARGET" 2>/dev/null || true)
fi
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    print_error "Mapper 层禁止打业务日志，日志应在 Service 层记录：$line"
  done <<< "$HITS"
else
  print_ok "MP-06 通过"
fi

# MP-08  Mapper 接口未继承 BaseMapper
echo ""
echo "【MP-08】检查 Mapper 接口未继承 BaseMapper..."
MAPPER_FILES=$(run_rg '^public\s+interface\s+\w+Mapper\b' -g '*.java' -l || true)
if [[ -n "$MAPPER_FILES" ]]; then
  while IFS= read -r file; do
    if ! rg -q 'extends\s+BaseMapper\s*<' "$file" 2>/dev/null; then
      print_error "Mapper 接口应继承 BaseMapper<T> 以获得 MyBatis-Plus 单表 CRUD 能力：$file"
    fi
  done <<< "$MAPPER_FILES"
else
  print_ok "MP-08 通过（无 Mapper 文件）"
fi

echo ""
echo "============================================"
if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}❌ 检查完成：$ERRORS 个阻断错误，$WARNINGS 个警告${NC}"
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo -e "${YELLOW}🟡 检查完成：0 个阻断错误，$WARNINGS 个警告${NC}"
  exit 0
else
  echo -e "${GREEN}✅ 全部通过，无违规项${NC}"
  exit 0
fi
