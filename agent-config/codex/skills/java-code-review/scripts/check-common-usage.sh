#!/usr/bin/env bash
# java-code-review/scripts/check-common-usage.sh
# 覆盖：CM-01~CM-06（common 模块标准用法检查）
# 用法：bash check-common-usage.sh [目标目录]
#       bash check-common-usage.sh --files "file1.java file2.java ..."
#
# CM-01  Entity 未继承 BaseEntity（common-spring 提供）
# CM-02  禁止 UUID.randomUUID() 作为业务 ID（应使用 @TableId ASSIGN_ID 或 SnowflakeUtil）
# CM-03  禁止 new Thread() / CompletableFuture.runAsync(r) 裸调无 executor（应用 AsyncUtil）
# CM-04  禁止自定义 ThreadLocal 获取 userId/companyId（应用 SysContext）
# CM-05  分页入参未使用 Pageable（禁止自定义 page/pageSize/current/pageNo 散参）
# CM-06  禁止手动调用 SysContext.clear()（BaseListener 框架层已处理，业务代码调用多余且风险高）

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
    # --with-filename 确保单文件输入也带路径前缀，便于后续 grep 过滤（如 'Test\.java'）
    rg --with-filename --no-heading -n "${flags[@]+"${flags[@]}"}" "$pattern" "${INCREMENTAL_FILES[@]}" 2>/dev/null || true
  else
    rg --no-heading -n "${flags[@]+"${flags[@]}"}" "$pattern" "$TARGET" 2>/dev/null || true
  fi
}

echo "============================================"
echo "  java-code-review / check-common-usage.sh"
echo "  检查 common 模块标准用法（CM-01~CM-06）"
echo "  扫描范围: ${TARGET}"
echo "============================================"

# CM-01  Entity 未继承 BaseEntity
# 规则：文件名以 Entity.java 结尾，类定义中没有 extends BaseEntity
echo ""
echo "【CM-01】检查 Entity 未继承 BaseEntity..."
ENTITY_FILES=$(run_rg 'class\s+\w+Entity' -g '*Entity.java' -l || true)
CM01_ERRORS=0
if [[ -n "$ENTITY_FILES" ]]; then
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    [[ "$(basename "$f")" == "BaseEntity.java" ]] && continue
    if ! rg -q 'extends\s+BaseEntity' "$f" 2>/dev/null; then
      print_error "CM-01 Entity 未继承 BaseEntity（common-spring 已提供 id/createdAt/updatedAt 等公共字段）：$f"
      ((CM01_ERRORS++)) || true
    fi
  done <<< "$ENTITY_FILES"
fi
[[ $CM01_ERRORS -eq 0 ]] && print_ok "CM-01 通过"

# CM-02  Entity 主键禁止手动用 UUID 赋值（setId/含 id 变量且值为 UUID）
# UUID 用于 token/key/code 等字段是合法场景，给出 WARN 提示人工确认；疑似 ID 赋值给 ERROR
echo ""
echo "【CM-02】检查 UUID.randomUUID() 用作实体 ID..."
HITS=$(run_rg 'UUID\.randomUUID\(\)' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    # 疑似 ID 赋值：变量名/方法名含 id（case-insensitive），或调用 setId
    if echo "$line" | grep -qiE '\bid\s*=|\bsetId\s*\(|Long\s+id\b'; then
      print_error "CM-02 实体 ID 禁止使用 UUID，主键请用 @TableId(ASSIGN_ID)，手动生成 ID 用 SnowflakeUtil.nextId()：$line"
    else
      print_warning "CM-02 UUID.randomUUID() 用于非 ID 字段（token/key/code 等场景可接受，请确认不是主键）：$line"
    fi
  done <<< "$HITS"
else
  print_ok "CM-02 通过"
fi

# CM-03  禁止裸调 new Thread() 或无 executor 的 CompletableFuture.runAsync()
echo ""
echo "【CM-03】检查 new Thread() / 裸 CompletableFuture.runAsync()..."
# new Thread( 直接创建（排除测试文件：测试用例验证 ThreadLocal 隔离时必须显式控制线程生命周期）
HITS=$(run_rg 'new\s+Thread\s*\(' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  FILTERED=$(echo "$HITS" | grep -v 'Test\.java\|/test/' || true)
  if [[ -n "$FILTERED" ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      print_error "CM-03 禁止 new Thread() 创建线程，应使用 AsyncUtil.run() / AsyncUtil.supply()：$line"
    done <<< "$FILTERED"
  else
    print_ok "CM-03a 通过（仅测试代码使用，已豁免）"
  fi
else
  print_ok "CM-03a 通过（无 new Thread）"
fi
# CompletableFuture.runAsync(x) 只有一个参数（无 executor）
HITS=$(run_rg 'CompletableFuture\.(runAsync|supplyAsync)\s*\(\s*[^,)]+\s*\)' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  # 排除 AsyncUtil 自身的实现代码
  FILTERED=$(echo "$HITS" | grep -v 'AsyncUtil\.java' || true)
  if [[ -n "$FILTERED" ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      print_error "CM-03 CompletableFuture.runAsync/supplyAsync 缺少 Executor 参数，应使用 AsyncUtil.run() / AsyncUtil.supply()：$line"
    done <<< "$FILTERED"
  else
    print_ok "CM-03b 通过（CompletableFuture 均有 executor）"
  fi
else
  print_ok "CM-03b 通过（无裸 CompletableFuture.runAsync）"
fi

# CM-04  禁止自定义 ThreadLocal 存 userId/companyId（应用 SysContext）
echo ""
echo "【CM-04】检查自定义 ThreadLocal 替代 SysContext..."
HITS=$(run_rg 'ThreadLocal\s*<.*(userId|companyId|user_id|company_id|currentUser|loginUser)' -i -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  # 排除 SysContext 自身
  FILTERED=$(echo "$HITS" | grep -v 'SysContext\.java' || true)
  if [[ -n "$FILTERED" ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      print_error "CM-04 禁止自定义 ThreadLocal 存储用户信息，统一使用 SysContext.getUserId() / SysContext.getCompanyId()：$line"
    done <<< "$FILTERED"
  else
    print_ok "CM-04 通过"
  fi
else
  print_ok "CM-04 通过"
fi

# CM-05  分页入参未使用 Pageable（自定义 page/pageSize/current/pageNo 散参）
# 规则：DTO/Request 类中声明了 page/pageSize/pageNo/current + size 字段，而非继承/组合 Pageable
echo ""
echo "【CM-05】检查分页入参未使用标准 Pageable..."
HITS=$(run_rg \
  'private\s+(Integer|int|Long|long)\s+(pageSize|pageNo|page_size|page_no)\s*;' \
  -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    # 排除 Pageable 自身及其测试
    if echo "$line" | grep -qE 'Pageable\.java|PageableTest\.java'; then
      continue
    fi
    print_warning "CM-05 分页参数应使用 common-base 的 Pageable，禁止在 DTO 中散落声明 pageSize/pageNo 字段：$line"
  done <<< "$HITS"
else
  print_ok "CM-05 通过"
fi

# CM-06  业务代码手动调用 SysContext.clear()（BaseListener 框架层 finally 已保证，业务层调用多余且易导致上下文提前清除）
echo ""
echo "【CM-06】检查业务代码手动调用 SysContext.clear()..."
HITS=$(run_rg 'SysContext\.clear\s*\(\s*\)' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  # 排除 BaseListener / SysContext 自身，以及测试文件（测试中手动清理 context 是合理的）
  # 同时排除 Javadoc / 行注释（形如 "<file>:<lineno>:   * ..." 或 "// ..."）
  # 以及行末显式标注 "// CM-06-EXEMPT" 的合法豁免点（如线程池 TaskDecorator finally、Web Filter 入口 finally）
  FILTERED=$(echo "$HITS" | grep -v 'BaseListener\.java\|SysContext\.java\|Test\.java\|test/' \
    | grep -Ev ':[0-9]+:\s*\*|:[0-9]+:\s*//' \
    | grep -v 'CM-06-EXEMPT' || true)
  if [[ -n "$FILTERED" ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      print_warning "CM-06 业务代码无需手动调用 SysContext.clear()（BaseListener.onMessage finally 块已处理），多余调用可能导致上下文提前清除：$line"
    done <<< "$FILTERED"
  else
    print_ok "CM-06 通过"
  fi
else
  print_ok "CM-06 通过"
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
  echo -e "${GREEN}✅ 全部通过，common 模块使用规范${NC}"
  exit 0
fi
