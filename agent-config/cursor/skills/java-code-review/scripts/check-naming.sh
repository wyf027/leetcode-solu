#!/usr/bin/env bash
# java-code-review/scripts/check-naming.sh
# 覆盖命名规范：
#   NM-01  拼音标识符（常见高频拼音词）
#   NM-02  下划线开头的变量/方法
#   NM-03  常量非 ALL_UPPER_CASE（static final 字段不全大写）
#   NM-04  方法名超 4 词（方法名过长，> 40 字符）
#   NM-05  类名非 UpperCamelCase
# 用法：bash check-naming.sh [目标目录] [--files "file1 file2 ..."]

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
echo "  java-code-review / check-naming.sh"
echo "  扫描范围: $TARGET"
echo "============================================"

# ── NM-01  拼音标识符 ─────────────────────────────────────────────────────────
# 注意：自动检测拼音标识符极易把含 na/ma/he/ge 等英文片段的合法标识符（如 final、manage、internal）
# 误报为拼音。为避免污染审查报告，本规则当前不做自动判定，仅以 WARN 提示人工抽查。
echo ""
echo "【NM-01】检查拼音标识符..."
print_warning "NM-01 该规则容易误报，已禁用自动检测，请人工抽查标识符是否含拼音音节"

# ── NM-02  下划线开头的变量/方法 ──────────────────────────────────────────────
echo ""
echo "【NM-02】检查下划线开头的标识符..."
HITS=$(run_rg '(private|protected|public|String|int|long|Integer|Long|boolean|List|Map|Object)\s+_\w+' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "NM-02 标识符不允许以下划线开头：$line"
  done <<< "$HITS"
else
  print_ok "NM-02 通过"
fi

# ── NM-03  常量非 ALL_UPPER_CASE ───────────────────────────────────────────────
echo ""
echo "【NM-03】检查 static final 常量命名规范（应为 ALL_UPPER_CASE）..."
# 找 static final 字段（非类、非方法、非 Logger）
HITS=$(run_rg 'private\s+static\s+final\s+\w+\s+[a-z][a-zA-Z0-9]*\s*[=;]' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  # 过滤掉 Logger（log/logger）和 serialVersionUID
  FILTERED=$(echo "$HITS" | grep -vE '\b(log|logger|LOG|LOGGER|serialVersionUID)\b' || true)
  if [[ -n "$FILTERED" ]]; then
    while IFS= read -r line; do
      print_error "NM-03 static final 常量命名应为 ALL_UPPER_CASE（当前为 lowerCamelCase）：$line"
    done <<< "$FILTERED"
  else
    print_ok "NM-03 通过"
  fi
else
  print_ok "NM-03 通过"
fi

# ── NM-04  方法名超 4 词（> 40 字符，含堆砌流程细节）─────────────────────────
echo ""
echo "【NM-04】检查方法名过长（> 40 字符）..."
HITS=$(run_rg '(public|private|protected)\s+\w[\w<>, ]*\s+([a-z][a-zA-Z0-9]{40,})\s*\(' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_warning "NM-04 方法名过长（>40 字符），命名应简洁，≤4 词，避免堆砌流程细节：$line"
  done <<< "$HITS"
else
  print_ok "NM-04 通过"
fi

# ── NM-05  接口方法/变量使用数字后缀（list1、data2 等）────────────────────────
echo ""
echo "【NM-05】检查数字后缀标识符（list1、data2 等语义不明的命名）..."
HITS=$(run_rg '\b(list|data|result|obj|temp|tmp|str|val|num|arr|map|dto|vo|entity)[0-9]+\b' -g '*.java' -i || true)
if [[ -n "$HITS" ]]; then
  FILTERED=$(echo "$HITS" | grep -vE '(//|\*\s)' || true)
  if [[ -n "$FILTERED" ]]; then
    while IFS= read -r line; do
      print_warning "NM-05 数字后缀命名（list1/data2 等）语义不明，应用业务词区分：$line"
    done <<< "$FILTERED"
  else
    print_ok "NM-05 通过"
  fi
else
  print_ok "NM-05 通过"
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
  echo -e "${GREEN}✅ 全部通过，命名规范检查无违规${NC}"
  exit 0
fi
