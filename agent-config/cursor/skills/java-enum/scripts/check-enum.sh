#!/usr/bin/env bash
# java-enum/scripts/check-enum.sh
# 覆盖：EN-01~EN-02、EN-05~EN-08（rg 扫枚举/错误码规范）
# 用法：bash check-enum.sh [目标目录] [--files "file1 file2 ..."]

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
echo "  java-enum / check-enum.sh"
echo "  扫描范围: $TARGET"
echo "============================================"

# EN-01  枚举未实现 BaseEnum 接口
echo ""
echo "【EN-01】检查枚举未实现 BaseEnum..."
# 找到所有 enum 文件
ENUM_FILES=$(run_rg '^public\s+enum\s+\w+' -g '*.java' -l || true)
if [[ -n "$ENUM_FILES" ]]; then
  while IFS= read -r file; do
    if ! rg -q 'implements.*BaseEnum' "$file" 2>/dev/null; then
      # 跳过没有字段的简单枚举（如只有枚举值的情况）
      if rg -q 'private\s+(int|Integer|String|Long)\s+code' "$file" 2>/dev/null; then
        print_error "枚举未实现 BaseEnum 接口（含 code 字段的枚举必须实现）：$file"
      fi
    fi
  done <<< "$ENUM_FILES"
else
  print_ok "EN-01 通过（无枚举文件）"
fi

# EN-02  错误码未实现 ErrorCode 接口
echo ""
echo "【EN-02】检查错误码未实现 ErrorCode 接口..."
ERROR_CODE_FILES=$(run_rg 'ErrorCode|errorCode' -g '*.java' -l || true)
if [[ -n "$ERROR_CODE_FILES" ]]; then
  while IFS= read -r file; do
    if rg -q '^public\s+enum\s+\w*Error' "$file" 2>/dev/null; then
      if ! rg -q 'implements.*ErrorCode' "$file" 2>/dev/null; then
        print_error "错误码枚举未实现 ErrorCode 接口：$file"
      fi
    fi
  done <<< "$ERROR_CODE_FILES"
else
  print_ok "EN-02 通过"
fi

# EN-05  throw new RuntimeException（应改为 BusinessException）
echo ""
echo "【EN-05】检查 throw new RuntimeException..."
HITS=$(run_rg 'throw\s+new\s+RuntimeException\s*\(' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "禁止 throw new RuntimeException，应使用 BusinessException(ErrorCode) 统一异常处理：$line"
  done <<< "$HITS"
else
  print_ok "EN-05 通过"
fi

# EN-06  自定义 BizException/BizCode（禁止使用）
echo ""
echo "【EN-06】检查自定义 BizException/BizCode..."
HITS=$(run_rg 'class\s+(BizException|BizCode|AppException|ServiceException)\b' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "禁止自定义业务异常类（BizException/BizCode 等），统一使用 common-base 的 BusinessException：$line"
  done <<< "$HITS"
else
  print_ok "EN-06 通过"
fi

# EN-07  散落 200/500 魔法状态码
echo ""
echo "【EN-07】检查散落魔法状态码（200/500）..."
HITS=$(run_rg '(code|status|getCode)\s*[=!]=\s*(200|500|404|400|401|403)\b' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "禁止散落魔法状态码（200/500 等），应使用 ErrorCode 枚举常量：$line"
  done <<< "$HITS"
else
  print_ok "EN-07 通过"
fi

# EN-08  自定义 success()/fail() 方法
echo ""
echo "【EN-08】检查自定义 success()/fail() 方法..."
HITS=$(run_rg '(public|private)\s+\w+\s+(success|fail|ok|error)\s*\(' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  # 过滤掉测试类
  FILTERED=$(echo "$HITS" | grep -v 'Test\.java' || true)
  if [[ -n "$FILTERED" ]]; then
    while IFS= read -r line; do
      print_warning "自定义 success()/fail() 方法可能绕过统一 Result 封装，建议使用 Result.success()/Result.fail()：$line"
    done <<< "$FILTERED"
  else
    print_ok "EN-08 通过"
  fi
else
  print_ok "EN-08 通过"
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
