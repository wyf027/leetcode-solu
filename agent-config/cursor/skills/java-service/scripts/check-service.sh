#!/usr/bin/env bash
# java-service/scripts/check-service.sh
# 覆盖：SV-02~SV-03、SV-05~SV-08、SV-10~SV-11（rg 扫 Service 层规范）
# 用法：bash check-service.sh [目标目录] [--files "file1 file2 ..."]

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

# 只扫 ServiceImpl 文件
find_service_impls() {
  if [[ ${#INCREMENTAL_FILES[@]} -gt 0 ]]; then
    printf '%s\n' "${INCREMENTAL_FILES[@]}" | grep -E 'Service(Impl)?\.java$' || true
  else
    find "$TARGET" -name '*ServiceImpl.java' 2>/dev/null || true
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

run_rg_service() {
  local pattern="$1"; shift
  local flags=("$@")
  if [[ ${#INCREMENTAL_FILES[@]} -gt 0 ]]; then
    local svc_files
    mapfile -t svc_files < <(find_service_impls)
    [[ ${#svc_files[@]} -eq 0 ]] && return 0
    rg --no-heading -n "${flags[@]+"${flags[@]}"}" "$pattern" "${svc_files[@]}" 2>/dev/null || true
  else
    rg --no-heading -n "${flags[@]+"${flags[@]}"}" "$pattern" --glob '*ServiceImpl.java' "$TARGET" 2>/dev/null || true
  fi
}

echo "============================================"
echo "  java-service / check-service.sh"
echo "  扫描范围: $TARGET"
echo "============================================"

# SV-02  Service 层直接注入他域 Mapper（跨域操作）
echo ""
echo "【SV-02】检查 Service 层跨域注入他域 Mapper..."
# 获取当前模块名（从路径推断）
MODULE=$(basename "$TARGET" 2>/dev/null || echo "unknown")
HITS=$(run_rg_service 'private\s+\w*Mapper\s+\w+' || true)
if [[ -n "$HITS" ]]; then
  # 简单检查：有多个不同 Mapper 注入（跨域风险）
  MAPPER_COUNT=$(echo "$HITS" | grep -oE '\w+Mapper' | sort -u | wc -l | tr -d ' ')
  if [[ "$MAPPER_COUNT" -gt 2 ]]; then
    while IFS= read -r line; do
      print_warning "Service 层注入过多 Mapper（共 $MAPPER_COUNT 个），可能存在跨域操作，建议通过其他 Service 访问：$line"
    done <<< "$(echo "$HITS" | head -5)"
  else
    print_ok "SV-02 通过"
  fi
else
  print_ok "SV-02 通过"
fi

# SV-03  Service 方法接收 HttpServletRequest/HttpSession 参数
echo ""
echo "【SV-03】检查 Service 方法接收 HttpServletRequest/HttpSession..."
HITS=$(run_rg_service 'HttpServletRequest|HttpSession|HttpServletResponse' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "Service 层方法禁止直接接收 HttpServletRequest/HttpSession 参数，应在 Controller 层提取后传入：$line"
  done <<< "$HITS"
else
  print_ok "SV-03 通过"
fi

# SV-05  Service 层 JSONObject/JSON.parseObject 操作
echo ""
echo "【SV-05】检查 Service 层 JSON 操作..."
HITS=$(run_rg_service 'JSONObject|JSON\.parseObject|JSON\.toJSONString|JSONArray' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "Service 层禁止直接使用 JSON 序列化/反序列化，应在 Convert 层或专用工具中处理：$line"
  done <<< "$HITS"
else
  print_ok "SV-05 通过"
fi

# SV-06  单写操作加了多余 @Transactional
echo ""
echo "【SV-06】检查单写操作多余 @Transactional..."
# 检测只有一行 DB 操作但加了 @Transactional 的方法（简化：扫简单 save/update 方法上有 @Transactional）
HITS=$(run_rg_service '@Transactional[^}]*\n[^}]*(save|update|remove|delete)\s*\(' -U || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_warning "检测到单写操作使用 @Transactional，单条 save/update/delete 无需加事务注解：$line"
  done <<< "$HITS"
else
  print_ok "SV-06 通过"
fi

# SV-07  查询方法加了 @Transactional（非 readOnly=true）
echo ""
echo "【SV-07】检查查询方法加 @Transactional..."
HITS=$(run_rg_service '@Transactional(?!\(readOnly\s*=\s*true\))' || true)
if [[ -n "$HITS" ]]; then
  # 进一步检测：该 @Transactional 方法是否为 get/query/find/list/page 前缀
  FILTERED=$(echo "$HITS" | grep -E '\-[0-9]+\-' || true)  # 占位，由下面实际逻辑处理
  # 直接遍历 ServiceImpl 文件检测
  SVC_FILES=$(find_service_impls)
  if [[ -n "$SVC_FILES" ]]; then
    while IFS= read -r file; do
      # 用 python 简单扫（这里用 rg 辅助）
      QUERY_TX=$(rg -n '@Transactional' "$file" 2>/dev/null | while IFS= read -r txline; do
        lineno=$(echo "$txline" | cut -d: -f1)
        # 向后找方法名
        NEXT_LINES=$(sed -n "$((lineno+1)),$((lineno+3))p" "$file" 2>/dev/null || true)
        if echo "$NEXT_LINES" | grep -qE '(get|query|find|list|page|count|select|fetch)\w*\s*\('; then
          echo "$file:$lineno:$txline"
        fi
      done || true)
      if [[ -n "$QUERY_TX" ]]; then
        while IFS= read -r line; do
          print_warning "查询方法不应加 @Transactional（如需只读事务请用 @Transactional(readOnly=true)）：$line"
        done <<< "$QUERY_TX"
      fi
    done <<< "$SVC_FILES"
  fi
  print_ok "SV-07 扫描完成"
else
  print_ok "SV-07 通过"
fi

# SV-08  ServiceImpl 使用 @RequiredArgsConstructor（可能引发循环依赖）
echo ""
echo "【SV-08】检查 ServiceImpl 使用 @RequiredArgsConstructor..."
HITS=$(run_rg_service '@RequiredArgsConstructor' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_warning "ServiceImpl 使用 @RequiredArgsConstructor 可能引发循环依赖，建议改用 @Resource 字段注入：$line"
  done <<< "$HITS"
else
  print_ok "SV-08 通过"
fi

# SV-10  baseMapper.selectById(id) 裸调用（应用 lambdaQuery）
echo ""
echo "【SV-10】检查 baseMapper.selectById 裸调用..."
HITS=$(run_rg_service 'baseMapper\.selectById\s*\(' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_warning "推荐使用 lambdaQuery().eq(Xxx::getId, id).one() 或封装为 findByIdOrThrow，避免直接调用 baseMapper.selectById：$line"
  done <<< "$HITS"
else
  print_ok "SV-10 通过"
fi

# SV-11  跨 Service 循环依赖未加 @Lazy
echo ""
echo "【SV-11】检查跨 Service 循环依赖未加 @Lazy..."
HITS=$(run_rg_service '@Resource[^;]*\n[^;]*Service\s+\w+' -U || true)
if [[ -z "$HITS" ]]; then
  HITS=$(run_rg_service 'private\s+\w+Service\s+\w+' || true)
fi
if [[ -n "$HITS" ]]; then
  # 检测是否有多个 Service 互相注入（循环依赖风险）
  COUNT=$(echo "$HITS" | grep -oE '\w+Service' | sort -u | wc -l | tr -d ' ')
  if [[ "$COUNT" -gt 3 ]]; then
    print_warning "ServiceImpl 注入了 $COUNT 个其他 Service，存在循环依赖风险，请检查依赖关系；如有循环依赖需加 @Lazy"
  else
    print_ok "SV-11 通过"
  fi
else
  print_ok "SV-11 通过"
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
