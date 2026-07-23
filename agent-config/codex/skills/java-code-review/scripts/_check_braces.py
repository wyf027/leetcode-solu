#!/usr/bin/env python3
"""
java-code-review/scripts/_check_braces.py

Helper for CR-21：检查 if/for/while 是否省略大括号。
支持跨行条件（如 if (a\n   && b) { ... }），通过括号深度合并多行条件后再判定。

用法：
    _check_braces.py FILE [FILE ...]

输出（stdout，每行一个违规）：
    <file>:<lineno>: <原始 if/for/while 起始行>

不打印结果时退出码 0，只用于检测。汇总/着色由调用方负责。
"""

import re
import sys

KEYWORD = re.compile(r'^\s*(if|for|while)\b')


def strip_strings_and_comments(line: str, state: dict) -> str:
    """去掉行内字符串、字符字面量、行注释、块注释，避免文本里的 '(' / ')' 影响括号计数。
    state: {'in_block_comment': bool}，跨行维护。
    """
    out = []
    i = 0
    n = len(line)
    in_block = state.get('in_block_comment', False)
    while i < n:
        c = line[i]
        nxt = line[i + 1] if i + 1 < n else ''
        if in_block:
            if c == '*' and nxt == '/':
                in_block = False
                i += 2
            else:
                i += 1
            continue
        if c == '/' and nxt == '/':
            break
        if c == '/' and nxt == '*':
            in_block = True
            i += 2
            continue
        if c == '"':
            i += 1
            while i < n:
                if line[i] == '\\' and i + 1 < n:
                    i += 2
                    continue
                if line[i] == '"':
                    i += 1
                    break
                i += 1
            continue
        if c == "'":
            i += 1
            while i < n:
                if line[i] == '\\' and i + 1 < n:
                    i += 2
                    continue
                if line[i] == "'":
                    i += 1
                    break
                i += 1
            continue
        out.append(c)
        i += 1
    state['in_block_comment'] = in_block
    return ''.join(out)


def paren_delta(s: str) -> int:
    return s.count('(') - s.count(')')


def check_file(path: str) -> list:
    violations = []
    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            raw_lines = f.readlines()
    except OSError:
        return violations

    state = {'in_block_comment': False}
    cleaned = [strip_strings_and_comments(ln, state) for ln in raw_lines]

    n = len(cleaned)
    i = 0
    while i < n:
        line = cleaned[i]
        m = KEYWORD.match(line)
        if not m:
            i += 1
            continue

        first_paren = line.find('(')
        if first_paren == -1:
            i += 1
            continue

        merged = line[first_paren:]
        depth = paren_delta(merged)
        last = i
        while depth > 0 and last + 1 < n:
            last += 1
            merged += ' ' + cleaned[last]
            depth = paren_delta(merged)

        if depth != 0:
            i = last + 1
            continue

        last_close = merged.rfind(')')
        if last_close == -1:
            i = last + 1
            continue
        after = merged[last_close + 1:].lstrip()
        if not after.startswith('{'):
            violations.append((path, i + 1, raw_lines[i].rstrip('\n')))

        i = last + 1

    return violations


def main():
    files = sys.argv[1:]
    for path in files:
        for path_, lineno, text in check_file(path):
            print(f"{path_}:{lineno}: {text}")


if __name__ == '__main__':
    main()
