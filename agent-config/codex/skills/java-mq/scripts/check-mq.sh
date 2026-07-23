#!/usr/bin/env bash
# java-mq/scripts/check-mq.sh
# 覆盖：MQ-01~MQ-02、MQ-04~MQ-05、MQ-07~MQ-08（rg 扫 MQ 使用规范）
# 用法：bash check-mq.sh [目标目录] [--files "file1 file2 ..."]

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
echo "  java-mq / check-mq.sh"
echo "  扫描范围: $TARGET"
echo "============================================"

# MQ-01  Listener 未继承 BaseListener（直接 implements RocketMQListener）
echo ""
echo "【MQ-01】检查 Listener 未继承 BaseListener..."
HITS=$(run_rg 'implements\s+RocketMQListener' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "Listener 应继承 BaseListener<T> 而非直接 implements RocketMQListener：$line"
  done <<< "$HITS"
else
  print_ok "MQ-01 通过"
fi

# MQ-02  @RocketMQMessageListener 注解中硬编码 Topic/Tag 字符串
echo ""
echo "【MQ-02】检查 @RocketMQMessageListener 硬编码 Topic/Tag..."
# 检测 topic 或 selectorExpression 使用了字符串字面量（非常量引用）
HITS=$(run_rg '@RocketMQMessageListener\s*\(' -g '*.java' -A 5 || true)
if [[ -n "$HITS" ]]; then
  # 过滤出含直接字符串的行
  FILTERED=$(echo "$HITS" | grep -E 'topic\s*=\s*"[^"]+"|selectorExpression\s*=\s*"[^*"]' || true)
  if [[ -n "$FILTERED" ]]; then
    while IFS= read -r line; do
      print_error "@RocketMQMessageListener 中 topic/selectorExpression 应引用 MqConst 常量，禁止硬编码：$line"
    done <<< "$FILTERED"
  else
    print_ok "MQ-02 通过"
  fi
else
  print_ok "MQ-02 通过（无 @RocketMQMessageListener）"
fi

# MQ-04  MQ 消息在 Controller/Mapper 层发送（应在 Service 层）
echo ""
echo "【MQ-04】检查 MQ 消息在 Controller/Mapper 层发送..."
if [[ ${#INCREMENTAL_FILES[@]} -gt 0 ]]; then
  # 增量模式：rg 对显式文件路径不应用 --glob 过滤，须手动按文件名筛选
  HITS=""
  for f in "${INCREMENTAL_FILES[@]}"; do
    [[ "$f" == /*/test/* || "$f" == */src/test/* ]] && continue
    case "$f" in
      *Controller.java|*Mapper.java)
        result=$(rg --no-heading -n 'RocketMqUtil\.' "$f" 2>/dev/null || true)
        [[ -n "$result" ]] && HITS="${HITS}${result}"$'\n'
        ;;
    esac
  done
else
  HITS=$(rg --no-heading -n -g '*Controller.java' -g '*Mapper.java' 'RocketMqUtil\.' "$TARGET" 2>/dev/null || true)
fi
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    print_error "MQ 消息发送应在 Service 层，禁止在 Controller/Mapper 中调用 RocketMqUtil：$line"
  done <<< "$HITS"
else
  print_ok "MQ-04 通过"
fi

# MQ-05  消费方重复定义生产方 Topic 常量字符串
echo ""
echo "【MQ-05】检查消费方重复定义 Topic 字符串常量..."
HITS=$(run_rg 'String\s+TOPIC\s*=\s*"' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  # 统计出现次数，如有多处则警告
  COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
  if [[ "$COUNT" -gt 1 ]]; then
    while IFS= read -r line; do
      print_warning "Topic 常量字符串重复定义，消费方应直接引用生产方 api 模块中的 MqConst：$line"
    done <<< "$HITS"
  else
    print_ok "MQ-05 通过"
  fi
else
  print_ok "MQ-05 通过"
fi

# MQ-07  MQ 消息 DTO 未实现 Serializable
echo ""
echo "【MQ-07】检查 MQ 消息 DTO 未实现 Serializable..."
# 找到 Message 后缀的 DTO 类（精确匹配以 Message 结尾的类名，排除 MessageHelper/MessageService 等工具类）
MSG_FILES=$(run_rg 'class\s+\w+Message\b' -g '*.java' -l || true)
if [[ -n "$MSG_FILES" ]]; then
  while IFS= read -r file; do
    if ! rg -q 'implements.*Serializable' "$file" 2>/dev/null; then
      print_error "MQ 消息 DTO 应实现 Serializable 接口：$file"
    fi
  done <<< "$MSG_FILES"
else
  print_ok "MQ-07 通过（无 Message 类）"
fi

# MQ-08  MQ 消息 DTO 含敏感字段（password/token）
echo ""
echo "【MQ-08】检查 MQ 消息 DTO 含敏感字段..."
if [[ ${#INCREMENTAL_FILES[@]} -gt 0 ]]; then
  # 增量模式：手动按文件名筛选 *Message*.java
  HITS=""
  for f in "${INCREMENTAL_FILES[@]}"; do
    case "$f" in
      *Message*.java)
        result=$(rg --no-heading -n -i 'private\s+\w+\s+(password|passwd|token|secret)\b' "$f" 2>/dev/null || true)
        [[ -n "$result" ]] && HITS="${HITS}${result}"$'\n'
        ;;
    esac
  done
else
  HITS=$(rg --no-heading -n -g '*Message*.java' -i 'private\s+\w+\s+(password|passwd|token|secret)\b' "$TARGET" 2>/dev/null || true)
fi
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    print_error "MQ 消息 DTO 含敏感字段（password/token 等），禁止通过 MQ 传递敏感信息：$line"
  done <<< "$HITS"
else
  print_ok "MQ-08 通过"
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
