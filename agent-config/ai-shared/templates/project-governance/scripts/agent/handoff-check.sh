#!/usr/bin/env bash

set -euo pipefail

task_file="${1:-}"
if [[ -z "${task_file}" || ! -f "${task_file}" ]]; then
  echo "Usage: $0 .ai/tasks/TASK-xxx.md" >&2
  exit 2
fi

required_headings=(
  "## Status"
  "## Objective"
  "## Non-goals"
  "## Scope"
  "## Acceptance criteria"
  "## Completed"
  "## In progress"
  "## Verification"
  "## Risks and rollback"
  "## Next action"
)

missing=0
for heading in "${required_headings[@]}"; do
  if command -v rg >/dev/null 2>&1; then
    found="$(rg -F -x "${heading}" "${task_file}" || true)"
  else
    found="$(grep -F -x "${heading}" "${task_file}" || true)"
  fi

  if [[ -z "${found}" ]]; then
    echo "Missing heading: ${heading}" >&2
    missing=1
  fi
done

if [[ "${missing}" -ne 0 ]]; then
  exit 2
fi

if command -v rg >/dev/null 2>&1; then
  if rg -n '(^|[[:space:]])(TODO|unassigned|not run)([[:space:]]|$)' "${task_file}"; then
    echo "Error: unresolved handoff fields remain." >&2
    exit 2
  fi
else
  if grep -En '(^|[[:space:]])(TODO|unassigned|not run)([[:space:]]|$)' "${task_file}"; then
    echo "Error: unresolved handoff fields remain." >&2
    exit 2
  fi
fi

echo "Task card is structurally ready for handoff."
