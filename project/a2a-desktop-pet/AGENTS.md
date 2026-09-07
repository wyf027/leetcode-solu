# A2A Desktop Pet

- Use Tauri 2, React, TypeScript, Vite, Tailwind CSS, and Rust.
- Keep Jenkins credentials in the Rust layer and macOS Keychain only.
- The WebView receives sanitized deployment state and never receives tokens.
- Jenkins writes are limited to `buildWithParameters` for the fixed `aihire-test-frontend` and
  `aihire-test-backend` jobs with safe boolean parameters set to `false`; do not expose arbitrary
  jobs, retry/stop/delete actions, Kubernetes credentials, shell access, or TLS bypasses.
- Production Jenkins writes are limited to parameterless `/build` requests for the fixed
  `aihire-prod-frontend` and `aihire-prod-backend` jobs, and the Rust command must obtain a positive
  macOS native confirmation before credentials or network access; direct WebView IPC must not bypass
  this gate.
- All generated HTML and UI markup must use Tailwind CSS.
- Run Prettier, ESLint, Vitest, rustfmt, Clippy, Cargo tests, and a Tauri build before delivery.
