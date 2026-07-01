#!/usr/bin/env bash
# java-code-review/scripts/check-format.sh
#
# 基于 Eclipse JDT (formatter-maven-plugin) 格式化 Java 文件。
# 完全独立运行，不依赖 IntelliJ IDEA。
#
# 原理：
#   1. 直接使用 cursor.code-workspace.xml（Eclipse JDT 原生格式，无需转换）
#   2. 在临时目录构建最小 Maven 项目，将目标文件复制进去（维持包路径）
#   3. 使用项目自带的 mvnw 运行 formatter:format / formatter:validate
#   4. 将格式化结果拷回原始路径（--fix 模式）
#
# 格式配置维护：
#   在 IDEA 中调整代码风格后，通过以下路径导出并覆盖配置文件：
#   Settings → Editor → Code Style → Java → 齿轮 → Export → Eclipse code style XML
#   保存到: /Users/lvyi/code/config/cursor.code-workspace.xml
#
# 用法：
#   bash check-format.sh [目标目录或文件] [--fix]
#   --fix：自动修复格式（不带参数仅检查）

set -euo pipefail

# ── 参数解析 ─────────────────────────────────────────────────────────────────
TARGET="."
FIX_MODE=0
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --fix) FIX_MODE=1 ;;
    *)     ARGS+=("$arg") ;;
  esac
done
[[ ${#ARGS[@]} -gt 0 ]] && TARGET="${ARGS[0]}"
[[ -d "$TARGET" ]] && TARGET="$(cd "$TARGET" && pwd)" || true

# ── 路径配置 ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ECLIPSE_XML="$SCRIPT_DIR/formatter/eclipse-style.xml"           # Eclipse JDT 格式，skill 内置
PLUGIN="net.revelc.code.formatter:formatter-maven-plugin:2.29.0"
# 已知项目的 mvnw（用于下载 Maven 插件）
FALLBACK_PROJECTS=(/Users/lvyi/IdeaProjects/assess /Users/lvyi/IdeaProjects/integration)

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
ERRORS=0; WARNINGS=0
print_error()   { echo -e "${RED}❌ [ERROR]${NC} $*"; ((ERRORS++))   || true; }
print_warning() { echo -e "${YELLOW}🟡 [WARN] ${NC} $*"; ((WARNINGS++)) || true; }
print_ok()      { echo -e "${GREEN}✅ $*${NC}"; }
print_info()    { echo -e "${BLUE}ℹ️  $*${NC}"; }

echo "============================================"
echo "  java-code-review / check-format.sh"
echo "  引擎: Eclipse JDT (formatter-maven-plugin)"
echo "  配置: $(basename "$ECLIPSE_XML")"
echo "  模式: $([ $FIX_MODE -eq 1 ] && echo '自动修复' || echo '仅检查')"
echo "  扫描: $TARGET"
echo "============================================"
echo ""

# ── 前置检查 ─────────────────────────────────────────────────────────────────
[[ ! -f "$ECLIPSE_XML" ]] && { print_warning "未找到格式配置: $ECLIPSE_XML"; exit 0; }

# ── Step 2：收集 Java 文件 ────────────────────────────────────────────────────
JAVA_FILES=()
if [[ -f "$TARGET" && "$TARGET" == *.java ]]; then
  JAVA_FILES+=("$(cd "$(dirname "$TARGET")" && pwd)/$(basename "$TARGET")")
elif [[ -d "$TARGET" ]]; then
  while IFS= read -r f; do JAVA_FILES+=("$f"); done \
    < <(find "$TARGET" -name '*.java' -not -path '*/target/*' 2>/dev/null | sort)
fi

if [[ ${#JAVA_FILES[@]} -eq 0 ]]; then
  print_ok "无 Java 文件，跳过格式检查"
  exit 0
fi

echo "【CR-33】Eclipse JDT 格式检查（${#JAVA_FILES[@]} 个文件）..."
echo ""

# ── Step 3：定位 mvnw ─────────────────────────────────────────────────────────
find_mvnw() {
  local dir="$1"
  while [[ "$dir" != "/" ]]; do
    [[ -f "$dir/mvnw" ]] && echo "$dir" && return 0
    dir="$(dirname "$dir")"
  done
  return 1
}

MVNW_ROOT=$(find_mvnw "$TARGET" 2>/dev/null) || {
  for p in "${FALLBACK_PROJECTS[@]}"; do
    [[ -f "$p/mvnw" ]] && MVNW_ROOT="$p" && break
  done
}
[[ -z "${MVNW_ROOT:-}" ]] && { print_error "找不到 mvnw"; exit 1; }
MVNW="$MVNW_ROOT/mvnw"
print_info "mvnw: $MVNW"

# ── Step 4：构建临时 Maven 项目，维持包路径 ───────────────────────────────────
TMP_DIR=$(mktemp -d)
TMP_SRC="$TMP_DIR/src/main/java"
TMP_SRC_TEST="$TMP_DIR/src/test/java"
MAP_FILE="$TMP_DIR/filemap.tsv"   # tmp_path\torig_path 逐行存储
mkdir -p "$TMP_SRC" "$TMP_SRC_TEST"
trap 'rm -rf "$TMP_DIR"' EXIT

for orig in "${JAVA_FILES[@]}"; do
  if echo "$orig" | grep -q '/test/'; then
    base_dir="$TMP_SRC_TEST"
  else
    base_dir="$TMP_SRC"
  fi
  REL=$(python3 -c "
import re, sys
p = sys.argv[1]
m = re.search(r'/src/(?:main|test)/java/(.*)', p)
print(m.group(1) if m else __import__('os').path.basename(p))
" "$orig")
  dest="$base_dir/$REL"
  mkdir -p "$(dirname "$dest")"
  cp "$orig" "$dest"
  printf "%s\t%s\n" "$dest" "$orig" >> "$MAP_FILE"
done

# Eclipse JDT formatter 不会主动展开单行 Javadoc，先用预处理脚本补齐
python3 "$SCRIPT_DIR/expand-single-line-javadoc.py" "$TMP_DIR/src" >/dev/null

# 生成临时 pom.xml
cat > "$TMP_DIR/pom.xml" << POMEOF
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>internal.code.check</groupId>
  <artifactId>java-formatter</artifactId>
  <version>1.0</version>
  <packaging>pom</packaging>
  <build>
    <sourceDirectory>\${project.basedir}/src/main/java</sourceDirectory>
    <testSourceDirectory>\${project.basedir}/src/test/java</testSourceDirectory>
    <plugins>
      <plugin>
        <groupId>net.revelc.code.formatter</groupId>
        <artifactId>formatter-maven-plugin</artifactId>
        <version>2.29.0</version>
        <configuration>
          <configFile>${ECLIPSE_XML}</configFile>
          <sourceDirectory>\${project.basedir}/src/main/java</sourceDirectory>
          <testSourceDirectory>\${project.basedir}/src/test/java</testSourceDirectory>
          <encoding>UTF-8</encoding>
          <lineEnding>LF</lineEnding>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
POMEOF

# ── Step 5：执行格式化或检查 ──────────────────────────────────────────────────
run_mvn() {
  local goal="$1"
  # 使用项目的 settings.xml（Nexus 配置）
  local settings="$MVNW_ROOT/.mvn/wrapper/settings.xml"
  [[ ! -f "$settings" ]] && settings="$HOME/.m2/settings.xml"

  "$MVNW" -f "$TMP_DIR/pom.xml" \
    -s "$settings" \
    "$goal" \
    --no-transfer-progress \
    2>&1
}

if [[ $FIX_MODE -eq 1 ]]; then
  # 修复：格式化临时副本后拷回
  if run_mvn "${PLUGIN}:format" > /tmp/fmt-output.txt 2>&1; then
    while IFS=$'\t' read -r tmp_file orig; do
      if ! diff -q "$orig" "$tmp_file" &>/dev/null; then
        cp "$tmp_file" "$orig"
        echo "  📝 已修复: $(basename "$orig")"
      fi
    done < "$MAP_FILE"
    print_ok "CR-33 Eclipse JDT 格式化完成"
  else
    tail -20 /tmp/fmt-output.txt
    print_error "CR-33 格式化失败"
  fi
else
  # 检查：格式化临时副本，对比差异
  if run_mvn "${PLUGIN}:format" > /tmp/fmt-output.txt 2>&1; then
    UNFORMATTED=()
    while IFS=$'\t' read -r tmp_file orig; do
      diff -q "$orig" "$tmp_file" &>/dev/null || UNFORMATTED+=("$orig")
    done < "$MAP_FILE"

    if [[ ${#UNFORMATTED[@]} -gt 0 ]]; then
      for f in "${UNFORMATTED[@]}"; do
        print_warning "格式不规范（运行 --fix 自动修复）：$f"
      done
    else
      print_ok "CR-33 通过，所有文件符合 IntelliJ 格式规范"
    fi
  else
    tail -10 /tmp/fmt-output.txt
    print_warning "格式化器执行异常，跳过检查"
  fi
fi

# ── 汇总 ─────────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}❌ 检查完成：$ERRORS 个阻断错误，$WARNINGS 个警告${NC}"; exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo -e "${YELLOW}🟡 检查完成：0 个错误，$WARNINGS 个警告（建议运行 --fix 修复）${NC}"; exit 0
else
  echo -e "${GREEN}✅ 全部通过${NC}"; exit 0
fi
