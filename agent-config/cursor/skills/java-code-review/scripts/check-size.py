#!/usr/bin/env python3
"""
java-code-review/scripts/check-size.py
覆盖：CR-19（文件行数）、CR-20（方法行数）
用法：python3 check-size.py <java-file-or-dir> [--warn-file N] [--block-file N] [--warn-method N] [--block-method N]
"""

import sys
import os
import re
import argparse

# 阈值默认值（与方案一致）
DEFAULT_FILE_WARN = 1000
DEFAULT_FILE_BLOCK = 1200
# 测试目录（src/test/java）允许更宽松的文件阈值：工具类的全覆盖测试天然更长。
DEFAULT_FILE_WARN_TEST = 1500
DEFAULT_FILE_BLOCK_TEST = 2500
DEFAULT_METHOD_WARN = 30
DEFAULT_METHOD_BLOCK = 100

RED = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN = '\033[0;32m'
NC = '\033[0m'

errors = 0
warnings = 0


def print_error(msg):
    global errors
    print(f"{RED}❌ [ERROR]{NC} {msg}")
    errors += 1


def print_warning(msg):
    global warnings
    print(f"{YELLOW}🟡 [WARN] {NC} {msg}")
    warnings += 1


def print_ok(msg):
    print(f"{GREEN}✅ {msg}{NC}")


def strip_strings_and_comments(line, state):
    """
    去掉 Java 行内的字符串字面量、字符字面量、行注释、块注释，使后续 `{`/`}` 计数不受文本污染。
    state 为 dict，调用方持有以跨行维护块注释状态：{'in_block_comment': bool}
    返回：清理后的行（仅保留代码部分）。
    支持：
      - 行内 `// ...` 注释
      - 跨行 `/* ... */` 块注释
      - `"..."`（含转义 `\"`、`\\`）
      - `'...'`（含转义 `\'`、`\\`，覆盖 `'{'`、`'}'` 字符字面量）
    边缘失败：同一行内既有未结束字符串又有未结束块注释（极少见）。
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


def count_method_lines(lines):
    """
    简单解析 Java 方法行数：
    - 找到方法开头（public/private/protected ... { 行）
    - 计算到匹配的 } 为止的行数
    返回：[(method_name, start_line, line_count), ...]
    """
    results = []
    method_pattern = re.compile(
        r'^\s*(public|private|protected|default)\s+'
        r'(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?'
        r'(?:<[^>]+>\s+)?'
        r'(?:[\w<>\[\],]+\s+)+(\w+)\s*\([^)]*\)\s*(?:throws\s+\w+(?:\s*,\s*\w+)*)?\s*\{'
    )
    n = len(lines)
    state = {'in_block_comment': False}
    cleaned = [strip_strings_and_comments(ln, state) for ln in lines]
    i = 0
    while i < n:
        m = method_pattern.match(lines[i])
        if m:
            method_name = m.group(2)
            start = i
            depth = cleaned[i].count('{') - cleaned[i].count('}')
            j = i + 1
            while j < n and depth > 0:
                depth += cleaned[j].count('{') - cleaned[j].count('}')
                j += 1
            method_lines = j - start
            results.append((method_name, start + 1, method_lines))
            i = j
        else:
            i += 1
    return results


def check_file(path, args):
    if not path.endswith('.java'):
        return
    if not os.path.isfile(path):
        return

    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
    except Exception as e:
        print_warning(f"无法读取文件 {path}: {e}")
        return

    total_lines = len(lines)
    rel_path = os.path.relpath(path)

    # 测试目录适用更宽松阈值：工具类全覆盖测试普遍较长，
    # 仅在显著超长时提示拆分（避免对正常的全量覆盖测试发出噪声）。
    is_test = os.sep + 'src' + os.sep + 'test' + os.sep in path
    warn_file = args.warn_file_test if is_test else args.warn_file
    block_file = args.block_file_test if is_test else args.block_file

    # CR-19  文件行数检查
    if total_lines > block_file:
        print_error(f"CR-19 文件行数超过阻断阈值 {block_file}（当前 {total_lines} 行）：{rel_path}")
    elif total_lines > warn_file:
        print_warning(f"CR-19 文件行数超过警告阈值 {warn_file}（当前 {total_lines} 行）：{rel_path}")

    # CR-20  方法行数检查
    methods = count_method_lines(lines)
    for method_name, start_line, method_line_count in methods:
        if method_line_count > args.block_method:
            print_error(
                f"CR-20 方法行数超过阻断阈值 {args.block_method}（当前 {method_line_count} 行）："
                f"{rel_path}:{start_line} [{method_name}]"
            )
        elif method_line_count > args.warn_method:
            print_warning(
                f"CR-20 方法行数超过警告阈值 {args.warn_method}（当前 {method_line_count} 行）："
                f"{rel_path}:{start_line} [{method_name}]"
            )


def main():
    parser = argparse.ArgumentParser(description='Java 文件/方法行数检查')
    parser.add_argument('target', nargs='+', help='Java 文件或目录')
    parser.add_argument('--warn-file', type=int, default=DEFAULT_FILE_WARN)
    parser.add_argument('--block-file', type=int, default=DEFAULT_FILE_BLOCK)
    parser.add_argument('--warn-file-test', type=int, default=DEFAULT_FILE_WARN_TEST)
    parser.add_argument('--block-file-test', type=int, default=DEFAULT_FILE_BLOCK_TEST)
    parser.add_argument('--warn-method', type=int, default=DEFAULT_METHOD_WARN)
    parser.add_argument('--block-method', type=int, default=DEFAULT_METHOD_BLOCK)
    args = parser.parse_args()

    print("============================================")
    print("  java-code-review / check-size.py")
    print(f"  文件阈值（src/main）：warn={args.warn_file}, block={args.block_file}")
    print(f"  文件阈值（src/test）：warn={args.warn_file_test}, block={args.block_file_test}")
    print(f"  方法阈值：warn={args.warn_method}, block={args.block_method}")
    print("============================================")

    for target in args.target:
        if os.path.isfile(target):
            check_file(target, args)
        elif os.path.isdir(target):
            for root, dirs, files in os.walk(target):
                # 跳过 test 目录（测试类允许行数宽松）
                dirs[:] = [d for d in dirs if d not in ['target', '.git', 'node_modules']]
                for fname in files:
                    if fname.endswith('.java'):
                        check_file(os.path.join(root, fname), args)
        else:
            print_warning(f"路径不存在：{target}")

    print()
    print("============================================")
    if errors > 0:
        print(f"{RED}❌ 检查完成：{errors} 个阻断错误，{warnings} 个警告{NC}")
        sys.exit(1)
    elif warnings > 0:
        print(f"{YELLOW}🟡 检查完成：0 个阻断错误，{warnings} 个警告{NC}")
    else:
        print_ok("全部通过，无行数违规")


if __name__ == '__main__':
    main()
