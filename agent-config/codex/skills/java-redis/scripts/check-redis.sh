#!/usr/bin/env bash
# java-redis/scripts/check-redis.sh
# 覆盖：RD-01~RD-05、RD-07（rg 扫 Redis 使用禁令）
# 用法：bash check-redis.sh [目标目录] [--files "file1 file2 ..."]

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
echo "  java-redis / check-redis.sh"
echo "  扫描范围: $TARGET"
echo "============================================"

# RD-01  直接注入 StringRedisTemplate / RedisTemplate
echo ""
echo "【RD-01】检查直接注入 StringRedisTemplate/RedisTemplate..."
HITS=$(run_rg '@(Resource|Autowired)[^;]*\n[^;]*(StringRedisTemplate|RedisTemplate)\s+' -g '*.java' -U || true)
if [[ -z "$HITS" ]]; then
  HITS=$(run_rg 'private\s+(StringRedisTemplate|RedisTemplate)\s+\w+' -g '*.java' || true)
fi
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "禁止直接注入 StringRedisTemplate/RedisTemplate，统一使用 RedisUtil 静态方法：$line"
  done <<< "$HITS"
else
  print_ok "RD-01 通过"
fi

# RD-02  自定义 @Bean RedisTemplate（禁止绕过 RedisUtil）
echo ""
echo "【RD-02】检查自定义 @Bean RedisTemplate..."
HITS=$(run_rg '@Bean[^}]*RedisTemplate' -g '*.java' -U || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "禁止自定义 @Bean RedisTemplate，统一由 common-spring 提供：$line"
  done <<< "$HITS"
else
  print_ok "RD-02 通过"
fi

# RD-03  Redis 操作无 TTL（RedisUtil.set(key, value) 两参数版本）
# RedisUtil.set 有三个重载：
#   set(key, value)                   ← 无 TTL，禁止
#   set(key, value, Duration)         ← 有 TTL，允许
#   set(key, value, timeout, TimeUnit)← 有 TTL，允许
# 简单正则无法区分含嵌套括号的参数个数，改用关键词过滤：含 TimeUnit/Duration/时间单位的调用视为已设 TTL
echo ""
echo "【RD-03】检查 Redis 操作无 TTL..."
HITS=$(run_rg 'RedisUtil\.set\s*\(' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  HAS_ERROR=false
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    # 排除含 TTL 参数的重载（TimeUnit / Duration / 时间单位常量）
    if echo "$line" | grep -qE 'TimeUnit\.|Duration\.|MINUTES|HOURS|SECONDS|DAYS|MILLISECONDS'; then
      continue
    fi
    print_error "RD-03 RedisUtil.set 必须传入 TTL 参数，禁止永不过期：$line"
    HAS_ERROR=true
  done <<< "$HITS"
  [[ "$HAS_ERROR" == false ]] && print_ok "RD-03 通过（含 TTL 参数的调用已豁免）"
else
  print_ok "RD-03 通过"
fi

# RD-04  Redis Key 硬编码字符串（未引用 CacheConst 常量）
echo ""
echo "【RD-04】检查 Redis Key 硬编码字符串..."
HITS=$(run_rg 'RedisUtil\.\w+\s*\(\s*"[^"]*:[^"]*"' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "Redis Key 禁止硬编码字符串，应引用 CacheConst 常量：$line"
  done <<< "$HITS"
else
  print_ok "RD-04 通过"
fi

# RD-05  Redis Key 拼接方式（CacheConst.KEY + id 禁止，应用 String.format）
echo ""
echo "【RD-05】检查 Redis Key 拼接方式..."
HITS=$(run_rg 'CacheConst\.\w+\s*\+\s*' -g '*.java' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "Redis Key 拼接应使用 String.format(CacheConst.KEY, id) 而非 + 拼接：$line"
  done <<< "$HITS"
else
  print_ok "RD-05 通过"
fi

# RD-07  Redis 操作在 Controller/Mapper/Listener 层调用（应在 Service 层）
echo ""
echo "【RD-07】检查 Redis 操作层次违规..."
if [[ ${#INCREMENTAL_FILES[@]} -gt 0 ]]; then
  # 增量模式：rg 对显式文件路径不应用 --glob 过滤，须手动按文件名筛选
  HITS=""
  for f in "${INCREMENTAL_FILES[@]}"; do
    case "$f" in
      *Controller.java|*Mapper.java|*Listener.java)
        result=$(rg --no-heading -n 'RedisUtil\.' "$f" 2>/dev/null || true)
        [[ -n "$result" ]] && HITS="${HITS}${result}"$'\n'
        ;;
    esac
  done
else
  HITS=$(rg --no-heading -n -g '*Controller.java' -g '*Mapper.java' -g '*Listener.java' 'RedisUtil\.' "$TARGET" 2>/dev/null || true)
fi
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    print_error "RedisUtil 应在 Service 层调用，禁止在 Controller/Mapper/Listener 中直接使用：$line"
  done <<< "$HITS"
else
  print_ok "RD-07 通过"
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
