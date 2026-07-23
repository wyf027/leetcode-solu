#!/usr/bin/env bash

set -euo pipefail

target="${1:-}"
if [[ -z "${target}" ]]; then
  echo "Usage: $0 /absolute/path/to/repository" >&2
  exit 2
fi

repo_root="$(git -C "${target}" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  echo "Error: target is not inside a Git repository: ${target}" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
template_root="${script_dir}/../templates/project-governance"

install_file_if_missing() {
  local source="$1"
  local destination="$2"

  if [[ -e "${destination}" || -L "${destination}" ]]; then
    echo "Keep existing: ${destination}"
    return
  fi

  mkdir -p "$(dirname "${destination}")"
  cp "${source}" "${destination}"
  echo "Installed: ${destination}"
}

install_file_if_missing "${template_root}/AGENTS.md" "${repo_root}/AGENTS.md"
install_file_if_missing "${template_root}/.ai/tasks/TASK-TEMPLATE.md" "${repo_root}/.ai/tasks/TASK-TEMPLATE.md"
install_file_if_missing "${template_root}/scripts/agent/bootstrap.sh" "${repo_root}/scripts/agent/bootstrap.sh"
install_file_if_missing "${template_root}/scripts/agent/verify.sh" "${repo_root}/scripts/agent/verify.sh"
install_file_if_missing "${template_root}/scripts/agent/handoff-check.sh" "${repo_root}/scripts/agent/handoff-check.sh"

if [[ ! -e "${repo_root}/CLAUDE.md" && ! -L "${repo_root}/CLAUDE.md" ]]; then
  (
    cd "${repo_root}"
    ln -s AGENTS.md CLAUDE.md
  )
  echo "Installed: ${repo_root}/CLAUDE.md -> AGENTS.md"
else
  echo "Keep existing: ${repo_root}/CLAUDE.md"
fi

chmod +x \
  "${repo_root}/scripts/agent/bootstrap.sh" \
  "${repo_root}/scripts/agent/verify.sh" \
  "${repo_root}/scripts/agent/handoff-check.sh"

echo "Project governance template installed without overwriting existing files."
