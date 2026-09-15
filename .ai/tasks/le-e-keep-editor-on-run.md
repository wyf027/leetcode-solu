# Keep Micro open for execution and submission

- F2/F3/F4 use save(false). A confirmed save validates the active document path,
  language and question identity before marking its source ready.
- Test/submit may temporarily replace the long-lived edit operation. Completion
  restores edit while its abort controller remains active. Editor shutdown only
  clears an edit operation, never an in-flight test/submit.
- Micro remains mounted and focused; input is frozen while a judge request reads
  the saved file. Submit confirmation is retained. Source readiness is reset when
  starting a new edit session. Previously returned results remain last-run results.
- Real Micro with a disposable source and fake judge gateway verified F3 and F4
  keep editor/cursor, require save and submit confirmation, and block on save error.
  Also verified manual close restores idle. No real judge calls or user source reads.
- Type/lint/diff checks pass; no repository tests or build requested/run.
- Next action: explicit build, restart and user acceptance. No commit/push.
