#!/usr/bin/env bash
# java-utils/scripts/check-utils.sh
# 覆盖：UT-01~UT-02、UT-04~UT-06（rg 扫工具类规范）
# 用法：bash check-utils.sh [目标目录] [--files "file1 file2 ..."]

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

# 找工具类文件
find_utils() {
  if [[ ${#INCREMENTAL_FILES[@]} -gt 0 ]]; then
    printf '%s\n' "${INCREMENTAL_FILES[@]}" | grep -E '(Utils|Helper)\.java$' || true
  else
    find "$TARGET" -name '*Utils.java' -o -name '*Helper.java' 2>/dev/null | grep -v 'test\|Test' || true
  fi
}

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
echo "  java-utils / check-utils.sh"
echo "  扫描范围: $TARGET"
echo "============================================"

UTILS_FILES=$(find_utils)

if [[ -z "$UTILS_FILES" ]]; then
  print_ok "无工具类文件，跳过检查"
  exit 0
fi

# UT-01  工具类注入 Spring Bean（禁止 @Resource/@Autowired）
echo ""
echo "【UT-01】检查工具类注入 Spring Bean..."
while IFS= read -r file; do
  HITS=$(rg -n '@(Resource|Autowired)' "$file" 2>/dev/null || true)
  if [[ -n "$HITS" ]]; then
    while IFS= read -r line; do
      print_error "工具类禁止注入 Spring Bean（@Resource/@Autowired），工具方法应为纯静态无状态：$file:$line"
    done <<< "$HITS"
  fi
done <<< "$UTILS_FILES"
[[ $ERRORS -eq 0 ]] && print_ok "UT-01 通过"

# UT-02  工具类非 final 类
echo ""
echo "【UT-02】检查工具类非 final 类..."
while IFS= read -r file; do
  if ! rg -q '^public\s+final\s+class' "$file" 2>/dev/null; then
    print_error "工具类应声明为 final class，防止被继承和实例化：$file"
  fi
done <<< "$UTILS_FILES"
[[ $ERRORS -eq 0 ]] && print_ok "UT-02 通过"

# UT-04  工具类含业务逻辑/DB 操作
echo ""
echo "【UT-04】检查工具类含 DB/业务逻辑..."
while IFS= read -r file; do
  HITS=$(rg -n 'baseMapper\.\|lambdaQuery\(\)\|getById\|SpringContextHolder\|ApplicationContext' "$file" 2>/dev/null || true)
  if [[ -n "$HITS" ]]; then
    while IFS= read -r line; do
      print_error "工具类禁止调用 DB/Spring Context（工具方法应只处理纯逻辑）：$file → $line"
    done <<< "$HITS"
  fi
done <<< "$UTILS_FILES"
[[ $ERRORS -eq 0 ]] && print_ok "UT-04 通过"

# UT-05  重复造轮子（已有 JDK/Hutool/Guava 实现）
echo ""
echo "【UT-05】检查重复造轮子..."
while IFS= read -r file; do
  fname=$(basename "$file")
  # 检查是否重复实现了 JDK / Hutool 已有的功能
  if echo "$fname" | grep -qiE '^(StringUtils|DateUtils|CollectionUtils|NumberUtils|FileUtils|ObjectUtils)'; then
    HUTOOL=$(rg -q 'import cn\.hutool\|import org\.apache\.commons\|import com\.google\.common' "$file" 2>/dev/null && echo "yes" || echo "no")
    if [[ "$HUTOOL" == "no" ]]; then
      print_warning "UT-05 $fname 可能重复实现了 Hutool/Commons 已有功能，请先确认 common-base/Hutool/Guava 中无现成方法：$file"
    fi
  fi
done <<< "$UTILS_FILES"
[[ $WARNINGS -eq 0 ]] && print_ok "UT-05 通过"

# UT-06  工具方法含状态（非 static 方法）
echo ""
echo "【UT-06】检查工具类含非 static 公开方法..."
while IFS= read -r file; do
  HITS=$(rg -n '^\s*public\s+(?!static)[a-zA-Z<>\[\]]' "$file" 2>/dev/null | grep -v 'class\|interface\|enum\|@' || true)
  if [[ -n "$HITS" ]]; then
    while IFS= read -r line; do
      print_error "工具类中的公开方法应全部为 static，禁止实例方法：$file → $line"
    done <<< "$HITS"
  fi
done <<< "$UTILS_FILES"

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
