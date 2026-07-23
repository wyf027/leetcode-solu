#!/usr/bin/env python3
"""
java-controller/scripts/check-controller-body.py
覆盖：CTL-03（Controller 方法体超过 3 行）、CTL-BIZ（Controller 含业务逻辑判断）
规范：Controller 只做协议适配：解析入参 → 调 Service → 封装出参，方法体不超过 3 行。
用法：python3 check-controller-body.py <java-file-or-dir>
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

METHOD_BODY_LIMIT = 3   # Controller 方法体硬性上限（行数，不含注解/空行/单独的 {/}）

# 业务逻辑特征：if 判断含业务条件、直接调用 Mapper、直接操作集合逻辑
BIZ_LOGIC_PATTERNS = [
    re.compile(r'if\s*\([^)]*\.(getStatus|getType|getState|getFlag|getRole)\s*\(\)'),
    re.compile(r'if\s*\([^)]*==\s*[0-9]+\s*\)'),   # 魔法值判断
    re.compile(r'\b\w*Mapper\s*\.\s*\w+\s*\('),     # 直接调 Mapper
    re.compile(r'for\s*\(|while\s*\(|\.forEach\('), # 循环
    re.compile(r'\.stream\s*\(\)'),                   # stream 操作
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


def count_effective_lines(body_lines):
    """
    计算方法体有效行数（不含空行、纯大括号行、注解行、单行注释）。
    """
    count = 0
    for _, line in body_lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped in ('{', '}', '{;', '};'):
            continue
        if stripped.startswith('@') or stripped.startswith('//') or stripped.startswith('*'):
            continue
        count += 1
    return count


def iter_methods(lines):
    """yield (method_name, start_idx, body_lines)"""
    method_pattern = re.compile(
        r'^\s*(?:@\w+[^)]*\)\s*\n)*\s*'   # 可能有注解
        r'(public|protected)\s+'
        r'(?:static\s+)?(?:final\s+)?'
        r'(?:<[^>]+>\s+)?'
        r'[\w<>\[\],\s]+\s+(\w+)\s*\([^)]*\)\s*\{'
    )
    simple_method = re.compile(
        r'^\s*(public|protected)\s+'
        r'(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?'
        r'(?:<[^>]+>\s+)?[\w<>\[\],\s]+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{'
    )
    n = len(lines)
    i = 0
    while i < n:
        m = simple_method.match(lines[i])
        if m:
            method_name = m.group(2)
            start = i
            depth = lines[i].count('{') - lines[i].count('}')
            j = i + 1
            while j < n and depth > 0:
                depth += lines[j].count('{') - lines[j].count('}')
                j += 1
            body = [(k + 1, lines[k]) for k in range(start, j)]
            yield method_name, start + 1, body
            i = j
        else:
            i += 1


def check_file(path):
    if not path.endswith('.java'):
        return
    if 'Controller' not in os.path.basename(path):
        return
    rel = os.path.relpath(path)

    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
    except Exception as e:
        print_warning(f"无法读取 {rel}: {e}")
        return

    for method_name, start_lineno, body in iter_methods(lines):
        # 跳过构造方法
        if method_name[0].isupper():
            continue

        effective = count_effective_lines(body)
        body_text = ''.join(line for _, line in body)

        # CTL-03  方法体超过 3 行
        if effective > METHOD_BODY_LIMIT:
            print_error(
                f"CTL-03 Controller 方法 [{method_name}] 有效行数 {effective} 行"
                f"（超过 {METHOD_BODY_LIMIT} 行限制），Controller 只做入参/出参转换，业务逻辑应下沉到 Service："
                f"{rel}:{start_lineno}"
            )

        # CTL-BIZ  Controller 含业务逻辑
        for pat in BIZ_LOGIC_PATTERNS:
            hit = pat.search(body_text)
            if hit:
                print_error(
                    f"CTL-BIZ Controller 方法 [{method_name}] 含业务逻辑"
                    f"（{hit.group(0)[:40]}），应下沉到 Service 层："
                    f"{rel}:{start_lineno}"
                )
                break


def main():
    if len(sys.argv) < 2:
        print("用法：python3 check-controller-body.py <java-file-or-dir>")
        sys.exit(1)

    print("============================================")
    print("  java-controller / check-controller-body.py")
    print(f"  方法体有效行数限制：{METHOD_BODY_LIMIT} 行")
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
        print(f"{YELLOW}🟡 检查完成：0 个阻断错误，{warnings} 个警告{NC}")
    else:
        print_ok("全部通过，Controller 方法体规范")


if __name__ == '__main__':
    main()
