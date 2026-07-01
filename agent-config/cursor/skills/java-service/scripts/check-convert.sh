#!/usr/bin/env bash
# java-service/scripts/check-convert.sh
# 检查 Convert 接口规范与 Service 层对象转换写法：
#
#   CON-01  Convert 接口缺少 @Mapper(componentModel = "spring")
#   CON-02  Convert 接口中注入了 Spring Bean（@Resource/@Autowired/@Inject）
#           → 暗示含业务逻辑或 DB 查询（禁止）
#   CON-03  Convert 接口中含明显 DB 操作关键词（mapper./repository.）
#   CON-04  Service 中存在手动逐字段 setter 复制（new XxxVO/DTO 后 .setXxx() 链）
#           → 应改为 Convert 接口方法
#   CON-05  Convert 方法签名缺少 Javadoc
#   CON-06  Service 中有 Entity→VO/DTO 的 new + setter，但对应 Convert 接口不存在
#
# 用法：bash check-convert.sh <扫描路径> [--files file1 file2 ...]

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

print_error()   { echo -e "${RED}❌ [ERROR]${NC} $1"; ((ERRORS++))   || true; }
print_warning() { echo -e "${YELLOW}🟡 [WARN] ${NC} $1"; ((WARNINGS++)) || true; }
print_ok()      { echo -e "${GREEN}✅ $1${NC}"; }

FILES_MODE=false
SCAN_ROOT=""
SPECIFIC_FILES=()

parse_args() {
  if [[ $# -eq 0 ]]; then
    echo "用法：bash check-convert.sh <路径> [--files file1 ...]"
    exit 1
  fi
  if [[ "$1" == "--files" ]]; then
    FILES_MODE=true
    shift
    SPECIFIC_FILES=("$@")
  else
    SCAN_ROOT="$1"
  fi
}

parse_args "$@"

get_java_files() {
  if [[ "$FILES_MODE" == "true" ]]; then
    for f in "${SPECIFIC_FILES[@]}"; do
      [[ "$f" == *.java ]] && echo "$f"
    done
  else
    find "$SCAN_ROOT" -name "*.java" \
      ! -path "*/target/*" \
      ! -path "*Test.java"
  fi
}

echo "============================================"
echo "  java-service / check-convert.sh"
echo "============================================"

# ─────────────────────────────────────────────────
# CON-01  Convert 接口缺少 @Mapper(componentModel = "spring")
# ─────────────────────────────────────────────────
echo ""
echo "【CON-01】检查 Convert 接口是否有 @Mapper(componentModel = \"spring\")..."
CON01_FOUND=false
while IFS= read -r f; do
  fname=$(basename "$f")
  [[ "$fname" != *Convert.java ]] && continue
  # 是 interface 并且没有 @Mapper
  if grep -q 'interface.*Convert' "$f" 2>/dev/null; then
    if ! grep -q '@Mapper' "$f" 2>/dev/null; then
      print_error "CON-01 Convert 接口缺少 @Mapper(componentModel = \"spring\")：$f"
      CON01_FOUND=true
    elif ! grep -q 'componentModel\s*=\s*"spring"' "$f" 2>/dev/null; then
      print_error "CON-01 @Mapper 缺少 componentModel = \"spring\"（Convert 需注册为 Spring Bean）：$f"
      CON01_FOUND=true
    fi
  fi
done < <(get_java_files)
[[ "$CON01_FOUND" == false ]] && print_ok "CON-01 通过"

# ─────────────────────────────────────────────────
# CON-02  Convert 接口注入了 Spring Bean → 暗示含业务逻辑
# ─────────────────────────────────────────────────
echo ""
echo "【CON-02】检查 Convert 接口是否注入了 Spring Bean..."
CON02_FOUND=false
while IFS= read -r f; do
  fname=$(basename "$f")
  [[ "$fname" != *Convert.java ]] && continue
  if grep -qE '@(Resource|Autowired|Inject)' "$f" 2>/dev/null; then
    HITS=$(grep -n '@\(Resource\|Autowired\|Inject\)' "$f" 2>/dev/null || true)
    while IFS= read -r h; do
      print_error "CON-02 Convert 接口中注入了 Spring Bean（禁止在 Convert 中写业务逻辑 / DB 操作）：$f:$h"
    done <<< "$HITS"
    CON02_FOUND=true
  fi
done < <(get_java_files)
[[ "$CON02_FOUND" == false ]] && print_ok "CON-02 通过"

# ─────────────────────────────────────────────────
# CON-03  Convert 中含 DB 操作关键词
# ─────────────────────────────────────────────────
echo ""
echo "【CON-03】检查 Convert 接口中是否含 DB 操作..."
CON03_FOUND=false
DB_KEYWORDS='(mapper\.|repository\.|lambdaQuery\(\)|lambdaUpdate\(\)|\.selectById\(|\.list\(|\.getById\()'
while IFS= read -r f; do
  fname=$(basename "$f")
  [[ "$fname" != *Convert.java ]] && continue
  HITS=$(rg -n "$DB_KEYWORDS" "$f" 2>/dev/null || true)
  if [[ -n "$HITS" ]]; then
    while IFS= read -r h; do
      print_error "CON-03 Convert 接口含 DB 操作（禁止在 Convert 中查数据库，业务逻辑应在 Service 中）：$f:$h"
    done <<< "$HITS"
    CON03_FOUND=true
  fi
done < <(get_java_files)
[[ "$CON03_FOUND" == false ]] && print_ok "CON-03 通过"

# ─────────────────────────────────────────────────
# CON-04  Service 中存在手动逐字段 setter 复制对象
#          特征：new XxxVO()/XxxDTO() 后跟 ≥ 3 个 .setXxx()，但无对应 Convert 调用
# ─────────────────────────────────────────────────
echo ""
echo "【CON-04】检查 Service 中是否存在手动 setter 复制对象（应改用 Convert）..."
CON04_FOUND=false

while IFS= read -r f; do
  fname=$(basename "$f")
  # 只检查 ServiceImpl
  [[ "$fname" != *ServiceImpl.java ]] && continue

  # 用 Python 做上下文分析：找 new XxxVO/DTO 后跟 3+ 个 .set 赋值
  # 用 Python 做上下文分析，捕获输出，统计错误行数
  PY_OUT=$(python3 - "$f" << 'PYEOF'
import sys, re

path = sys.argv[1]
try:
    lines = open(path, encoding='utf-8', errors='replace').readlines()
except Exception:
    sys.exit(0)

RED    = '\033[0;31m'
NC     = '\033[0m'

new_pojo_pat = re.compile(r'new\s+\w+(VO|DTO|Entity)\s*\(')
set_pat      = re.compile(r'\.\s*set[A-Z]\w+\s*\(')

i = 0
while i < len(lines):
    if new_pojo_pat.search(lines[i]):
        window = lines[i:i+15]
        set_count = sum(1 for l in window if set_pat.search(l))
        if set_count >= 3:
            pojo_match = re.search(r'new\s+(\w+(?:VO|DTO|Entity))', lines[i])
            pojo_name = pojo_match.group(1) if pojo_match else '?'
            print(
                f"{RED}❌ [ERROR]{NC} CON-04 Service 中手动 setter 复制对象 [{pojo_name}]"
                f"（{set_count} 处 .set...，应改为 Convert 接口）：{path}:{i+1}"
            )
    i += 1
PYEOF
)
  if [[ -n "$PY_OUT" ]]; then
    echo "$PY_OUT"
    ERROR_CNT=$(echo "$PY_OUT" | grep -c '❌' || true)
    ERRORS=$((ERRORS + ERROR_CNT))
    CON04_FOUND=true
  fi
done < <(get_java_files)
[[ "$CON04_FOUND" == false ]] && print_ok "CON-04 通过"
echo ""

# ─────────────────────────────────────────────────
# CON-05  Convert 方法签名缺少 Javadoc
# ─────────────────────────────────────────────────
echo "【CON-05】检查 Convert 接口方法是否有 Javadoc..."
CON05_FOUND=false
while IFS= read -r f; do
  fname=$(basename "$f")
  [[ "$fname" != *Convert.java ]] && continue

  python3 - "$f" << 'PYEOF'
import sys, re

path = sys.argv[1]
try:
    lines = open(path, encoding='utf-8', errors='replace').readlines()
except Exception:
    sys.exit(0)

YELLOW = '\033[1;33m'
NC     = '\033[0m'

# 方法签名特征（非 default 方法，非注解行）
method_pat = re.compile(
    r'^\s+(?!@|/|default\s|void\s+\w+\s*\()(?:\w[\w<>,\s]*)\s+\w+\s*\([^)]*\)\s*;'
)
javadoc_end = re.compile(r'\*/')

found_issue = False
for i, line in enumerate(lines):
    if method_pat.match(line):
        # 向上 6 行找是否有 Javadoc
        context = lines[max(0, i-6):i]
        has_javadoc = any('/**' in c or '*/' in c for c in context)
        if not has_javadoc:
            method_name = re.search(r'\s(\w+)\s*\(', line)
            name = method_name.group(1) if method_name else '?'
            print(
                f"{YELLOW}🟡 [WARN] {NC} CON-05 Convert 方法 [{name}] 缺少 Javadoc"
                f"（@Mapping 及特殊处理须注释说明）：{path}:{i+1}"
            )
            found_issue = True
PYEOF

done < <(get_java_files)
[[ "$CON05_FOUND" == false ]] && print_ok "CON-05 通过"

# ─────────────────────────────────────────────────
# CON-06  Service 中 new VO/DTO 但无对应 Convert 声明
# ─────────────────────────────────────────────────
echo ""
echo "【CON-06】检查 Service 是否有对应 Convert 接口..."
CON06_FOUND=false

if [[ "$FILES_MODE" == "false" && -n "$SCAN_ROOT" ]]; then
  # 收集所有 Convert 类名
  ALL_CONVERTS=$(find "$SCAN_ROOT" -name "*Convert.java" ! -path "*/target/*" \
    -exec basename {} .java \; 2>/dev/null | sort)

  while IFS= read -r f; do
    fname=$(basename "$f")
    [[ "$fname" != *ServiceImpl.java ]] && continue

    # 推断领域前缀（去掉 ServiceImpl 后缀）
    domain=$(echo "$fname" | sed 's/ServiceImpl\.java//')

    # 检查是否用了 Convert（有 DtoConvert / WebConvert 之类）
    has_convert_call=$(rg -q "${domain}.*Convert\|convert\." "$f" 2>/dev/null && echo "yes" || echo "no")

    # 有 new VO/DTO 且没有对应 Convert
    has_new_pojo=$(rg -q "new ${domain}(VO|DTO)" "$f" 2>/dev/null && echo "yes" || echo "no")

    if [[ "$has_new_pojo" == "yes" && "$has_convert_call" == "no" ]]; then
      # 检查对应 Convert 是否存在
      convert_exists=$(echo "$ALL_CONVERTS" | grep -i "${domain}.*Convert" || true)
      if [[ -z "$convert_exists" ]]; then
        print_warning "CON-06 ${domain}ServiceImpl 中有 new ${domain}VO/DTO，但找不到对应 Convert 接口（建议生成 ${domain}Convert）：$f"
        CON06_FOUND=true
      fi
    fi
  done < <(get_java_files)
fi
[[ "$CON06_FOUND" == false ]] && print_ok "CON-06 通过"

echo ""
echo "============================================"
if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}❌ 检查完成：${ERRORS} 个阻断错误，${WARNINGS} 个警告${NC}"
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo -e "${YELLOW}🟡 检查完成：0 个阻断错误，${WARNINGS} 个警告${NC}"
else
  print_ok "全部通过，Convert 规范检查无问题"
fi
