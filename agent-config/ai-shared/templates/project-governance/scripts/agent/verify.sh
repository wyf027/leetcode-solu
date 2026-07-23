#!/usr/bin/env bash

set -euo pipefail

mode="${1:-quick}"
if [[ "${mode}" != "quick" && "${mode}" != "full" ]]; then
  echo "Usage: $0 [quick|full]" >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  echo "Error: run this script inside a Git repository." >&2
  exit 2
fi

cd "${repo_root}"

if [[ -x scripts/agent/verify.local.sh ]]; then
  exec scripts/agent/verify.local.sh "${mode}"
fi

ran_check=0

run_package_script() {
  local script_name="$1"
  if ! node -e 'const p=require("./package.json"); process.exit(p.scripts && p.scripts[process.argv[1]] ? 0 : 1)' "${script_name}"; then
    return
  fi

  ran_check=1
  if [[ -f pnpm-lock.yaml ]]; then
    pnpm run "${script_name}"
  elif [[ -f yarn.lock ]]; then
    yarn "${script_name}"
  else
    npm run "${script_name}"
  fi
}

if [[ -f package.json ]]; then
  command -v node >/dev/null || {
    echo "Error: Node.js is required to inspect package scripts." >&2
    exit 2
  }

  run_package_script "format:check"
  run_package_script "lint"
  run_package_script "typecheck"
  run_package_script "type-check"

  if [[ "${mode}" == "full" ]]; then
    run_package_script "test"
    run_package_script "build"
  fi
fi

if [[ -f pom.xml ]]; then
  ran_check=1
  if [[ "${mode}" == "full" ]]; then
    mvn test
  else
    mvn -DskipTests compile
  fi
fi

if [[ -x gradlew ]]; then
  ran_check=1
  if [[ "${mode}" == "full" ]]; then
    ./gradlew test
  else
    ./gradlew classes
  fi
fi

if [[ "${ran_check}" -eq 0 ]]; then
  echo "Error: no supported verification command was discovered." >&2
  echo "Create scripts/agent/verify.local.sh with project-specific checks." >&2
  exit 2
fi

echo "Verification passed (${mode})."
