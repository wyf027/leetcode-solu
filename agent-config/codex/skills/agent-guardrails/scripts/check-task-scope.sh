#!/usr/bin/env bash
# agent-guardrails/scripts/check-task-scope.sh
# 覆盖：
#   AG-01  检查任务描述中是否存在二义性关键词（"优化"/"改一下"/"完善"）
#   AG-02  统计本次 diff 涉及文件数，超过阈值时提示范围过大
#
# 用法：
#   AG-01 模式（检查任务描述文本）：
#     bash check-task-scope.sh --task "帮我优化一下代码"
#     bash check-task-scope.sh --task-file task.txt
#
#   AG-02 模式（检查 git diff 文件数）：
#     bash check-task-scope.sh --diff              # 检查暂存区变更
#     bash check-task-scope.sh --diff --threshold 15
#
#   组合模式（同时运行 AG-01 + AG-02）：
#     bash check-task-scope.sh --task "..." --diff

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

print_error()   { echo -e "${RED}❌ [ERROR]${NC} $*"; ((ERRORS++)) || true; }
print_warning() { echo -e "${YELLOW}🟡 [WARN] ${NC} $*"; ((WARNINGS++)) || true; }
print_ok()      { echo -e "${GREEN}✅ $*${NC}"; }
print_info()    { echo -e "${CYAN}ℹ  $*${NC}"; }

# ────────────────────────────────────────────────
# 解析参数
# ────────────────────────────────────────────────
TASK_TEXT=""
TASK_FILE=""
CHECK_DIFF=false
DIFF_THRESHOLD=10   # 默认阈值：超过 10 个文件时警告，超过 20 个时阻断

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task)
      TASK_TEXT="$2"; shift 2 ;;
    --task-file)
      TASK_FILE="$2"; shift 2 ;;
    --diff)
      CHECK_DIFF=true; shift ;;
    --threshold)
      DIFF_THRESHOLD="$2"; shift 2 ;;
    --help|-h)
      grep '^#' "$0" | head -20 | sed 's/^# \?//'
      exit 0 ;;
    *)
      echo "未知参数: $1（--help 查看用法）" >&2
      exit 1 ;;
  esac
done

if [[ -z "$TASK_TEXT" && -z "$TASK_FILE" && "$CHECK_DIFF" == "false" ]]; then
  echo "用法："
  echo "  bash $(basename "$0") --task \"任务描述\"              # AG-01"
  echo "  bash $(basename "$0") --task-file task.txt          # AG-01"
  echo "  bash $(basename "$0") --diff [--threshold N]        # AG-02"
  echo "  bash $(basename "$0") --task \"...\" --diff           # AG-01 + AG-02"
  exit 1
fi

echo "============================================"
echo "  agent-guardrails / check-task-scope.sh"
echo "============================================"

# ────────────────────────────────────────────────
# AG-01  任务描述歧义关键词检查
# ────────────────────────────────────────────────
if [[ -n "$TASK_TEXT" || -n "$TASK_FILE" ]]; then
  echo ""
  echo "【AG-01】检查任务描述是否含歧义关键词..."

  if [[ -n "$TASK_FILE" ]]; then
    if [[ ! -f "$TASK_FILE" ]]; then
      print_error "任务文件不存在：$TASK_FILE"
      exit 1
    fi
    TASK_TEXT=$(cat "$TASK_FILE")
  fi

  # 歧义关键词分两级：阻断级（需要强制澄清）和警告级（建议确认）
  declare -a BLOCK_WORDS=(
    "优化一下" "改一下" "完善一下" "整理一下" "处理一下"
    "优化下" "改下" "完善下" "整理下"
    "随便" "都行" "看着办" "差不多" "随意"
    "全部" "所有地方" "到处" "整个项目"
  )

  declare -a WARN_WORDS=(
    "优化" "完善" "整理" "改进" "调整" "处理" "重构"
    "提升" "改善" "修一下" "看看"
  )

  AG01_BLOCK=false
  AG01_WARN=false

  for word in "${BLOCK_WORDS[@]}"; do
    if echo "$TASK_TEXT" | grep -qF "$word"; then
      print_error "AG-01 任务描述含强歧义关键词「${word}」，必须先与用户确认具体范围与验收标准"
      AG01_BLOCK=true
    fi
  done

  for word in "${WARN_WORDS[@]}"; do
    if echo "$TASK_TEXT" | grep -qF "$word"; then
      # 避免重复报告（阻断词命中后不再警告）
      if [[ "$AG01_BLOCK" == "false" ]]; then
        print_warning "AG-01 任务描述含模糊词「${word}」，建议先确认：期望输入/输出是什么？涉及哪些文件/方法？"
        AG01_WARN=true
      fi
    fi
  done

  if [[ "$AG01_BLOCK" == "false" && "$AG01_WARN" == "false" ]]; then
    print_ok "AG-01 任务描述无明显歧义关键词"
  fi

  # 额外检查：任务描述过短（可能信息不足）
  WORD_COUNT=$(echo "$TASK_TEXT" | wc -w | tr -d ' ')
  if [[ "$WORD_COUNT" -lt 5 ]]; then
    print_warning "AG-01 任务描述过短（仅 ${WORD_COUNT} 个词），信息可能不足，建议补充背景与验收条件"
  fi

  # 检查是否缺少验收标准关键词
  if ! echo "$TASK_TEXT" | grep -qE '验收|完成标准|期望|效果|结果|输出|测试|需要|应该|要求'; then
    print_warning "AG-01 任务描述未提及预期结果或验收标准，建议在开始前确认「完成后如何验证」"
  fi
fi

# ────────────────────────────────────────────────
# AG-02  git diff 文件数超阈值检查
# ────────────────────────────────────────────────
if [[ "$CHECK_DIFF" == "true" ]]; then
  echo ""
  echo "【AG-02】检查本次变更范围..."

  if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_warning "AG-02 当前目录非 git 仓库，跳过 diff 检查"
  else
    # 获取暂存区 + 工作区变更文件数
    STAGED_COUNT=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
    UNSTAGED_COUNT=$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ')
    TOTAL_COUNT=$((STAGED_COUNT + UNSTAGED_COUNT))

    print_info "暂存区变更：${STAGED_COUNT} 个文件 | 工作区未暂存：${UNSTAGED_COUNT} 个文件 | 合计：${TOTAL_COUNT} 个文件"

    BLOCK_THRESHOLD=$((DIFF_THRESHOLD * 2))

    if [[ "$TOTAL_COUNT" -ge "$BLOCK_THRESHOLD" ]]; then
      print_error "AG-02 本次变更涉及 ${TOTAL_COUNT} 个文件（阻断阈值 ${BLOCK_THRESHOLD}），范围过大，建议拆分为多个独立任务分批提交"
    elif [[ "$TOTAL_COUNT" -ge "$DIFF_THRESHOLD" ]]; then
      print_warning "AG-02 本次变更涉及 ${TOTAL_COUNT} 个文件（警告阈值 ${DIFF_THRESHOLD}），范围较大，请确认是否可以拆分"
    else
      print_ok "AG-02 变更范围合理（${TOTAL_COUNT} 个文件，阈值 ${DIFF_THRESHOLD}）"
    fi

    # 额外信息：列出变更最多的目录
    if [[ "$TOTAL_COUNT" -ge "$DIFF_THRESHOLD" ]]; then
      echo ""
      print_info "变更文件按目录分布："
      {
        git diff --cached --name-only 2>/dev/null
        git diff --name-only 2>/dev/null
      } | sort -u | xargs -I{} dirname {} | sort | uniq -c | sort -rn | head -5 | \
        while read -r count dir; do
          echo "    ${count} 个文件  →  ${dir}/"
        done
    fi
  fi
fi

# ────────────────────────────────────────────────
# 汇总
# ────────────────────────────────────────────────
echo ""
echo "============================================"
if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}❌ 检查完成：${ERRORS} 个阻断问题，${WARNINGS} 个警告${NC}"
  echo ""
  echo -e "${RED}▶ 阻断问题须先解决，再继续任务实现${NC}"
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo -e "${YELLOW}🟡 检查完成：0 个阻断问题，${WARNINGS} 个警告${NC}"
  echo ""
  echo -e "${YELLOW}▶ 建议在继续前与用户确认上述警告项${NC}"
  exit 0
else
  print_ok "全部通过，任务边界清晰，可以开始实现"
fi
