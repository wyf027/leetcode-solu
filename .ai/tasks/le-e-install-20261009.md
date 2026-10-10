# le-e one-line installers

- Request: Bash installer at github.io/le-e/install and PowerShell entry, with OS switch/copy/source links on landing page.
- Branch: feat/le-e-install-20261009; baseline 6d5366f. Main is sole writer here; installer agent owns separate Pages checkout.
- Scope: landing UI and installation documentation only; TUI unchanged. Scripts live in Pages repository.
- Verification: static syntax and artifact checks; no installation, builds or tests run by default. Windows support must accurately describe runtime limitations.
- Status: landing tabs/copy/script links and Bash/PowerShell scripts implemented. Public installer URLs not yet deployed; publish Pages scripts and verify raw bodies before publishing landing.
- Verified: node --check app.js and git diff --check pass. Uses existing Tailwind classes/compiled CSS; no build run. Independent review confirms release ordering is the remaining publishing gate.
- Platform: PowerShell delegates to WSL; current upstream editor bridge is a Unix executable and native Windows interaction is not validated.
- Final checks: Bash syntax and JavaScript syntax passed; PowerShell runtime/parser unavailable. Independent script review disclosure issue corrected: existing CLI editor setting can change with reversible backup. No install, test, build, commit or deployment performed.
