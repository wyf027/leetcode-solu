#!/usr/bin/env python3
"""
java-mapper/scripts/check-n-plus-one.py
覆盖：MP-04（N+1 查询检测：循环内 Mapper/Service 查库调用）
用法：python3 check-n-plus-one.py <java-file-or-dir>
注意：这是静态分析，存在误报率，实际运行时结合业务判断。
"""

import sys
import os
import re

RED = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN = '\033[0;32m'
NC = '\033[0m'

errors = 0
warnings = 0

# 在循环内调用数据库相关 API 的模式
DB_CALL_PATTERNS = [
    re.compile(r'mapper\.\w+\s*\('),
    re.compile(r'lambdaQuery\s*\(\s*\)'),
    re.compile(r'baseMapper\.\w+\s*\('),
    re.compile(r'getById\s*\('),
    re.compile(r'getOne\s*\('),
    re.compile(r'list\s*\(\s*\)'),
    re.compile(r'service\.\w*(get|find|query|list|select|fetch)\w*\s*\(', re.IGNORECASE),
]

LOOP_PATTERNS = [
    re.compile(r'^\s*for\s*\('),
    re.compile(r'^\s*while\s*\('),
    re.compile(r'\.forEach\s*\('),
    re.compile(r'\.stream\s*\(\)'),
]


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


def is_in_loop(lines, target_line_idx, window=20):
    """向上 window 行内找循环开始，向下检查是否在循环体内"""
    for i in range(max(0, target_line_idx - window), target_line_idx):
        for loop_pat in LOOP_PATTERNS:
            if loop_pat.search(lines[i]):
                # 简单判断：循环开始到当前行之间大括号是否未闭合
                brace_depth = 0
                for j in range(i, target_line_idx + 1):
                    brace_depth += lines[j].count('{') - lines[j].count('}')
                if brace_depth > 0:
                    return True, i + 1
    return False, -1


def check_file(path):
    if not path.endswith('.java'):
        return
    rel = os.path.relpath(path)

    # 只处理 Service 相关文件
    if not any(kw in os.path.basename(path) for kw in ['Service', 'Impl', 'Handler', 'Job']):
        return

    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
    except Exception as e:
        print_warning(f"无法读取 {rel}: {e}")
        return

    for i, line in enumerate(lines):
        # 跳过注释行
        stripped = line.strip()
        if stripped.startswith('//') or stripped.startswith('*'):
            continue

        for db_pat in DB_CALL_PATTERNS:
            if db_pat.search(line):
                in_loop, loop_line = is_in_loop(lines, i)
                if in_loop:
                    print_warning(
                        f"MP-04 疑似 N+1 查询：循环体内（循环起始行 {loop_line}）调用数据库操作："
                        f"{rel}:{i + 1}  → {stripped[:80]}"
                    )
                    break  # 同一行只报一次


def main():
    if len(sys.argv) < 2:
        print("用法：python3 check-n-plus-one.py <java-file-or-dir>")
        sys.exit(1)

    print("============================================")
    print("  java-mapper / check-n-plus-one.py")
    print("  检查：MP-04（循环内数据库调用 N+1 问题）")
    print("  注意：静态分析存在误报，请结合业务判断")
    print("============================================")

    for target in sys.argv[1:]:
        if os.path.isfile(target):
            check_file(target)
        elif os.path.isdir(target):
            for root, dirs, files in os.walk(target):
                dirs[:] = [d for d in dirs if d not in ['target', '.git', 'node_modules']]
                for fname in files:
                    if fname.endswith('.java'):
                        check_file(os.path.join(root, fname))
        else:
            print_warning(f"路径不存在：{target}")

    print()
    print("============================================")
    if errors > 0:
        print(f"{RED}❌ 检查完成：{errors} 个阻断错误，{warnings} 个警告{NC}")
        sys.exit(1)
    elif warnings > 0:
        print(f"{YELLOW}🟡 检查完成：{warnings} 处疑似 N+1（请人工确认）{NC}")
    else:
        print_ok("全部通过，未发现循环内数据库调用")


if __name__ == '__main__':
    main()
