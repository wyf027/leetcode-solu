#!/usr/bin/env bash

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  echo "Error: run this script inside a Git repository." >&2
  exit 2
fi

cd "${repo_root}"

echo "Repository: ${repo_root}"
echo "Branch: $(git branch --show-current)"
echo "HEAD: $(git rev-parse --short HEAD)"

status_count="$(git status --porcelain=v1 | wc -l | tr -d ' ')"
echo "Working tree changes: ${status_count}"

if [[ -f package.json ]]; then
  if [[ -f pnpm-lock.yaml ]]; then
    package_manager="pnpm"
  elif [[ -f yarn.lock ]]; then
    package_manager="yarn"
  else
    package_manager="npm"
  fi
  echo "JavaScript package manager: ${package_manager}"
  command -v "${package_manager}" >/dev/null || {
    echo "Error: ${package_manager} is required but unavailable." >&2
    exit 2
  }
fi

if [[ -f pom.xml ]]; then
  echo "Java build: Maven"
  command -v mvn >/dev/null || {
    echo "Error: Maven is required but unavailable." >&2
    exit 2
  }
fi

if [[ -f gradlew ]]; then
  echo "Java build: Gradle wrapper"
  [[ -x gradlew ]] || {
    echo "Error: gradlew is not executable." >&2
    exit 2
  }
fi

if [[ -f .gitmodules ]]; then
  git submodule status
fi

echo "Bootstrap checks passed."
