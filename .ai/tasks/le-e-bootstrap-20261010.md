# Automatic dependency installation messaging

- Branch: feat/le-e-bootstrap-page-20261010; base 55ec409; target main.
- Scope: explain automatic dependencies, Windows WSL permission/restart/initialization steps, curl prerequisite and optional manual installation. Existing Tailwind classes reused.
- Verification: node --check project/le-e-landing/app.js and git diff --check passed; independent read-only review completed. No page build or tests run.
- Installer acceptance: isolated Ubuntu 24.04 execution on server20 passed system dependencies and Node setup after the pipeline fix, but was stopped during a slow Rustup download. Full installation/startup and Windows interaction remain unverified.
- Authorization: user requested PR creation and merge on 2026-10-10.
- Release gate: merge installer changes to their gh-pages branch and verify public raw scripts first; only then merge this landing update. Git/GitHub records PR and merge SHAs.
