#!/usr/bin/env bash
# java-api/scripts/check-api.sh
# 覆盖：API-01~API-06、API-08（rg 扫 *-api 模块规范）
# 用法：bash check-api.sh [目标目录] [--files "file1 file2 ..."]

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
echo "  java-api / check-api.sh"
echo "  扫描范围: $TARGET"
echo "============================================"

# API-01  Feign 接口缺少 contextId 属性
echo ""
echo "【API-01】检查 @FeignClient 缺少 contextId..."
FEIGN_FILES=$(run_rg '@FeignClient' -g '*.java' -l || true)
if [[ -n "$FEIGN_FILES" ]]; then
  while IFS= read -r file; do
    if ! rg -q 'contextId\s*=' "$file" 2>/dev/null; then
      print_error "@FeignClient 缺少 contextId 属性，多个相同 name 的 FeignClient 会冲突：$file"
    fi
  done <<< "$FEIGN_FILES"
else
  print_ok "API-01 通过（无 FeignClient）"
fi

# API-02  @PathVariable 未写 value 属性
echo ""
echo "【API-02】检查 @PathVariable 未写 value 属性..."
HITS=$(run_rg '@PathVariable\s+[A-Za-z]' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_warning "@PathVariable 应显式指定 value 属性，避免编译后参数名丢失导致绑定失败：$line"
  done <<< "$HITS"
else
  print_ok "API-02 通过"
fi

# API-03  跨服务 DTO 未实现 Serializable
echo ""
echo "【API-03】检查跨服务 DTO 未实现 Serializable..."
DTO_FILES=$(run_rg 'class\s+\w*DTO\b\|class\s+\w*Dto\b' -g '*.java' -l || true)
if [[ -n "$DTO_FILES" ]]; then
  while IFS= read -r file; do
    if ! rg -q 'implements.*Serializable' "$file" 2>/dev/null; then
      print_error "跨服务 DTO 应实现 Serializable 接口（MQ/Feign 序列化需要）：$file"
    fi
  done <<< "$DTO_FILES"
else
  print_ok "API-03 通过（无 DTO 文件）"
fi

# API-04  跨服务 DTO 缺少 serialVersionUID
echo ""
echo "【API-04】检查跨服务 DTO 缺少 serialVersionUID..."
if [[ -n "$DTO_FILES" ]]; then
  while IFS= read -r file; do
    if rg -q 'implements.*Serializable' "$file" 2>/dev/null; then
      if ! rg -q 'serialVersionUID' "$file" 2>/dev/null; then
        print_warning "实现 Serializable 的 DTO 缺少 serialVersionUID，反序列化时版本号不匹配会抛异常：$file"
      fi
    fi
  done <<< "$DTO_FILES"
else
  print_ok "API-04 通过"
fi

# API-05  跨服务 DTO 缺少 @NoArgsConstructor
echo ""
echo "【API-05】检查跨服务 DTO 缺少 @NoArgsConstructor..."
if [[ -n "$DTO_FILES" ]]; then
  while IFS= read -r file; do
    if ! rg -q '@NoArgsConstructor' "$file" 2>/dev/null; then
      print_error "跨服务 DTO 应添加 @NoArgsConstructor（Feign/MQ 反序列化需要无参构造）：$file"
    fi
  done <<< "$DTO_FILES"
else
  print_ok "API-05 通过"
fi

# API-06  消费方直接判断 result.getCode() != 200
echo ""
echo "【API-06】检查消费方直接判断 result.getCode()..."
HITS=$(run_rg '\.getCode\s*\(\s*\)\s*[=!]=\s*(200|0)' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "消费 Feign 返回值应直接调用 .getData()，禁止手动判断 getCode()==200（Result 封装已处理异常）：$line"
  done <<< "$HITS"
else
  print_ok "API-06 通过"
fi

# API-08  跨服务 Topic 常量重复定义
echo ""
echo "【API-08】检查跨服务 Topic 常量重复定义..."
TOPIC_VALUES=$(run_rg 'String\s+\w*TOPIC\w*\s*=\s*"[^"]+"' -g '*.java' -o || true)
if [[ -n "$TOPIC_VALUES" ]]; then
  DUPLICATE=$(echo "$TOPIC_VALUES" | grep -oE '"[^"]+"' | sort | uniq -d || true)
  if [[ -n "$DUPLICATE" ]]; then
    print_error "发现重复定义的 Topic 常量值：$DUPLICATE（消费方应直接引用生产方 api 模块中的 MqConst）"
  else
    print_ok "API-08 通过"
  fi
else
  print_ok "API-08 通过（无 Topic 常量）"
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
