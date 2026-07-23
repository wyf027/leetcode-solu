#!/usr/bin/env bash
# git-commit/scripts/check-push-target.sh
# 覆盖：GC-PUSH-01（推送必须显式 origin + 分支）、GC-PUSH-02（MR/PR 链接必须展示目标分支）、GC-PUSH-03（MR 创建 URL 必须带 target_branch）
# 用法：
#   bash check-push-target.sh <文件或目录>
#   bash check-push-target.sh --files "f1.md f2.sh"

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

ERRORS=0
print_error() { echo -e "${RED}❌ [ERROR]${NC} $*"; ERRORS=$((ERRORS+1)); }
print_ok()    { echo -e "${GREEN}✅ $*${NC}"; }

TARGET="${1:-.}"
INCREMENTAL_FILES=()
if [[ "${1:-}" == "--files" ]]; then
  read -ra INCREMENTAL_FILES <<< "${2:-}"
  TARGET="."
elif [ "$#" -gt 0 ]; then
  if [ "$#" -eq 1 ] && [ -e "$1" ]; then
    TARGET="$1"
  else
    for f in "$@"; do INCREMENTAL_FILES+=("$f"); done
  fi
fi

is_scannable_file() {
  case "$1" in
    *.md|*.sh|*.bash|*.zsh|*.txt) return 0 ;;
    *) return 1 ;;
  esac
}

collect_files() {
  if [ "${#INCREMENTAL_FILES[@]}" -gt 0 ]; then
    printf '%s\n' "${INCREMENTAL_FILES[@]}"
    return 0
  fi

  if [ -f "$TARGET" ]; then
    printf '%s\n' "$TARGET"
    return 0
  fi

  if [ -d "$TARGET" ]; then
    rg --files \
      -g '*.md' -g '*.sh' -g '*.bash' -g '*.zsh' -g '*.txt' \
      "$TARGET" 2>/dev/null || true
  fi
}

check_file() {
  local file="$1"
  awk '
    function trim(s) {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", s)
      return s
    }

    function explicit_push(line, tokens, n, i, token, remote_seen) {
      n = split(line, tokens, /[[:space:]]+/)
      remote_seen = 0

      for (i = 3; i <= n; i++) {
        token = tokens[i]
        if (token == "" || token ~ /^#/) {
          continue
        }
        if (token ~ /^-/) {
          continue
        }
        if (remote_seen == 1) {
          return 1
        }
        if (token == "origin") {
          remote_seen = 1
          continue
        }
        return 0
      }

      return 0
    }

    function has_target_branch_nearby(idx, start, end, j) {
      start = idx - 8
      if (start < 1) {
        start = 1
      }
      end = idx + 8
      if (end > NR) {
        end = NR
      }

      for (j = start; j <= end; j++) {
        if (lines[j] ~ /(目标分支|TARGET_BRANCH|target branch|base branch|--base|MR 目标分支|原目标分支)/) {
          return 1
        }
      }
      return 0
    }

    function is_mr_create_url(line) {
      return line ~ /merge_requests\/new/
    }

    function has_source_branch_param(line) {
      return line ~ /(merge_request%5[Bb]source_branch%5[Dd]|merge_request\[source_branch\]|[?&]source_branch=)/
    }

    function has_target_branch_param(line) {
      return line ~ /(merge_request%5[Bb]target_branch%5[Dd]|merge_request\[target_branch\]|[?&]target_branch=)/
    }

    {
      lines[NR] = $0
    }

    END {
      for (i = 1; i <= NR; i++) {
        raw = lines[i]
        line = raw
        sub(/^[[:space:]]*\$[[:space:]]*/, "", line)
        line = trim(line)

        if (line ~ /^git[[:space:]]+push([[:space:]]|$)/ && explicit_push(line) == 0) {
          printf "%s:%d git push 必须显式写出 origin 和源分支，例如：git push origin \"$SOURCE_BRANCH\"\n", FILENAME, i
        }

        if (raw ~ /(MR|PR|合并请求|Pull Request|Merge Request)/ && raw ~ /(链接|URL|http|https)/) {
          if (has_target_branch_nearby(i) == 0) {
            printf "%s:%d MR/PR 链接输出附近必须展示目标分支，避免合并方向错误\n", FILENAME, i
          }
        }

        if (is_mr_create_url(raw) && has_source_branch_param(raw) && has_target_branch_param(raw) == 0) {
          printf "%s:%d GitLab MR 创建链接必须在 URL 中显式包含 target_branch 参数，例如：merge_request%%5Btarget_branch%%5D=dev，禁止依赖默认目标分支\n", FILENAME, i
        }
      }
    }
  ' "$file"
}

echo "============================================"
echo "  git-commit / check-push-target.sh"
echo "  扫描范围: ${TARGET}"
echo "============================================"

SCAN_COUNT=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  [ -f "$file" ] || continue
  is_scannable_file "$file" || continue

  SCAN_COUNT=$((SCAN_COUNT+1))
  HITS=$(check_file "$file" || true)
  if [ -n "$HITS" ]; then
    while IFS= read -r hit; do
      [ -n "$hit" ] && print_error "$hit"
    done <<< "$HITS"
  fi
done < <(collect_files)

echo ""
echo "============================================"
if [ "$ERRORS" -gt 0 ]; then
  echo -e "${RED}❌ check-push-target 完成：$ERRORS 个阻断错误${NC}"
  exit 1
fi

print_ok "check-push-target 通过（扫描 ${SCAN_COUNT} 个文件）"
exit 0
