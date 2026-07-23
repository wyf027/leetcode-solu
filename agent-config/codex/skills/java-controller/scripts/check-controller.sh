#!/usr/bin/env bash
# java-controller/scripts/check-controller.sh
# 覆盖：CTL-01~CTL-11（Controller 层所有检查）
# 用法：bash check-controller.sh [目标目录] [--files "file1 file2 ..."]

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

# 只扫 Controller 文件
find_controllers() {
  if [[ ${#INCREMENTAL_FILES[@]} -gt 0 ]]; then
    printf '%s\n' "${INCREMENTAL_FILES[@]}" | grep -E 'Controller\.java$' || true
  else
    find "$TARGET" -name '*Controller.java' 2>/dev/null || true
  fi
}

run_rg() {
  local pattern="$1"; shift
  local flags=("$@")
  if [[ ${#INCREMENTAL_FILES[@]} -gt 0 ]]; then
    local ctrl_files
    mapfile -t ctrl_files < <(find_controllers)
    [[ ${#ctrl_files[@]} -eq 0 ]] && return 0
    rg --no-heading -n "${flags[@]+"${flags[@]}"}" "$pattern" "${ctrl_files[@]}" 2>/dev/null || true
  else
    rg --no-heading -n "${flags[@]+"${flags[@]}"}" "$pattern" --glob '*Controller.java' "$TARGET" 2>/dev/null || true
  fi
}

echo "============================================"
echo "  java-controller / check-controller.sh"
echo "  扫描范围: $TARGET"
echo "============================================"

# CTL-01  Controller 直接注入 Mapper
echo ""
echo "【CTL-01】检查 Controller 直接注入 Mapper..."
HITS=$(run_rg '@(Resource|Autowired)[^;]*\n[^;]*Mapper\s+\w+' -U || true)
if [[ -z "$HITS" ]]; then
  HITS=$(run_rg 'private\s+\w*Mapper\s+\w+' || true)
fi
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "Controller 禁止直接注入 Mapper，应通过 Service 层操作数据库：$line"
  done <<< "$HITS"
else
  print_ok "CTL-01 通过"
fi

# CTL-02  Entity 泄漏到 web 层（Controller import Entity 类）
echo ""
echo "【CTL-02】检查 Entity 泄漏到 Controller..."
HITS=$(run_rg 'import\s+[a-z.]+\.entity\.[A-Z]\w+' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "Controller 禁止直接引用 Entity 类，应使用 VO 出参：$line"
  done <<< "$HITS"
else
  print_ok "CTL-02 通过"
fi

# CTL-04  Controller 出参非 Result<XxxVO>
echo ""
echo "【CTL-04】检查 Controller 出参非 Result<XxxVO>..."
HITS=$(run_rg 'public\s+(?!Result<)[A-Za-z<>\[\]]+\s+\w+\s*\(' || true)
if [[ -n "$HITS" ]]; then
  # 过滤掉类声明、构造方法等
  FILTERED=$(echo "$HITS" | grep -v '@Override\|class \|void \|Result<\|ResponseEntity' || true)
  if [[ -n "$FILTERED" ]]; then
    while IFS= read -r line; do
      print_error "Controller 方法出参应为 Result<XxxVO>，禁止裸 Entity/List：$line"
    done <<< "$FILTERED"
  else
    print_ok "CTL-04 通过"
  fi
else
  print_ok "CTL-04 通过"
fi

# CTL-05  URL 路径含大写字母（路径参数 {xxx} 内的大写不计入）
echo ""
echo "【CTL-05】检查 URL 路径含大写字母..."
HITS=$(run_rg '@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping)\s*\(\s*"[^"]*[A-Z][^"]*"' || true)
CTL05_ERRORS=0
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    # 提取引号内的 URL，去掉 {pathVar} 占位符后再判断是否含大写
    url=$(echo "$line" | sed -n 's/.*"\([^"]*\)".*/\1/p' | head -1)
    url_stripped=$(echo "$url" | sed 's/{[^}]*}//g')
    if echo "$url_stripped" | grep -qE '[A-Z]'; then
      print_error "CTL-05 URL 路径应全小写连字符命名，路径段不允许大写字母（路径参数 {xxx} 除外）：$line"
      ((CTL05_ERRORS++)) || true
    fi
  done <<< "$HITS"
fi
[[ $CTL05_ERRORS -eq 0 ]] && print_ok "CTL-05 通过"

# CTL-06  URL 路径含动词（/getXxx /queryXxx /doXxx）
echo ""
echo "【CTL-06】检查 URL 路径含动词..."
HITS=$(run_rg '@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping)\s*\(\s*"[^"]*(\/get|\/query|\/do|\/fetch|\/load|\/find|\/select)[A-Z]' -i || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_warning "URL 路径含动词（/getXxx、/queryXxx），REST 风格应用名词资源路径：$line"
  done <<< "$HITS"
else
  print_ok "CTL-06 通过"
fi

# CTL-07  Controller 未使用 @RequiredArgsConstructor
echo ""
echo "【CTL-07】检查 Controller 未使用 @RequiredArgsConstructor..."
CTRL_FILES=$(find_controllers)
if [[ -n "$CTRL_FILES" ]]; then
  while IFS= read -r file; do
    if ! rg -q '@RequiredArgsConstructor' "$file" 2>/dev/null; then
      # 检查是否有注入字段（如有注入但没有 @RequiredArgsConstructor）
      if rg -q '@Resource\|@Autowired\|private final' "$file" 2>/dev/null; then
        print_error "Controller 应使用 @RequiredArgsConstructor + private final 构造注入：$file"
      fi
    fi
  done <<< "$CTRL_FILES"
else
  print_ok "CTL-07 通过（无 Controller 文件）"
fi

# CTL-08  @RequestBody 入参缺少 @Valid/@Validated
echo ""
echo "【CTL-08】检查 @RequestBody 缺少 @Valid/@Validated..."
HITS=$(run_rg '@RequestBody\s+(?!@Valid|@Validated)\w' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_warning "@RequestBody 入参建议加 @Valid/@Validated 触发参数校验：$line"
  done <<< "$HITS"
else
  print_ok "CTL-08 通过"
fi

# CTL-09  分页接口 pageSize 无上限保护
echo ""
echo "【CTL-09】检查分页接口 pageSize 无上限保护..."
HITS=$(run_rg 'pageSize|page_size' -g '*Controller.java' "$TARGET" 2>/dev/null || true)
if [[ -n "$HITS" ]]; then
  # 简单检测：有 pageSize 但同文件没有 Math.min 或 > 限制
  while IFS= read -r match; do
    file=$(echo "$match" | cut -d: -f1)
    if ! rg -q 'Math\.min\|pageSize\s*>\|maxPageSize\|MAX_PAGE' "$file" 2>/dev/null; then
      print_warning "分页接口 pageSize 无上限保护，可能导致全表扫描：$file"
      break
    fi
  done <<< "$HITS"
else
  print_ok "CTL-09 通过"
fi

# CTL-10  批量接口入参集合无数量上限
echo ""
echo "【CTL-10】检查批量接口入参集合无数量上限..."
HITS=$(run_rg 'List<\w+>\s+\w+(Ids|List|Batch)' -g '*Controller.java' "$TARGET" 2>/dev/null || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r match; do
    file=$(echo "$match" | cut -d: -f1)
    if ! rg -q '@Size\|maxBatch\|MAX_BATCH\|Math\.min' "$file" 2>/dev/null; then
      print_warning "批量接口入参集合建议加 @Size(max=xxx) 限制数量上限：$file"
      break
    fi
  done <<< "$HITS"
else
  print_ok "CTL-10 通过"
fi

# CTL-11  路径参数 {id} 不在 URL 末尾（禁止 /{id}/sub、/{id}/action 等写法）
echo ""
echo "【CTL-11】检查路径参数 {id} 不在 URL 末尾..."
# 匹配：mapping 注解字符串中出现 {xxx}/ （路径变量后面还有 /，说明不在末尾）
HITS=$(run_rg '@(Get|Post|Put|Delete|Patch|Request)Mapping\s*\(\s*"[^"]*\{[^}]+\}/[^"]*"' || true)
CTL11_ERRORS=0
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    print_error "CTL-11 路径参数 {id} 必须放在 URL 末尾，禁止 /{id}/action 写法（应改为 /action/{id}）：$line"
    ((CTL11_ERRORS++)) || true
  done <<< "$HITS"
fi
[[ $CTL11_ERRORS -eq 0 ]] && print_ok "CTL-11 通过"

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
