#!/usr/bin/env bash
# git-commit/scripts/check-secrets.sh
# 覆盖：CR-27（硬编码密码）、CR-28（内网IP）、CR-29（AccessKey/Token）、CR-30（私钥/证书）
# 用法：bash check-secrets.sh [目标目录或文件列表]
# 在 pre-commit 中由 GC-09 增量模式调用

set -euo pipefail

TARGET="${1:-.}"
INCREMENTAL_FILES=()
if [[ "${1:-}" == "--files" ]]; then
  read -ra INCREMENTAL_FILES <<< "${2:-}"
  TARGET="."
fi

RED='\033[0;31m'
NC='\033[0m'

ERRORS=0
print_error() { echo -e "${RED}❌ [SECRET]${NC} $*"; ((ERRORS++)) || true; }

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
echo "  git-commit / check-secrets.sh"
echo "  扫描范围: ${TARGET}"
echo "============================================"

# CR-27  硬编码密码/密钥
echo ""
echo "【CR-27】检查硬编码密码/密钥..."
HITS=$(run_rg '(password|passwd|secret|privateKey)\s*=\s*"[^"]{6,}"' -i -g '*.java' -g '*.yml' -g '*.yaml' -g '*.properties' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "疑似硬编码密码/密钥，请改用配置中心或环境变量：$line"
  done <<< "$HITS"
else
  echo -e "\033[0;32m✅ CR-27 通过\033[0m"
fi

# CR-28  硬编码内网 IP（172.16.x.x、192.168.x.x、10.x.x.x）
echo ""
echo "【CR-28】检查硬编码内网 IP..."
HITS=$(run_rg '"(172\.16\.|192\.168\.|10\.\d+\.)\d+\.\d+"' -g '*.java' -g '*.yml' -g '*.yaml' -g '*.properties' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "疑似硬编码内网 IP，应提取到配置文件或注册中心：$line"
  done <<< "$HITS"
else
  echo -e "\033[0;32m✅ CR-28 通过\033[0m"
fi

# CR-29  AccessKey / Token 硬编码
echo ""
echo "【CR-29】检查硬编码 AccessKey/Token..."
HITS=$(run_rg '(accessKey|accessSecret|apiKey|apiSecret|authToken|bearerToken)\s*=\s*"[^"]{8,}"' -i -g '*.java' -g '*.yml' -g '*.yaml' -g '*.properties' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "疑似硬编码 AccessKey/Token，请改用配置中心：$line"
  done <<< "$HITS"
else
  echo -e "\033[0;32m✅ CR-29 通过\033[0m"
fi

# CR-30  私钥/证书内容
echo ""
echo "【CR-30】检查私钥/证书内容..."
HITS=$(run_rg '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' || true)
if [[ -n "$HITS" ]]; then
  while IFS= read -r line; do
    print_error "发现私钥内容，禁止提交到代码仓库：$line"
  done <<< "$HITS"
else
  echo -e "\033[0;32m✅ CR-30 通过\033[0m"
fi

echo ""
echo "============================================"
if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}❌ 发现 $ERRORS 处敏感信息，提交被阻断${NC}"
  exit 1
else
  echo -e "\033[0;32m✅ 敏感信息扫描通过\033[0m"
  exit 0
fi
