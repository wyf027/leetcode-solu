#!/usr/bin/env bash
# java-project-structure/scripts/stats.sh
# 覆盖：PS-01（各服务代码量统计：Java 文件数/行数，按 api/service/web 分层）
# 用法：bash stats.sh [项目根目录]

set -euo pipefail

ROOT="${1:-.}"

echo "============================================"
echo "  java-project-structure / stats.sh"
echo "  代码量统计：$ROOT"
echo "============================================"
echo ""

SERVICES=("system" "platform" "integration" "hire" "assess" "commons")
LAYERS=("api" "service" "web")

printf "%-16s %-10s %10s %10s %10s %10s\n" "服务/模块" "分层" "Java文件数" "Java行数" "非空行数" "注释行数"
echo "$(printf '%.0s─' {1..70})"

TOTAL_FILES=0
TOTAL_LINES=0

for svc in "${SERVICES[@]}"; do
  SVC_DIR=$(find "$ROOT" -maxdepth 2 -type d -name "$svc" 2>/dev/null | head -1 || true)
  if [[ -z "$SVC_DIR" ]]; then
    continue
  fi

  for layer in "${LAYERS[@]}"; do
    LAYER_DIR="$SVC_DIR/$svc-$layer"
    if [[ ! -d "$LAYER_DIR" ]]; then
      # 尝试直接找 layer 子目录
      LAYER_DIR=$(find "$SVC_DIR" -maxdepth 1 -type d -name "*-$layer" 2>/dev/null | head -1 || true)
    fi
    if [[ -z "$LAYER_DIR" || ! -d "$LAYER_DIR" ]]; then
      continue
    fi

    FILE_COUNT=$(find "$LAYER_DIR" -name '*.java' -not -path '*/target/*' 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$FILE_COUNT" -eq 0 ]]; then
      continue
    fi

    # 总行数
    LINE_COUNT=$(find "$LAYER_DIR" -name '*.java' -not -path '*/target/*' -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}' || echo 0)
    # 非空行数
    NON_EMPTY=$(find "$LAYER_DIR" -name '*.java' -not -path '*/target/*' -exec grep -c '.' {} + 2>/dev/null | awk -F: '{sum+=$NF} END{print sum}' || echo 0)
    # 注释行（// 或 * 开头）
    COMMENT=$(find "$LAYER_DIR" -name '*.java' -not -path '*/target/*' -exec grep -cE '^\s*(/\*|\*|//)' {} + 2>/dev/null | awk -F: '{sum+=$NF} END{print sum}' || echo 0)

    printf "%-16s %-10s %10s %10s %10s %10s\n" "$svc" "$layer" "$FILE_COUNT" "$LINE_COUNT" "$NON_EMPTY" "$COMMENT"
    ((TOTAL_FILES += FILE_COUNT)) || true
    ((TOTAL_LINES += LINE_COUNT)) || true
  done
done

echo "$(printf '%.0s─' {1..70})"
printf "%-16s %-10s %10s %10s\n" "合计" "" "$TOTAL_FILES" "$TOTAL_LINES"
echo ""
echo "  说明："
echo "  - Java文件数：src/main/java 下非 target 目录的 .java 文件总数"
echo "  - Java行数：含空行和注释"
echo "  - 非空行数：去除纯空行"
echo "  - 注释行数：以 // 或 /* 或 * 开头的行"
echo "============================================"
