#!/usr/bin/env python3
"""
expand-single-line-javadoc.py

将 Java 源文件中的单行 Javadoc `/** xxx */` 就地展开为三行格式：

    /**
     * xxx
     */

仅作为 check-format.sh 的预处理步骤运行（在交给 Eclipse JDT formatter 之前）。
Eclipse JDT formatter 没有提供「强制展开单行 Javadoc」的开关，因此通过本脚本补齐。

匹配规则（行级）：
  ^(\s*)/\*\*\s+(非空内容)\s+\*/\s*$
其中「非空内容」必须包含至少一个非星号、非空白字符；
`/** */`、`/****/`、`/**/` 等空内容形态一律跳过。

注意：
  - 仅处理整行单行 Javadoc，不处理同一行内代码后跟 Javadoc 的混合写法
  - 行内字符串字面量含 `*/` 的情况不会被错误命中（因为我们要求行起始即为 `/**`）
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

SINGLE_LINE_JAVADOC = re.compile(r"^(?P<indent>\s*)/\*\*\s+(?P<body>.+?)\s+\*/\s*$")


def expand_line(line: str) -> list[str] | None:
    """单行 Javadoc → 三行展开。无需展开时返回 None。"""
    m = SINGLE_LINE_JAVADOC.match(line.rstrip("\n"))
    if not m:
        return None
    body = m.group("body").strip()
    if not body or set(body) <= {"*"}:
        return None
    indent = m.group("indent")
    return [
        f"{indent}/**\n",
        f"{indent} * {body}\n",
        f"{indent} */\n",
    ]


def process_file(path: Path) -> bool:
    """就地处理单个 .java 文件，返回是否发生修改。"""
    original = path.read_text(encoding="utf-8")
    out_lines: list[str] = []
    changed = False
    for line in original.splitlines(keepends=True):
        expanded = expand_line(line)
        if expanded is None:
            out_lines.append(line)
        else:
            out_lines.extend(expanded)
            changed = True
    if changed:
        path.write_text("".join(out_lines), encoding="utf-8")
    return changed


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: expand-single-line-javadoc.py <file-or-dir>", file=sys.stderr)
        return 2
    target = Path(argv[1])
    if not target.exists():
        print(f"target not found: {target}", file=sys.stderr)
        return 2

    files = (
        [target]
        if target.is_file() and target.suffix == ".java"
        else list(target.rglob("*.java"))
    )
    modified = sum(1 for f in files if process_file(f))
    print(f"expand-single-line-javadoc: scanned={len(files)} modified={modified}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
