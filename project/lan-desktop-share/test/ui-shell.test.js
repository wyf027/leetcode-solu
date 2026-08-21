import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";

test("HTML exposes every app hook and uses local Tailwind output", async () => {
  const html = await fs.readFile(
    new URL("../public/index.html", import.meta.url),
    "utf8",
  );
  const requiredIds = [
    "host-panel",
    "viewer-panel",
    "start-button",
    "stop-button",
    "copy-button",
    "viewer-link",
    "viewer-count",
    "host-video",
    "viewer-video",
    "host-status",
    "viewer-status",
    "retry-button",
  ];

  for (const id of requiredIds)
    assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /href="\/styles\.css"/);
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com|https:\/\//);
});
