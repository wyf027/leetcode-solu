#!/usr/bin/env bash
# git-commit/scripts/run-audit.sh
# 一键审查脚本：按变更文件类型分流执行，所有 stdout/stderr/exit-code 落盘到审计目录。
#
# 用法：
#   bash run-audit.sh                # 自动从 git diff --cached / HEAD / untracked 推断变更
#   bash run-audit.sh <f1> <f2> ...  # 手动指定文件列表
#
# 输出（必须原样粘贴到 git-commit 的"代码审查证据"卡片）：
#   AUDIT_DIR=/tmp/git-commit-audit-...
#   各 check 项 EXIT
#   ls -la $AUDIT_DIR
#   OVERALL_EXIT=0|1   （1 = 必须阻断提交）
#
# 退出码：
#   0 = 全部通过 / 仅 WARN
#   1 = 存在阻断 ERROR
#   2 = 脚本本身执行失败（环境异常）

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JCR_DIR="$(cd "$SCRIPT_DIR/../../java-code-review/scripts" 2>/dev/null && pwd || true)"
JSV_DIR="$(cd "$SCRIPT_DIR/../../java-service/scripts" 2>/dev/null && pwd || true)"
JMQ_DIR="$(cd "$SCRIPT_DIR/../../java-mq/scripts" 2>/dev/null && pwd || true)"
JMP_DIR="$(cd "$SCRIPT_DIR/../../java-mapper/scripts" 2>/dev/null && pwd || true)"
JRD_DIR="$(cd "$SCRIPT_DIR/../../java-redis/scripts" 2>/dev/null && pwd || true)"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

# 关闭 octal-escape，确保含中文等非 ASCII 路径以原始字符输出
GIT="git -c core.quotepath=false"

# ---------- 收集变更文件（兼容 bash 3.x，避免 mapfile）----------
CHANGED=()
if [ "$#" -gt 0 ]; then
  for f in "$@"; do CHANGED+=("$f"); done
else
  while IFS= read -r f; do
    [ -n "$f" ] && CHANGED+=("$f")
  done < <(
    {
      $GIT diff --cached --name-only 2>/dev/null
      $GIT diff --name-only HEAD 2>/dev/null
      $GIT ls-files --others --exclude-standard 2>/dev/null
    } | sort -u
  )
fi

# ---------- 创建审计目录 ----------
TS="$(date +%Y%m%d-%H%M%S)"
AUDIT_DIR="/tmp/git-commit-audit-${TS}-$$"
mkdir -p "$AUDIT_DIR"

{
  echo "AUDIT_DIR=$AUDIT_DIR"
  echo "REPO=$REPO_ROOT"
  echo "BRANCH=$(git branch --show-current 2>/dev/null || echo unknown)"
  echo "TIMESTAMP=$(date -Iseconds 2>/dev/null || date)"
  echo "FILES_COUNT=${#CHANGED[@]}"
} | tee "$AUDIT_DIR/meta.txt"

if [ "${#CHANGED[@]}" -gt 0 ]; then
  printf '%s\n' "${CHANGED[@]}" > "$AUDIT_DIR/files.txt"
else
  : > "$AUDIT_DIR/files.txt"
fi

# ---------- 文件分类 ----------
JAVA_FILES=()
XML_FILES=()
SECRET_TARGETS=()
VERSION_FILES=()
PUSH_TARGET_FILES=()
for f in "${CHANGED[@]+"${CHANGED[@]}"}"; do
  [ -e "$f" ] || continue
  PUSH_TARGET_FILES+=("$f")
  case "$f" in
    *.java) JAVA_FILES+=("$f"); SECRET_TARGETS+=("$f") ;;
    *.xml) XML_FILES+=("$f"); SECRET_TARGETS+=("$f") ;;
    *.sql|*.yml|*.yaml|*.properties|*.ts|*.tsx|*.js|*.vue|*.md|*.sh)
      SECRET_TARGETS+=("$f") ;;
    *) SECRET_TARGETS+=("$f") ;;
  esac
  case "$f" in
    *version/antview/*) VERSION_FILES+=("$f") ;;
  esac
done

# ---------- 跑单个 check 并落盘 ----------
run_check() {
  local label="$1"; shift
  local logfile="$AUDIT_DIR/${label}.log"
  local rc
  ( "$@" ) >"$logfile" 2>&1
  rc=$?
  echo "$label EXIT=$rc LOG=$logfile"
  return $rc
}

GLOBAL_BAN_RC=0
SECRETS_RC=0
LOMBOK_RC=0
NAMING_RC=0
SIZE_RC=0
RUNTIME_RISK_RC=0
TRANSACTION_RC=0
MQ_RC=0
MQ_ADVANCED_RC=0
MAPPER_RC=0
N_PLUS_ONE_RC=0
REDIS_RC=0
VERSION_RC=0
PUSH_TARGET_RC=0

echo ""
echo "===== RUN CHECKS ====="

# Java 类检查（仅当存在 .java 变更）
if [ "${#JAVA_FILES[@]}" -gt 0 ] && [ -n "$JCR_DIR" ]; then
  if [ -x "$JCR_DIR/check-global-bans.sh" ] || [ -f "$JCR_DIR/check-global-bans.sh" ]; then
    run_check check-global-bans bash "$JCR_DIR/check-global-bans.sh" --files "${JAVA_FILES[*]}" || GLOBAL_BAN_RC=$?
  fi
  if [ -f "$JCR_DIR/check-lombok.sh" ]; then
    run_check check-lombok bash "$JCR_DIR/check-lombok.sh" --files "${JAVA_FILES[*]}" || LOMBOK_RC=$?
  fi
  if [ -f "$JCR_DIR/check-naming.sh" ]; then
    run_check check-naming bash "$JCR_DIR/check-naming.sh" --files "${JAVA_FILES[*]}" || NAMING_RC=$?
  fi
  if [ -f "$JCR_DIR/check-size.py" ]; then
    run_check check-size python3 "$JCR_DIR/check-size.py" "${JAVA_FILES[@]}" || SIZE_RC=$?
  fi
  if [ -f "$JCR_DIR/check-runtime-risk.py" ]; then
    RUNTIME_FILES=("${JAVA_FILES[@]}")
    if [ "${#XML_FILES[@]}" -gt 0 ]; then
      RUNTIME_FILES+=("${XML_FILES[@]}")
    fi
    run_check check-runtime-risk python3 "$JCR_DIR/check-runtime-risk.py" "${RUNTIME_FILES[@]}" || RUNTIME_RISK_RC=$?
  fi
  if [ -n "$JSV_DIR" ] && [ -f "$JSV_DIR/check-transaction-boundary.py" ]; then
    run_check check-transaction-boundary python3 "$JSV_DIR/check-transaction-boundary.py" . --files "${JAVA_FILES[@]}" || TRANSACTION_RC=$?
  fi
  if [ -n "$JMQ_DIR" ] && [ -f "$JMQ_DIR/check-mq.sh" ]; then
    run_check check-mq bash "$JMQ_DIR/check-mq.sh" --files "${JAVA_FILES[*]}" || MQ_RC=$?
  fi
  if [ -n "$JMQ_DIR" ] && [ -f "$JMQ_DIR/check-mq-advanced.py" ]; then
    run_check check-mq-advanced python3 "$JMQ_DIR/check-mq-advanced.py" "${JAVA_FILES[@]}" || MQ_ADVANCED_RC=$?
  fi
  if [ -n "$JMP_DIR" ] && [ -f "$JMP_DIR/check-n-plus-one.py" ]; then
    run_check check-n-plus-one python3 "$JMP_DIR/check-n-plus-one.py" "${JAVA_FILES[@]}" || N_PLUS_ONE_RC=$?
  fi
  if [ -n "$JRD_DIR" ] && [ -f "$JRD_DIR/check-redis.sh" ]; then
    run_check check-redis bash "$JRD_DIR/check-redis.sh" --files "${JAVA_FILES[*]}" || REDIS_RC=$?
  fi
fi

MAPPER_SCAN_FILES=()
if [ "${#JAVA_FILES[@]}" -gt 0 ]; then
  MAPPER_SCAN_FILES+=("${JAVA_FILES[@]}")
fi
if [ "${#XML_FILES[@]}" -gt 0 ]; then
  MAPPER_SCAN_FILES+=("${XML_FILES[@]}")
fi
if [ "${#MAPPER_SCAN_FILES[@]}" -gt 0 ] && [ -n "$JMP_DIR" ] && [ -f "$JMP_DIR/check-mapper.sh" ]; then
  run_check check-mapper bash "$JMP_DIR/check-mapper.sh" --files "${MAPPER_SCAN_FILES[*]}" || MAPPER_RC=$?
fi

# 密钥扫描（任何文本文件都跑）
if [ "${#SECRET_TARGETS[@]}" -gt 0 ]; then
  run_check check-secrets bash "$SCRIPT_DIR/check-secrets.sh" --files "${SECRET_TARGETS[*]}" || SECRETS_RC=$?
fi

# version 项目专项检查（仅当变更包含 version/antview/ 路径时执行）
if [ "${#VERSION_FILES[@]}" -gt 0 ]; then
  run_check check-version bash "$SCRIPT_DIR/check-version.sh" --files "${VERSION_FILES[*]}" || VERSION_RC=$?
fi

# 推送目标分支检查（Markdown / Shell 等文档与脚本）
if [ "${#PUSH_TARGET_FILES[@]}" -gt 0 ]; then
  run_check check-push-target bash "$SCRIPT_DIR/check-push-target.sh" --files "${PUSH_TARGET_FILES[*]}" || PUSH_TARGET_RC=$?
fi

# ---------- 汇总 ----------
echo ""
echo "===== AUDIT SUMMARY ====="
ls -la "$AUDIT_DIR"
echo ""
echo "AUDIT_DIR=$AUDIT_DIR"
echo "GLOBAL_BAN_EXIT=$GLOBAL_BAN_RC"
echo "LOMBOK_EXIT=$LOMBOK_RC"
echo "NAMING_EXIT=$NAMING_RC"
echo "SIZE_EXIT=$SIZE_RC"
echo "RUNTIME_RISK_EXIT=$RUNTIME_RISK_RC"
echo "TRANSACTION_EXIT=$TRANSACTION_RC"
echo "MQ_EXIT=$MQ_RC"
echo "MQ_ADVANCED_EXIT=$MQ_ADVANCED_RC"
echo "MAPPER_EXIT=$MAPPER_RC"
echo "N_PLUS_ONE_EXIT=$N_PLUS_ONE_RC"
echo "REDIS_EXIT=$REDIS_RC"
echo "SECRETS_EXIT=$SECRETS_RC"
echo "VERSION_EXIT=$VERSION_RC"
echo "PUSH_TARGET_EXIT=$PUSH_TARGET_RC"

OVERALL=0
for rc in "$GLOBAL_BAN_RC" "$LOMBOK_RC" "$NAMING_RC" "$SIZE_RC" "$RUNTIME_RISK_RC" "$TRANSACTION_RC" "$MQ_RC" "$MQ_ADVANCED_RC" "$MAPPER_RC" "$N_PLUS_ONE_RC" "$REDIS_RC" "$SECRETS_RC" "$VERSION_RC" "$PUSH_TARGET_RC"; do
  if [ "$rc" -ne 0 ]; then OVERALL=1; fi
done
echo "OVERALL_EXIT=$OVERALL"

# 写一份汇总到 audit dir 里，便于 verify-audit 读取
{
  echo "AUDIT_DIR=$AUDIT_DIR"
  echo "GLOBAL_BAN_EXIT=$GLOBAL_BAN_RC"
  echo "LOMBOK_EXIT=$LOMBOK_RC"
  echo "NAMING_EXIT=$NAMING_RC"
  echo "SIZE_EXIT=$SIZE_RC"
  echo "RUNTIME_RISK_EXIT=$RUNTIME_RISK_RC"
  echo "TRANSACTION_EXIT=$TRANSACTION_RC"
  echo "MQ_EXIT=$MQ_RC"
  echo "MQ_ADVANCED_EXIT=$MQ_ADVANCED_RC"
  echo "MAPPER_EXIT=$MAPPER_RC"
  echo "N_PLUS_ONE_EXIT=$N_PLUS_ONE_RC"
  echo "REDIS_EXIT=$REDIS_RC"
  echo "SECRETS_EXIT=$SECRETS_RC"
  echo "VERSION_EXIT=$VERSION_RC"
  echo "PUSH_TARGET_EXIT=$PUSH_TARGET_RC"
  echo "OVERALL_EXIT=$OVERALL"
} > "$AUDIT_DIR/summary.txt"

exit "$OVERALL"
