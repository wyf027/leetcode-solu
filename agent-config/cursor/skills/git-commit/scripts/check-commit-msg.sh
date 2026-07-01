#!/usr/bin/env bash
# git-commit/scripts/check-commit-msg.sh
# 覆盖：GC-03（Conventional Commits 格式验证）、GC-06（WIP 警告）
# 用法：bash check-commit-msg.sh <commit-msg-file>
# git hook 调用：作为 commit-msg hook 使用

set -euo pipefail

COMMIT_MSG_FILE="${1:-}"
if [[ -z "$COMMIT_MSG_FILE" ]]; then
  echo "用法：bash check-commit-msg.sh <commit-msg-file>"
  exit 1
fi

MSG=$(cat "$COMMIT_MSG_FILE")

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

print_error()   { echo -e "${RED}❌ [ERROR]${NC} $*"; ((ERRORS++)) || true; }
print_warning() { echo -e "${YELLOW}🟡 [WARN] ${NC} $*"; ((WARNINGS++)) || true; }

echo "============================================"
echo "  git-commit / check-commit-msg.sh"
echo "============================================"
echo "  Commit message:"
echo "  $MSG"
echo ""

# GC-03  Conventional Commits 格式验证
# 格式：type(scope): description
# type 允许：feat|fix|docs|style|refactor|perf|test|chore|revert|build|ci
echo "【GC-03】检查 Conventional Commits 格式..."
CONVENTIONAL_REGEX='^(feat|fix|docs|style|refactor|perf|test|chore|revert|build|ci)(\([a-zA-Z0-9_-]+\))?!?:\s+.{1,100}$'
FIRST_LINE=$(echo "$MSG" | head -1)

if ! echo "$FIRST_LINE" | grep -qE "$CONVENTIONAL_REGEX"; then
  print_error "commit message 不符合 Conventional Commits 规范"
  echo "  期望格式：type(scope): 描述"
  echo "  允许的 type：feat|fix|docs|style|refactor|perf|test|chore|revert|build|ci"
  echo "  示例：feat(user): 新增用户注册接口"
  echo "  当前：$FIRST_LINE"
else
  echo -e "${GREEN}✅ GC-03 通过${NC}"
fi

# GC-06  WIP / 临时 / TODO 警告
echo ""
echo "【GC-06】检查 WIP/临时提交..."
if echo "$MSG" | grep -qiE '\b(WIP|临时|todo|hack|fixme|TEMP|暂时)\b'; then
  print_warning "commit message 含 WIP/临时/TODO 关键词，建议提交正式版本前清理"
else
  echo -e "${GREEN}✅ GC-06 通过${NC}"
fi

echo ""
echo "============================================"
if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}❌ commit message 格式检查失败，提交被阻断${NC}"
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo -e "${YELLOW}🟡 commit message 通过，存在 $WARNINGS 个警告${NC}"
  exit 0
else
  echo -e "${GREEN}✅ commit message 检查通过${NC}"
  exit 0
fi
