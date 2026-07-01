#!/usr/bin/env bash
# git-commit/scripts/check-version.sh
# 仅在变更涉及 antview/ 版本目录时执行；不涉及则直接 PASS 跳过。
# 兼容两种路径形态：
#   - 绝对/子仓路径：*version/antview/*
#   - 版本仓内相对路径：antview/*（在 version 仓根目录执行 git diff 的默认形态）
#
# 检查项：
#   FILE-01 版本仓 脚本/ 目录下只允许 .sql 文件，禁止 .py/.sh/.js/.ts 等一次性工具脚本
#   ENV-01  Nacos 配置变量必须在同版本 配置/env.properties 中集中维护
#   SQL-01  非大型脚本（≤ 2 MiB）必须按服务聚合到 <service>.sql
#   SQL-02  增量 SQL 必须满足"务实级"幂等：CREATE/DROP/ADD COLUMN 必须 IF [NOT] EXISTS；
#           业务初始化数据 INSERT 必须 ON CONFLICT；ALTER 类操作仅 WARN 提示包 DO $$
#
# 用法：
#   bash check-version.sh                # 自动从 git diff 推断
#   bash check-version.sh --files "f1 f2 f3"

set -uo pipefail

LARGE_SQL_THRESHOLD=$((2 * 1024 * 1024))  # 2 MiB

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

ERRORS=0
WARNINGS=0
print_error()   { echo -e "${RED}❌ [ERROR]${NC} $*"; ERRORS=$((ERRORS+1)); }
print_warning() { echo -e "${YELLOW}🟡 [WARN] ${NC} $*"; WARNINGS=$((WARNINGS+1)); }
print_ok()      { echo -e "${GREEN}✅ $*${NC}"; }
print_info()    { echo "$*"; }

# ---------- 解析变更文件参数 ----------
INCREMENTAL_FILES=()
if [[ "${1:-}" == "--files" ]]; then
  read -ra INCREMENTAL_FILES <<< "${2:-}"
elif [ "$#" -gt 0 ]; then
  for f in "$@"; do INCREMENTAL_FILES+=("$f"); done
else
  while IFS= read -r f; do
    [ -n "$f" ] && INCREMENTAL_FILES+=("$f")
  done < <(
    {
      git diff --cached --name-only 2>/dev/null
      git diff --name-only HEAD 2>/dev/null
      git ls-files --others --exclude-standard 2>/dev/null
    } | sort -u
  )
fi

# ---------- 阶段 0：筛选 version 项目变更 ----------
# 同时识别两种形态：
#   - 子仓 / 绝对路径：*version/antview/*
#   - 版本仓内相对路径：antview/*（在 version 仓根目录 git diff 默认形态）
VERSION_FILES=()
VERSION_DIRS_RAW=()
for f in "${INCREMENTAL_FILES[@]+"${INCREMENTAL_FILES[@]}"}"; do
  case "$f" in
    *version/antview/*|antview/*)
      VERSION_FILES+=("$f")
      # 版本目录：截取到 antview/<version-name>
      vdir=$(echo "$f" | sed -E 's#^(.*antview/[^/]+).*#\1#')
      VERSION_DIRS_RAW+=("$vdir")
      ;;
  esac
done

if [ "${#VERSION_FILES[@]}" -eq 0 ]; then
  print_ok "无 version 项目变更，本检查跳过"
  echo ""
  echo "============================================"
  echo -e "${GREEN}✅ check-version 跳过（无 version 文件变更）${NC}"
  exit 0
fi

# 去重版本目录
VERSION_DIRS=()
while IFS= read -r d; do
  [ -n "$d" ] && VERSION_DIRS+=("$d")
done < <(printf '%s\n' "${VERSION_DIRS_RAW[@]}" | sort -u)

print_info "检测到 ${#VERSION_FILES[@]} 个 version 文件变更，覆盖 ${#VERSION_DIRS[@]} 个版本目录："
for d in "${VERSION_DIRS[@]}"; do print_info "  - $d"; done
echo ""

# ─────────────────────────────────────────────────────────────
# FILE-01：版本仓 脚本/ 目录下仅允许 .sql 文件
# 背景：脚本/ 目录承载需要在各环境重放的 DDL / 初始化数据 / 存量迁移 SQL；
#       一次性工具脚本（.py / .sh / .js / .ts）的产出已固化进 SQL，
#       脚本本身不应长期留存，否则会让人误以为"部署时要执行"。
# 规则：脚本/<service>/ 下除 *.sql 外一律 ERROR。
# ─────────────────────────────────────────────────────────────
echo "【FILE-01】版本仓 脚本/ 目录仅允许 .sql 文件..."
FILE01_VIOLATIONS=0
for f in "${VERSION_FILES[@]}"; do
  case "$f" in
    *antview/*/脚本/*)
      ;;
    *)
      continue
      ;;
  esac

  # 删除的文件不报告（允许删除清理历史遗留）
  [ -f "$f" ] || continue

  filename=$(basename "$f")
  # 允许隐藏占位 / 目录说明类文件
  case "$filename" in
    .gitkeep|.keep|.DS_Store) continue ;;
  esac

  case "$filename" in
    *.sql)
      ;;
    *)
      print_error "$f 禁止放入版本仓 脚本/ 目录（仅允许 .sql；一次性工具脚本请留在独立工程或本地）"
      FILE01_VIOLATIONS=$((FILE01_VIOLATIONS+1))
      ;;
  esac
done
[ "$FILE01_VIOLATIONS" -eq 0 ] && print_ok "FILE-01 全部通过"

echo ""

# ─────────────────────────────────────────────────────────────
# ENV-01：Nacos 配置变量 env 化检查
# ─────────────────────────────────────────────────────────────
echo "【ENV-01】Nacos 配置变量必须在 配置/env.properties 集中维护..."
for vdir in "${VERSION_DIRS[@]}"; do
  config_dir="$vdir/配置"
  env_file="$config_dir/env.properties"
  if [ ! -d "$config_dir" ]; then
    print_info "  ↳ $vdir 无 配置/ 目录，跳过 ENV-01"
    continue
  fi
  if [ ! -f "$env_file" ]; then
    print_warning "$config_dir/env.properties 不存在，无法核验变量定义（可能为初始版本）"
    continue
  fi

  # 提取 env.properties 已定义变量名
  defined_vars=$(grep -E '^[A-Z_][A-Z0-9_]*[[:space:]]*=' "$env_file" 2>/dev/null \
                  | sed -E 's/^([A-Z_][A-Z0-9_]*)[[:space:]]*=.*/\1/' \
                  | sort -u)

  # 遍历 配置/ 下所有非 env.properties 的服务文件
  for cfg in "$config_dir"/*; do
    [ -f "$cfg" ] || continue
    cfg_name=$(basename "$cfg")
    [ "$cfg_name" = "env.properties" ] && continue
    [ "$cfg_name" = ".DS_Store" ] && continue

    refs=$(grep -oE '\$\{[A-Z_][A-Z0-9_]*' "$cfg" 2>/dev/null \
            | sed 's/\${//' \
            | sort -u)
    [ -z "$refs" ] && { print_ok "  $cfg 无变量引用"; continue; }

    missing=()
    for ref in $refs; do
      if ! echo "$defined_vars" | grep -qx "$ref"; then
        missing+=("$ref")
      fi
    done

    if [ "${#missing[@]}" -eq 0 ]; then
      print_ok "  $cfg 所有变量已在 env.properties 定义"
    else
      for m in "${missing[@]}"; do
        print_error "$cfg 引用变量 \${$m} 未在 $env_file 定义，必须集中维护"
      done
    fi
  done
done

echo ""

# ─────────────────────────────────────────────────────────────
# SQL-01：非大型脚本必须按服务聚合到 <service>.sql
# ─────────────────────────────────────────────────────────────
echo "【SQL-01】SQL 服务维度聚合（≤ 2 MiB 必须聚合到 <service>.sql）..."
SQL_AGG_VIOLATIONS=0
for f in "${VERSION_FILES[@]}"; do
  case "$f" in
    *antview/*/脚本/*/*.sql) ;;
    *) continue ;;
  esac

  service=$(echo "$f" | sed -E 's#.*/脚本/([^/]+)/.*#\1#')
  filename=$(basename "$f")

  if [ "$filename" = "${service}.sql" ]; then
    print_ok "  $f 是 <service>.sql 聚合文件"
    continue
  fi

  if [ -f "$f" ]; then
    size=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo 0)
    if [ "$size" -gt "$LARGE_SQL_THRESHOLD" ]; then
      print_ok "  $f 文件大小 ${size} bytes (>2 MiB)，允许独立为大型脚本"
    else
      print_error "${f} (${size} bytes, <= 2 MiB) 应聚合到 ${service}.sql 而不是独立成文件"
      SQL_AGG_VIOLATIONS=$((SQL_AGG_VIOLATIONS+1))
    fi
  else
    print_info "  $f 已删除，跳过聚合检查"
  fi
done
[ "$SQL_AGG_VIOLATIONS" -eq 0 ] && print_ok "SQL-01 全部通过"

echo ""

# ─────────────────────────────────────────────────────────────
# SQL-02：增量 SQL 幂等检查（务实级）
# ─────────────────────────────────────────────────────────────
echo "【SQL-02】增量 SQL 幂等检查..."

check_sql_file() {
  local sf="$1"
  [ -f "$sf" ] || return 0

  # 预处理：去 -- 行注释、去 /* */ 块注释，保留行号信息
  # 使用 awk 过滤注释，输出 "行号|去注释后的内容"
  local pre
  pre=$(awk '
    BEGIN { in_block=0 }
    {
      line = $0
      # 处理块注释（简化：仅处理整行 /* 与 */，跨行块注释整段跳过）
      if (in_block) {
        if (index(line, "*/") > 0) { in_block=0 }
        next
      }
      if (match(line, /\/\*/)) {
        if (!match(line, /\*\//) || RSTART < index(line, "*/")) {
          in_block=1
        }
        sub(/\/\*.*$/, "", line)
      }
      # 去掉行尾 -- 注释
      sub(/--.*$/, "", line)
      # 去前后空白
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
      if (line == "") next
      printf "%d|%s\n", NR, line
    }
  ' "$sf")

  # 跳过 DO $$ ... $$ 块内部的语句（视为已防御）
  local clean
  clean=$(echo "$pre" | awk -F'|' '
    BEGIN { in_do=0 }
    {
      l = tolower($2)
      if (in_do == 0 && match(l, /do[[:space:]]*\$\$/)) { in_do=1; next }
      if (in_do == 1) {
        if (match(l, /\$\$/)) { in_do=0 }
        next
      }
      print $0
    }
  ')

  local violations=0

  # 规则 1: CREATE TABLE 必须 IF NOT EXISTS
  while IFS='|' read -r ln content; do
    [ -z "$ln" ] && continue
    print_error "$sf:$ln CREATE TABLE 缺 IF NOT EXISTS → $content"
    violations=$((violations+1))
  done < <(echo "$clean" | grep -iE '\bcreate[[:space:]]+(temporary[[:space:]]+|temp[[:space:]]+|unlogged[[:space:]]+)?table\b' \
                          | grep -ivE '\bif[[:space:]]+not[[:space:]]+exists\b')

  # 规则 2: CREATE INDEX 必须 IF NOT EXISTS
  while IFS='|' read -r ln content; do
    [ -z "$ln" ] && continue
    print_error "$sf:$ln CREATE INDEX 缺 IF NOT EXISTS → $content"
    violations=$((violations+1))
  done < <(echo "$clean" | grep -iE '\bcreate[[:space:]]+(unique[[:space:]]+)?index\b' \
                          | grep -ivE '\bif[[:space:]]+not[[:space:]]+exists\b')

  # 规则 3: DROP TABLE/INDEX/VIEW 必须 IF EXISTS
  while IFS='|' read -r ln content; do
    [ -z "$ln" ] && continue
    print_error "$sf:$ln DROP 缺 IF EXISTS → $content"
    violations=$((violations+1))
  done < <(echo "$clean" | grep -iE '\bdrop[[:space:]]+(table|index|view|sequence)\b' \
                          | grep -ivE '\bif[[:space:]]+exists\b')

  # 规则 4: ALTER TABLE ... ADD COLUMN 必须 IF NOT EXISTS
  while IFS='|' read -r ln content; do
    [ -z "$ln" ] && continue
    print_error "$sf:$ln ALTER TABLE ADD COLUMN 缺 IF NOT EXISTS → $content"
    violations=$((violations+1))
  done < <(echo "$clean" | grep -iE '\badd[[:space:]]+column\b' \
                          | grep -ivE '\bif[[:space:]]+not[[:space:]]+exists\b')

  # 规则 5: INSERT INTO ... VALUES 建议 ON CONFLICT
  # 检查文件层面：如果存在 INSERT INTO 但全局没有 ON CONFLICT 出现，给 WARN
  if echo "$clean" | grep -qiE '\binsert[[:space:]]+into\b'; then
    if ! echo "$clean" | grep -qiE '\bon[[:space:]]+conflict\b'; then
      local first_insert
      first_insert=$(echo "$clean" | grep -niE '\binsert[[:space:]]+into\b' | head -1 | cut -d: -f1)
      print_warning "$sf 存在 INSERT INTO 但全文未见 ON CONFLICT，业务初始化数据建议加 ON CONFLICT 保证幂等"
    fi
  fi

  # 规则 6: 裸 ALTER（SET DEFAULT / RENAME / DROP COLUMN / ALTER COLUMN）— WARN 提示
  while IFS='|' read -r ln content; do
    [ -z "$ln" ] && continue
    print_warning "$sf:$ln 裸 ALTER 操作建议包 DO \$\$ + 列/约束存在性判断以保证可重跑 → $content"
  done < <(echo "$clean" | grep -iE '\balter[[:space:]]+table\b.*\b(set[[:space:]]+default|drop[[:space:]]+default|rename[[:space:]]+|drop[[:space:]]+column|alter[[:space:]]+column|drop[[:space:]]+constraint)\b' \
                          | grep -ivE '\bif[[:space:]]+(not[[:space:]]+)?exists\b')

  if [ "$violations" -eq 0 ]; then
    print_ok "  $sf 通过 CREATE/DROP/ADD COLUMN 幂等检查"
  fi
}

SQL_TARGETS=()
for f in "${VERSION_FILES[@]}"; do
  case "$f" in
    *antview/*/脚本/*.sql) SQL_TARGETS+=("$f") ;;
  esac
done

if [ "${#SQL_TARGETS[@]}" -eq 0 ]; then
  print_info "  无 SQL 文件变更，跳过"
else
  for sf in "${SQL_TARGETS[@]}"; do
    check_sql_file "$sf"
  done
fi

echo ""
echo "============================================"
if [ "$ERRORS" -gt 0 ]; then
  echo -e "${RED}❌ check-version 完成：$ERRORS 个阻断错误，$WARNINGS 个警告${NC}"
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  echo -e "${YELLOW}🟡 check-version 完成：0 个阻断错误，$WARNINGS 个警告${NC}"
  exit 0
else
  echo -e "${GREEN}✅ check-version 全部通过${NC}"
  exit 0
fi
