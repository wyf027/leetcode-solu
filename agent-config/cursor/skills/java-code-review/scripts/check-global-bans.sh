#!/usr/bin/env bash
# java-code-review/scripts/check-global-bans.sh
# 覆盖：CR-01~CR-18、CR-21~CR-22、CR-31
# 用法：bash check-global-bans.sh [目标目录] [--files "file1 file2 ..."]
# 无参数时扫当前目录；--files 参数支持增量扫描（来自 pre-commit 增量模式）

set -euo pipefail

TARGET="${1:-.}"
SHIFT_DONE=0
INCREMENTAL_FILES=()
if [[ "${1:-}" == "--files" ]]; then
  read -ra INCREMENTAL_FILES <<< "${2:-}"
  SHIFT_DONE=1
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

# 确定扫描范围：增量模式只扫变更文件
if [[ ${#INCREMENTAL_FILES[@]} -gt 0 ]]; then
  RG_OPTS=()
  for f in "${INCREMENTAL_FILES[@]}"; do
    [[ -f "$f" ]] && RG_OPTS+=("$f")
  done
  scan_args() { printf '%s\n' "${RG_OPTS[@]}"; }
  rg_target() { printf '%s\n' "${RG_OPTS[@]}"; }
  SCAN_DESC="增量文件 (${#RG_OPTS[@]} 个)"
else
  rg_target() { echo "$TARGET"; }
  SCAN_DESC="$TARGET"
fi

echo "============================================"
echo "  java-code-review / check-global-bans.sh"
echo "  扫描范围: $SCAN_DESC"
echo "============================================"

run_rg() {
  local pattern="$1"; shift
  local flags=("$@")
  if [[ ${#INCREMENTAL_FILES[@]} -gt 0 ]]; then
    rg --no-heading -n "${flags[@]+"${flags[@]}"}" "$pattern" "${INCREMENTAL_FILES[@]}" 2>/dev/null || true
  else
    rg --no-heading -n "${flags[@]+"${flags[@]}"}" "$pattern" "$TARGET" 2>/dev/null || true
  fi
}

# ────────────────────────────────────────────────
# CR-01  @Autowired 禁用全局扫描
# ────────────────────────────────────────────────
echo ""
echo "【CR-01】检查 @Autowired 注入..."
HITS=$(run_rg '@Autowired' -g '*.java' | grep -v '^\s*//' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "@Autowired 禁止使用，改用构造注入或 @Resource：$line"
  done <<< "$HITS"
else
  print_ok "CR-01 通过"
fi

# ────────────────────────────────────────────────
# CR-02  System.out.println / System.err
# ────────────────────────────────────────────────
echo ""
echo "【CR-02】检查 System.out/err 输出..."
HITS=$(run_rg 'System\.(out|err)\.(print|println|printf)' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "禁止使用 System.out/err，改用 Logger：$line"
  done <<< "$HITS"
else
  print_ok "CR-02 通过"
fi

# ────────────────────────────────────────────────
# CR-03  e.printStackTrace()
# ────────────────────────────────────────────────
echo ""
echo "【CR-03】检查 e.printStackTrace()..."
HITS=$(run_rg '\.printStackTrace\(\)' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "禁止 e.printStackTrace()，改用 log.error(\"msg\", e)：$line"
  done <<< "$HITS"
else
  print_ok "CR-03 通过"
fi

# ────────────────────────────────────────────────
# CR-04  日志字符串拼接 log.xxx("..." + var)
# ────────────────────────────────────────────────
echo ""
echo "【CR-04】检查日志字符串拼接..."
# 仅匹配 + 与字符串字面量相邻（"\+ 或 \+"）的真拼接，排除占位符参数中的整型加法（如 Ordered.HIGHEST_PRECEDENCE + 1）
HITS=$(run_rg 'log\.(info|warn|error|debug)\s*\([^)]*("\s*\+|\+\s*")' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "日志禁止字符串拼接，改用占位符 {}：$line"
  done <<< "$HITS"
else
  print_ok "CR-04 通过"
fi

# ────────────────────────────────────────────────
# CR-05  日志打印敏感字段
# 仅匹配真正打印敏感字段的两类形态，避免文案描述（如 "token validation failed"）误报：
#   模式 A：log.xxx(... password = {} | password: {} | password={ ...)
#   模式 B：log.xxx(... .getPassword() | .getToken() | .getIdCard() ...)
# ────────────────────────────────────────────────
echo ""
echo "【CR-05】检查日志敏感字段..."
HITS=$(run_rg 'log\.(info|warn|error|debug)[^;]*\b(password|passwd|token|idCard|bankCard|cardNo|secret|credential)\b\s*[=:]\s*\{|log\.(info|warn|error|debug)[^;]*\.get(Password|Passwd|Token|IdCard|BankCard|CardNo|Secret|Credential)\s*\(' -g '*.java' -i || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "日志禁止打印敏感字段（password/token/idCard等）：$line"
  done <<< "$HITS"
else
  print_ok "CR-05 通过"
fi

# ────────────────────────────────────────────────
# CR-06  日志整包序列化 JSON.toJSON(entity)
# ────────────────────────────────────────────────
echo ""
echo "【CR-06】检查日志整包序列化..."
HITS=$(run_rg 'log\.(info|warn|error|debug).*JSON\.(toJSON|toJSONString)\(' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_warning "日志中整包序列化性能较差，建议只打关键字段：$line"
  done <<< "$HITS"
else
  print_ok "CR-06 通过"
fi

# ────────────────────────────────────────────────
# CR-08  日志无业务标识
# 豁免：已符合 CR-07a 三段式（含 " - " 与 ": "）的字面量日志视为
#       "结构化业务标识已内嵌于 key = value 中"，无需额外占位符
# ────────────────────────────────────────────────
echo ""
echo "【CR-08】检查日志无业务标识（无 id/name/code 等变量）..."
HITS=$(run_rg 'log\.(info|warn|error)\s*\(\s*"[^"]*"\s*\)' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  # 排除三段式日志：包含 " - " 和 ": " 的字面量（已有结构化业务标识）
  FILTERED=$(echo "$HITS" | grep -Ev 'log\.(info|warn|error)\s*\(\s*"[^"]* - [^"]* - [^"]*: [^"]*"\s*\)' || true)
  if [[ -n "$FILTERED" ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      print_warning "日志缺少业务标识（如 userId/orderId），建议补充占位符：$line"
    done <<< "$FILTERED"
  else
    print_ok "CR-08 通过（命中均为三段式结构化日志，已豁免）"
  fi
else
  print_ok "CR-08 通过"
fi

# ────────────────────────────────────────────────
# CR-09  log.xxx(e.getMessage()) 丢失堆栈
# ────────────────────────────────────────────────
echo ""
echo "【CR-09】检查 e.getMessage() 丢失堆栈..."
HITS=$(run_rg 'log\.(error|warn)\s*\([^)]*e\.getMessage\(\)\s*\)' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_warning "log.error 最后一个参数应传 e（而非 e.getMessage()），避免丢失堆栈：$line"
  done <<< "$HITS"
else
  print_ok "CR-09 通过"
fi

# ────────────────────────────────────────────────
# CR-10  TODO / FIXME / 待完善 / 待处理 占位注释
# ────────────────────────────────────────────────
echo ""
echo "【CR-10】检查占位注释（TODO/FIXME/待完善/待处理）..."
HITS=$(run_rg '\b(TODO|FIXME|待完善|待处理)\b' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_warning "存在占位注释，提交前需确认是否清理：$line"
  done <<< "$HITS"
else
  print_ok "CR-10 通过"
fi

# ────────────────────────────────────────────────
# CR-13  魔法值比较 getStatus() == 1
# ────────────────────────────────────────────────
echo ""
echo "【CR-13】检查魔法值比较..."
HITS=$(run_rg '\.(getStatus|getType|getState|getFlag|getRole|getLevel)\s*\(\s*\)\s*[=!]=\s*[0-9]+' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "禁止魔法值比较，改用枚举常量：$line"
  done <<< "$HITS"
else
  print_ok "CR-13 通过"
fi

# ────────────────────────────────────────────────
# CR-14  YYYY 跨年 bug
# ────────────────────────────────────────────────
echo ""
echo "【CR-14】检查 YYYY 年份格式（跨年 bug）..."
HITS=$(run_rg '"[^"]*YYYY[^"]*"' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "日期格式应使用小写 yyyy 而非 YYYY（跨年 bug）：$line"
  done <<< "$HITS"
else
  print_ok "CR-14 通过"
fi

# ────────────────────────────────────────────────
# CR-15  Arrays.asList 后 add/remove
# ────────────────────────────────────────────────
echo ""
echo "【CR-15】检查 Arrays.asList 后 add/remove..."
HITS=$(run_rg 'Arrays\.asList' -g '*.java' -l || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r file; do
    # 仅当 Arrays.asList 不是 return 语句的直接表达式时才警告（return 给调用方 = 文档说明 immutable）
    NON_RETURN_ASLIST=$(rg -n 'Arrays\.asList' "$file" 2>/dev/null | grep -v 'return\s\+Arrays\.asList' || true)
    if [[ -z "$NON_RETURN_ASLIST" ]]; then
      continue
    fi
    # 排除 SDK 标准 remove 调用（MDC.remove / map.remove / headers.remove 等业务无关 API）
    BIZ_MUTATION=$(rg -n '\.(add|remove)\s*\(' "$file" 2>/dev/null \
      | grep -Ev '\b(MDC|System|Map|HashMap|Headers|HttpHeaders|Collections|Set|HashSet|attributes|session|request|response|cookies|response\.getCookies|context)\.(add|remove)' \
      || true)
    if [[ -n "$BIZ_MUTATION" ]]; then
      print_warning "文件含 Arrays.asList 且有 add/remove，请确认是否对 asList 结果操作（会抛 UnsupportedOperationException）：$file"
    fi
  done <<< "$HITS"
else
  print_ok "CR-15 通过"
fi

# ────────────────────────────────────────────────
# CR-16  list.size() == 0
# ────────────────────────────────────────────────
echo ""
echo "【CR-16】检查 list.size() == 0（应用 isEmpty()）..."
HITS=$(run_rg '\.size\s*\(\s*\)\s*[=!]=\s*0' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "改用 .isEmpty() 替代 .size() == 0：$line"
  done <<< "$HITS"
else
  print_ok "CR-16 通过"
fi

# ────────────────────────────────────────────────
# CR-17  boolean 原始类型字段 is 前缀（序列化风险）
# 仅检测 boolean 原始类型：Lombok 生成 isXxx() getter，
# Jackson 反射会把属性名识别为 xxx（去掉 is），导致序列化字段名与 Java 字段名不一致。
# Boolean 装箱类型由 Lombok 生成 getIsXxx() getter，Jackson 序列化字段名为 isXxx，无此风险，已豁免。
# 注：POJO（Entity/DTO/VO）字段本身就禁用基本类型（见 java-pojo PO-07），
#     此处兜底覆盖 Spring Bean / 工具类等非 POJO 中可能出现的 boolean isXxx 写法。
# ────────────────────────────────────────────────
echo ""
echo "【CR-17】检查 boolean 原始类型字段 is 前缀..."
# 仅匹配字段定义（后接 = 或 ;），排除方法签名（后接 (）
HITS=$(run_rg 'private\s+boolean\s+is[A-Z]\w*\s*[=;]' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "boolean 原始类型字段禁止 is 前缀（Lombok + Jackson 序列化会去掉 is，导致字段名不一致）；改 Boolean 装箱或重命名去掉 is：$line"
  done <<< "$HITS"
else
  print_ok "CR-17 通过"
fi

# ────────────────────────────────────────────────
# CR-18  Long 小写 l 后缀（与 1 混淆）
# ────────────────────────────────────────────────
echo ""
echo "【CR-18】检查 Long 小写 l 后缀..."
HITS=$(run_rg '[0-9]+l\b' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "Long 字面量后缀应大写 L 而非小写 l：$line"
  done <<< "$HITS"
else
  print_ok "CR-18 通过"
fi

# ────────────────────────────────────────────────
# CR-19  POJO 字段使用基本类型（与 java-pojo PO-07 互锁，评审场景独立兜底）
# 触发面：文件名以 Entity / DTO / VO / Request / Response 结尾
# 检测：字段声明中出现 byte/short/int/long/float/double/boolean/char
# 例外：final 字段（含 static final / final static 常量）；数组字段不纳入本规则
# ────────────────────────────────────────────────
echo ""
echo "【CR-19】检查 POJO 字段是否使用基本类型..."
CR19_HITS=""
while IFS= read -r f; do
  fname=$(basename "$f")
  case "$fname" in
    *Entity.java|*DTO.java|*VO.java|*Request.java|*Response.java) ;;
    *) continue ;;
  esac
  HIT=$(rg -n '^\s*(public|protected|private)\s+(static\s+|transient\s+|volatile\s+)*(byte|short|int|long|float|double|boolean|char)\s+\w+\s*[=;]' "$f" 2>/dev/null || true)
  if [[ -n "$HIT" ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      CR19_HITS+="$f → $line"$'\n'
    done <<< "$HIT"
  fi
done < <(rg --files -g '*.java' "$TARGET" 2>/dev/null | rg -v '/target/|Test\.java$|Tests\.java$' || true)
if [[ -n "$CR19_HITS" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    print_error "POJO 字段禁用任何基本类型，须改包装类型（Long/Integer/Boolean/Character，金额 BigDecimal）：$line"
  done <<< "$CR19_HITS"
else
  print_ok "CR-19 通过"
fi

# ────────────────────────────────────────────────
# CR-21  省略大括号的 if/for/while
# 用 _check_braces.py 合并多行条件后再判定，避免误报跨行 if (...)。
# ────────────────────────────────────────────────
echo ""
echo "【CR-21】检查省略大括号的 if/for/while..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CR21_HELPER="$SCRIPT_DIR/_check_braces.py"

# 候选 java 文件列表（兼容 bash 3.2，不使用 mapfile）
CR21_FILES=()
if [[ ${#INCREMENTAL_FILES[@]} -gt 0 ]]; then
  for f in "${INCREMENTAL_FILES[@]}"; do
    [[ -f "$f" && "$f" == *.java ]] && CR21_FILES+=("$f")
  done
else
  while IFS= read -r f; do
    [[ -n "$f" ]] && CR21_FILES+=("$f")
  done < <(rg --no-heading -l -g '*.java' '^\s*(if|for|while)\b' "$TARGET" 2>/dev/null || true)
fi

if [[ ${#CR21_FILES[@]} -gt 0 ]]; then
  HITS=$(python3 "$CR21_HELPER" "${CR21_FILES[@]}" 2>/dev/null || true)
else
  HITS=""
fi

if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    print_error "if/for/while 必须加大括号：$line"
  done <<< "$HITS"
else
  print_ok "CR-21 通过"
fi

# ────────────────────────────────────────────────
# CR-22  switch 缺少 default
# ────────────────────────────────────────────────
echo ""
echo "【CR-22】检查 switch 缺少 default..."
HITS=$(run_rg 'switch\s*\(' -g '*.java' -l || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r file; do
    # 粗略检查：文件有 switch 但既找不到 `default :`（语句式 switch）
    # 也找不到 `default ->`（Java 14+ switch 表达式 / 箭头标签）；
    # 任一存在即视为已有 default 分支。
    if ! rg -q '\bdefault\s*(:|->)' "$file" 2>/dev/null; then
      print_warning "switch 块缺少 default 分支（请逐一确认）：$file"
    fi
  done <<< "$HITS"
else
  print_ok "CR-22 通过"
fi

# ────────────────────────────────────────────────
# CR-SV  count() > 0 / .exists() 存在性判断（原 SV-04/MP-02，归属 java-code-review）
# ────────────────────────────────────────────────
echo ""
echo "【CR-SV】检查 count() > 0 / .exists() 存在性判断..."
HITS=$(run_rg '\.count\s*\(\s*\)\s*>\s*0|\.exists\s*\(\s*\)\s*[!=)]\|lambdaQuery.*\.count\(\)\s*>\s*0' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "存在性判断禁止使用 count() > 0 或 .exists()，应改为 .select(id).one() != null（或 lambdaQuery().xxx().one() != null）：$line"
  done <<< "$HITS"
else
  print_ok "CR-SV 通过"
fi

# ────────────────────────────────────────────────
# CR-SW  Swagger / OpenAPI 注解及框架（全局禁止）
# 包含：springfox v2（io.swagger.annotations.*）
#        springdoc / OpenAPI v3（io.swagger.v3.oas.annotations.*）
#        springfox 框架本身（springfox.*）
# 理由：团队不使用任何 Swagger/OpenAPI 注解；
#       YApi 接口文档通过 AI 解析源码 + Javadoc 直接生成 JSON，
#       不依赖运行时注解，无需引入任何 swagger 相关依赖。
# ────────────────────────────────────────────────
echo ""
echo "【CR-SW】检查 Swagger/OpenAPI 注解及框架导入..."

SW_IMPORT=$(run_rg 'import\s+io\.swagger\.' -g '*.java' || true)
if [[ -n "$SW_IMPORT" ]]; then
  while IFS= read -r line; do
    print_error "CR-SW 禁止引入 Swagger/OpenAPI 注解框架（io.swagger.*），YApi 文档由 AI 读源码+Javadoc 直接生成 JSON，无需运行时注解：$line"
  done <<< "$SW_IMPORT"
else
  print_ok "CR-SW 无 io.swagger.* 导入"
fi

SW_FOX=$(run_rg 'import\s+springfox\.' -g '*.java' || true)
if [[ -n "$SW_FOX" ]]; then
  while IFS= read -r line; do
    print_error "CR-SW 禁止引入 springfox 框架（springfox.*）：$line"
  done <<< "$SW_FOX"
fi

# 检查 pom.xml 中是否引入了 swagger/springfox 依赖
SW_POM=$(run_rg 'springfox|swagger-annotations|springdoc-openapi' -g 'pom.xml' || true)
if [[ -n "$SW_POM" ]]; then
  while IFS= read -r line; do
    print_error "CR-SW pom.xml 中禁止引入 Swagger/Springfox/Springdoc 依赖：$line"
  done <<< "$SW_POM"
fi

# ────────────────────────────────────────────────
# CR-31  log.debug 残留（生产禁止）
# ────────────────────────────────────────────────
echo ""
echo "【CR-31】检查 log.debug 残留..."
HITS=$(run_rg 'log\.debug\s*\(' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_warning "存在 log.debug，生产环境建议去除或改为 log.info：$line"
  done <<< "$HITS"
else
  print_ok "CR-31 通过"
fi

# ────────────────────────────────────────────────
# 汇总
# ────────────────────────────────────────────────
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
