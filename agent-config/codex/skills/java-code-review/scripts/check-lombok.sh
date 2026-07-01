#!/usr/bin/env bash
# java-code-review/scripts/check-lombok.sh
# Lombok 使用规范检测：
#
#   LK-01  @Builder 用在 Entity 类上
#          → @Builder 生成 @AllArgsConstructor 并移除无参构造，MyBatis-Plus 反射失败
#   LK-02  @Builder + @Data 组合缺少 @NoArgsConstructor
#          → Jackson / Feign 反序列化时无法调用无参构造，运行时 NPE / 反序列化异常
#   LK-03  Entity 注解顺序不符合规范
#          → 规范顺序：@Data → @Accessors(chain=true) → @ToString(callSuper=true)
#             → @EqualsAndHashCode(callSuper=true) → @TableName
#   LK-04  @SneakyThrows 禁止使用
#          → 将 checked exception 强制包装为 RuntimeException，调用方无法感知并处理
#   LK-05  手动声明 private static final Logger 而非 @Slf4j（阻断）
#          → 禁止手动声明，统一用 @Slf4j + log 变量名
#   LK-06  @Accessors(chain=true) 用在 DTO / VO 上
#          → 链式 setter 破坏 JavaBean 规范，干扰 Jackson 反序列化和 MapStruct 映射
#   LK-07  @FieldDefaults 禁止使用
#          → 隐藏字段 access level，降低可读性，与 IDE 插件兼容性差
#   LK-08  Controller / Service 使用 @AllArgsConstructor 构造注入
#          → 字段声明顺序变化即可导致注入错乱；应用 @RequiredArgsConstructor（final 字段）
#          （注：ServiceImpl 推荐 @Resource 字段注入，不应用构造注入）
#
# 用法：bash check-lombok.sh <扫描路径> [--files file1 file2 ...]

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
    echo "用法：bash check-lombok.sh <路径> [--files file1 ...]"
    exit 1
  fi
  if [[ "$1" == "--files" ]]; then
    FILES_MODE=true; shift
    SPECIFIC_FILES=("$@")
  else
    SCAN_ROOT="$1"
  fi
}

parse_args "$@"

get_java_files() {
  if [[ "$FILES_MODE" == "true" ]]; then
    for f in "${SPECIFIC_FILES[@]}"; do [[ "$f" == *.java ]] && echo "$f"; done
  else
    find "$SCAN_ROOT" -name "*.java" ! -path "*/target/*"
  fi
}

# ripgrep 封装（graceful fallback to grep -E）
run_rg() {
  local pattern="$1"; shift
  if command -v rg &>/dev/null; then
    rg -n "$pattern" "$@" 2>/dev/null || true
  else
    grep -rn -E "$pattern" "$@" 2>/dev/null || true
  fi
}

echo "============================================"
echo "  java-code-review / check-lombok.sh"
echo "============================================"

# ─────────────────────────────────────────────────
# LK-01  @Builder 用在 Entity 类上
# ─────────────────────────────────────────────────
echo ""
echo "【LK-01】检查 Entity 是否误用 @Builder..."
LK01_FOUND=false
while IFS= read -r f; do
  fname=$(basename "$f")
  [[ "$fname" != *Entity.java ]] && continue
  if grep -q '@Builder' "$f" 2>/dev/null; then
    print_error "LK-01 Entity 不能使用 @Builder（@Builder 会移除无参构造，导致 MyBatis-Plus 无法反射实例化）：$f"
    LK01_FOUND=true
  fi
done < <(get_java_files)
[[ "$LK01_FOUND" == false ]] && print_ok "LK-01 通过"

# ─────────────────────────────────────────────────
# LK-02  @Builder + @Data 缺少 @NoArgsConstructor
# ─────────────────────────────────────────────────
echo ""
echo "【LK-02】检查 @Builder + @Data 组合是否缺少 @NoArgsConstructor..."
LK02_FOUND=false
while IFS= read -r f; do
  content=$(cat "$f" 2>/dev/null) || continue
  if echo "$content" | grep -q '@Builder' && echo "$content" | grep -q '@Data'; then
    if ! echo "$content" | grep -q '@NoArgsConstructor'; then
      print_error "LK-02 @Builder + @Data 缺少 @NoArgsConstructor，Jackson/Feign 反序列化将失败（需同时加 @AllArgsConstructor）：$f"
      LK02_FOUND=true
    fi
  fi
done < <(get_java_files)
[[ "$LK02_FOUND" == false ]] && print_ok "LK-02 通过"

# ─────────────────────────────────────────────────
# LK-03  Entity 注解顺序检查
#   规范：@Data → @Accessors(chain=true) → @ToString(callSuper=true)
#          → @EqualsAndHashCode(callSuper=true) → @TableName
# ─────────────────────────────────────────────────
echo ""
echo "【LK-03】检查 Entity 注解顺序..."
LK03_FOUND=false
while IFS= read -r f; do
  fname=$(basename "$f")
  [[ "$fname" != *Entity.java ]] && continue
  content=$(cat "$f" 2>/dev/null) || continue

  # 只检查继承了 BaseEntity 的类
  echo "$content" | grep -q 'extends BaseEntity' || continue

  # 收集类声明前的注解顺序
  python3 - "$f" << 'PYEOF'
import sys, re

path = sys.argv[1]
try:
    lines = open(path, encoding='utf-8', errors='replace').readlines()
except Exception:
    sys.exit(0)

RED  = '\033[0;31m'
NC   = '\033[0m'

# 找到 public class ... extends BaseEntity 行
class_line_idx = None
for i, line in enumerate(lines):
    if re.search(r'class\s+\w+.*extends\s+BaseEntity', line):
        class_line_idx = i
        break

if class_line_idx is None:
    sys.exit(0)

# 向上收集注解（连续的 @Xxx 行）
annotations = []
i = class_line_idx - 1
while i >= 0:
    stripped = lines[i].strip()
    if stripped.startswith('@'):
        ann = stripped.split('(')[0].lstrip('@').strip()
        annotations.insert(0, ann)
        i -= 1
    elif stripped == '' or stripped.startswith('//') or stripped.startswith('*'):
        i -= 1
    else:
        break

EXPECTED_ORDER = ['Data', 'Accessors', 'ToString', 'EqualsAndHashCode', 'TableName']

# 过滤只关注这几个注解的顺序
actual_filtered = [a for a in annotations if a in EXPECTED_ORDER]
expected_filtered = [a for a in EXPECTED_ORDER if a in actual_filtered]

if actual_filtered != expected_filtered:
    print(
        f"{RED}❌ [ERROR]{NC} LK-03 Entity 注解顺序不符合规范，"
        f"当前：{actual_filtered}，"
        f"期望：{expected_filtered}（@Data→@Accessors→@ToString→@EqualsAndHashCode→@TableName）：{path}"
    )
PYEOF

done < <(get_java_files)
[[ "$LK03_FOUND" == false ]] && print_ok "LK-03 通过"

# ─────────────────────────────────────────────────
# LK-04  @SneakyThrows 禁止使用
# ─────────────────────────────────────────────────
echo ""
echo "【LK-04】检查 @SneakyThrows 使用..."
LK04_HITS=$(get_java_files | xargs grep -l '@SneakyThrows' 2>/dev/null || true)
if [[ -n "$LK04_HITS" ]]; then
  while IFS= read -r f; do
    LINES=$(grep -n '@SneakyThrows' "$f" 2>/dev/null || true)
    while IFS= read -r line; do
      print_error "LK-04 禁止使用 @SneakyThrows（将 checked exception 强制包装为 RuntimeException，调用方无法感知）：$f:$line"
    done <<< "$LINES"
  done <<< "$LK04_HITS"
else
  print_ok "LK-04 通过"
fi

# ─────────────────────────────────────────────────
# LK-05  手动声明 Logger 而非 @Slf4j
# ─────────────────────────────────────────────────
echo ""
echo "【LK-05】检查是否手动声明 Logger（应改用 @Slf4j）..."
LK05_PATTERN='private\s+static\s+(final\s+)?Logger\s+\w+\s*='
LK05_FOUND=false
while IFS= read -r f; do
  HITS=$(grep -n 'private static.*Logger.*=' "$f" 2>/dev/null | grep -v '@Slf4j' || true)
  if [[ -n "$HITS" ]]; then
    while IFS= read -r h; do
      print_error "LK-05 禁止手动声明 Logger，必须改用 @Slf4j（统一使用 log 变量名）：$f:$h"
    done <<< "$HITS"
    LK05_FOUND=true
  fi
done < <(get_java_files)
[[ "$LK05_FOUND" == false ]] && print_ok "LK-05 通过"

# ─────────────────────────────────────────────────
# LK-06  @Accessors(chain=true) 用在 DTO / VO 上
# ─────────────────────────────────────────────────
echo ""
echo "【LK-06】检查 DTO / VO 是否误用 @Accessors(chain=true)..."
LK06_FOUND=false
while IFS= read -r f; do
  fname=$(basename "$f")
  # 只检查 DTO / VO（不检查 Entity）
  [[ "$fname" == *Entity.java ]] && continue
  [[ "$fname" != *DTO.java && "$fname" != *VO.java ]] && continue
  if grep -q '@Accessors' "$f" 2>/dev/null; then
    print_error "LK-06 DTO/VO 不应使用 @Accessors(chain=true)，链式 setter 破坏 JavaBean 规范（干扰 Jackson 反序列化和 MapStruct 映射）：$f"
    LK06_FOUND=true
  fi
done < <(get_java_files)
[[ "$LK06_FOUND" == false ]] && print_ok "LK-06 通过"

# ─────────────────────────────────────────────────
# LK-07  @FieldDefaults 禁止使用
# ─────────────────────────────────────────────────
echo ""
echo "【LK-07】检查 @FieldDefaults 使用..."
LK07_FOUND=false
while IFS= read -r f; do
  if grep -q '@FieldDefaults' "$f" 2>/dev/null; then
    LINES=$(grep -n '@FieldDefaults' "$f" 2>/dev/null || true)
    while IFS= read -r line; do
      print_warning "LK-07 禁止使用 @FieldDefaults（隐藏字段可见性，与 IDE 兼容性差，建议显式声明 private）：$f:$line"
    done <<< "$LINES"
    LK07_FOUND=true
  fi
done < <(get_java_files)
[[ "$LK07_FOUND" == false ]] && print_ok "LK-07 通过"

# ─────────────────────────────────────────────────
# LK-08  Controller / 非 ServiceImpl 类使用 @AllArgsConstructor 构造注入
# ─────────────────────────────────────────────────
echo ""
echo "【LK-08】检查 @AllArgsConstructor 在 Controller / 非 ServiceImpl 上的使用..."
LK08_FOUND=false
while IFS= read -r f; do
  fname=$(basename "$f")
  # 只检查 Controller 和 ServiceImpl
  [[ "$fname" != *Controller.java && "$fname" != *ServiceImpl.java ]] && continue
  if grep -q '@AllArgsConstructor' "$f" 2>/dev/null; then
    if [[ "$fname" == *ServiceImpl.java ]]; then
      # ServiceImpl 推荐 @Resource 字段注入，不推荐构造注入
      print_warning "LK-08 ServiceImpl 不建议用 @AllArgsConstructor 构造注入（字段顺序变化即可注入错乱），推荐 @Resource 字段注入：$f"
    else
      # Controller 可用 @RequiredArgsConstructor，不推荐 @AllArgsConstructor
      print_warning "LK-08 Controller 建议用 @RequiredArgsConstructor 而非 @AllArgsConstructor（对 final 字段更安全）：$f"
    fi
    LK08_FOUND=true
  fi
done < <(get_java_files)
[[ "$LK08_FOUND" == false ]] && print_ok "LK-08 通过"

echo ""
echo "============================================"
if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}❌ 检查完成：${ERRORS} 个阻断错误，${WARNINGS} 个警告${NC}"
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo -e "${YELLOW}🟡 检查完成：0 个阻断错误，${WARNINGS} 个警告${NC}"
else
  print_ok "全部通过，Lombok 使用规范检查无问题"
fi
