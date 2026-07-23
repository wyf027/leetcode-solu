#!/usr/bin/env bash
# java-testing/scripts/check-test-style.sh
# 覆盖：TS-02（方法命名规范）、TS-03（@SpringBootTest 检查）、TS-05（Given/When/Then 结构）、TS-07（并发测试结构）
# 用法：bash check-test-style.sh [目标目录] [--files "file1 file2 ..."]

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

# 只扫测试文件
find_test_files() {
  if [[ ${#INCREMENTAL_FILES[@]} -gt 0 ]]; then
    printf '%s\n' "${INCREMENTAL_FILES[@]}" | grep -E 'Test\.java$' || true
  else
    find "$TARGET" -name '*Test.java' 2>/dev/null || true
  fi
}

run_rg() {
  local pattern="$1"; shift
  local flags=("$@")
  if [[ ${#INCREMENTAL_FILES[@]} -gt 0 ]]; then
    local test_files
    mapfile -t test_files < <(find_test_files)
    [[ ${#test_files[@]} -eq 0 ]] && return 0
    rg --no-heading -n "${flags[@]+"${flags[@]}"}" "$pattern" "${test_files[@]}" 2>/dev/null || true
  else
    rg --no-heading -n "${flags[@]+"${flags[@]}"}" "$pattern" --glob '*Test.java' "$TARGET" 2>/dev/null || true
  fi
}

echo "============================================"
echo "  java-testing / check-test-style.sh"
echo "  扫描范围: $TARGET"
echo "============================================"

# TS-02  测试方法命名不符合 should_xxx_when_xxx 规范
echo ""
echo "【TS-02】检查测试方法命名规范（should_xxx_when_xxx）..."
TEST_FILES=$(find_test_files)
if [[ -n "$TEST_FILES" ]]; then
  while IFS= read -r file; do
    # 找所有 @Test 标注的方法名
    TEST_METHODS=$(rg -n '@Test' "$file" -A 1 2>/dev/null | grep 'void\s\+\w' | grep -oE 'void\s+\w+' | awk '{print $2}' || true)
    while IFS= read -r method_name; do
      [[ -z "$method_name" ]] && continue
      # 检查是否符合 should_xxx_when_xxx 或 should_xxx_given_xxx
      if ! echo "$method_name" | grep -qE '^(should|test|verify|given|when)[A-Z_]|^should_.+_when_.+'; then
        print_warning "TS-02 测试方法命名不规范，期望 should_xxx_when_xxx 格式：$file → [$method_name]"
      fi
    done <<< "$TEST_METHODS"
  done <<< "$TEST_FILES"
else
  print_ok "TS-02 通过（无测试文件）"
fi

# TS-03  使用 @SpringBootTest（非必要时应用单元测试）
echo ""
echo "【TS-03】检查 @SpringBootTest 使用..."
HITS=$(run_rg '@SpringBootTest' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_warning "TS-03 使用了 @SpringBootTest（启动完整 Spring 上下文），大多数场景应用 @ExtendWith(MockitoExtension.class) 单元测试：$line"
  done <<< "$HITS"
else
  print_ok "TS-03 通过"
fi

# TS-05  测试方法无 Given/When/Then 结构注释
echo ""
echo "【TS-05】检查测试方法缺少 Given/When/Then 注释..."
if [[ -n "$TEST_FILES" ]]; then
  while IFS= read -r file; do
    # 统计 Given/When/Then 注释数量
    GWT_COUNT=$(rg -c '//\s*(given|when|then|arrange|act|assert)' -i "$file" 2>/dev/null || echo 0)
    TEST_COUNT=$(rg -c '@Test' "$file" 2>/dev/null || echo 0)
    if [[ "$TEST_COUNT" -gt 0 && "$GWT_COUNT" -eq 0 ]]; then
      print_warning "TS-05 测试文件缺少 // Given / When / Then 结构注释（共 $TEST_COUNT 个 @Test 方法）：$file"
    fi
  done <<< "$TEST_FILES"
else
  print_ok "TS-05 通过（无测试文件）"
fi

# TS-07  并发测试缺少 CountDownLatch/ExecutorService
echo ""
echo "【TS-07】检查并发测试缺少并发工具..."
CONCURRENT_FILES=$(run_rg -l '(并发|concurrent|thread|多线程|压测)' -i || true)
if [[ -n "$CONCURRENT_FILES" ]]; then
  while IFS= read -r file; do
    if ! rg -q 'CountDownLatch\|ExecutorService\|CyclicBarrier\|CompletableFuture' "$file" 2>/dev/null; then
      print_warning "TS-07 并发测试文件缺少 CountDownLatch/ExecutorService 等并发工具：$file"
    fi
  done <<< "$CONCURRENT_FILES"
else
  print_ok "TS-07 通过"
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
