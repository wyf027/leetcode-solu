# Classic atlas image recovery

- Status: restoring original PNGs and card mappings; user requested same online recovery as sci-fi atlas.
- Branch: fix/classic-atlas-images-20261009; sole writer root.
- Base: ff44920b9d89103af552fb246daccd586991cdda.
- Target: wyf-classic-atlas.vercel.app, project prj_bB9Bc5hnqyyIPRpEGaNFK0qxq6rH, account team_neI2Pkb9AksTVL3sxYKoJtJW.
- Source: /Users/wuyangfan/Documents/Codex/2026-06-29/cha/outputs, atlas-data.js and atlas-images-gpt-image2.
- Cause: original PNGs intentionally excluded from repo and image fields removed; production renders placeholders.
- Restored mapping uses same book, position, title, group and prompt. All 804 match. Preserve all current text; two Shanhaijing cards have historical text differences but identical titles/groups/prompts.
- Store original PNGs in Git LFS; route requests through pinned media source. No regeneration, tests, builds or browser automation.
- Next action: commit and publish LFS originals, configure image routing, publish this static site and verify PNG responses.
