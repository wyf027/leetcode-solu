#!/usr/bin/env python3
"""
java-enum/scripts/check-code-conflict.py
覆盖：EN-03（同模块枚举 code 值重复）、EN-04（跨模块错误码 code 范围冲突）
用法：python3 check-code-conflict.py <java-dir>
"""

import sys
import os
import re
from collections import defaultdict

RED = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN = '\033[0;32m'
NC = '\033[0m'

errors = 0
warnings = 0

# 各模块错误码 code 范围（按照 java-enum SKILL 中的规划调整）
MODULE_CODE_RANGES = {
    'system':      (1000, 1999),
    'platform':    (2000, 2999),
    'integration': (3000, 3999),
    'hire':        (4000, 4999),
    'assess':      (5000, 5999),
    'commons':     (9000, 9999),
}


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


def extract_enum_codes(path):
    """从 Java 枚举文件中提取 code 值，返回 [(code, enum_constant_name, line_no)]"""
    results = []
    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
    except Exception:
        return results

    # 找到枚举常量行（格式：CONSTANT_NAME(code, "desc")）
    enum_item_pattern = re.compile(r'^\s*([A-Z_]+)\s*\(\s*(-?\d+)\s*[,)]')
    for i, line in enumerate(lines):
        m = enum_item_pattern.match(line)
        if m:
            const_name = m.group(1)
            code = int(m.group(2))
            results.append((code, const_name, i + 1))
    return results


def detect_module_from_path(path):
    """从文件路径推断所属微服务模块"""
    parts = path.replace('\\', '/').split('/')
    for module_name in MODULE_CODE_RANGES:
        if module_name in parts:
            return module_name
    return 'unknown'


def main():
    if len(sys.argv) < 2:
        print("用法：python3 check-code-conflict.py <java-dir>")
        sys.exit(1)

    print("============================================")
    print("  java-enum / check-code-conflict.py")
    print("  检查：EN-03（枚举 code 重复）、EN-04（跨模块范围冲突）")
    print("============================================")

    # 收集所有枚举文件的 code
    module_codes = defaultdict(list)   # module -> [(code, const_name, file, line)]
    global_codes = defaultdict(list)   # code -> [(file, const_name, line)]

    for target in sys.argv[1:]:
        if not os.path.isdir(target):
            print_warning(f"路径不存在或不是目录：{target}")
            continue

        for root, dirs, files in os.walk(target):
            dirs[:] = [d for d in dirs if d not in ['target', '.git', 'node_modules']]
            for fname in files:
                if not fname.endswith('.java'):
                    continue
                filepath = os.path.join(root, fname)
                # 只处理 Enum / ErrorCode 文件
                if not (re.search(r'(Enum|ErrorCode)\.java$', fname)):
                    continue

                module = detect_module_from_path(filepath)
                rel = os.path.relpath(filepath)
                codes = extract_enum_codes(filepath)

                for code, const_name, line_no in codes:
                    module_codes[module].append((code, const_name, rel, line_no))
                    global_codes[code].append((rel, const_name, line_no))

    # EN-03  同模块 code 重复检查
    print("\n【EN-03】检查同模块枚举 code 值重复...")
    for module, entries in module_codes.items():
        code_counter = defaultdict(list)
        for code, const_name, filepath, line_no in entries:
            code_counter[code].append((const_name, filepath, line_no))
        for code, occurrences in code_counter.items():
            if len(occurrences) > 1:
                details = ', '.join(f"{c} ({f}:{l})" for c, f, l in occurrences)
                print_error(f"EN-03 模块 [{module}] 枚举 code={code} 重复定义：{details}")

    if errors == 0:
        print_ok("EN-03 通过，无重复 code")

    # EN-04  跨模块错误码范围冲突检查
    print("\n【EN-04】检查跨模块错误码范围冲突...")
    for code, occurrences in global_codes.items():
        if len(occurrences) <= 1:
            continue
        # 找出每个文件对应的模块
        modules_for_code = []
        for filepath, const_name, line_no in occurrences:
            module = detect_module_from_path(filepath)
            modules_for_code.append(module)
        # 检查是否来自不同模块（跨模块重复）
        unique_modules = set(modules_for_code)
        if len(unique_modules) > 1:
            details = ', '.join(
                f"{c} in [{detect_module_from_path(f)}] ({f}:{l})"
                for f, c, l in occurrences
            )
            print_error(f"EN-04 跨模块错误码 code={code} 冲突：{details}")

    # 检查 code 是否落在声明的模块范围内
    for module, entries in module_codes.items():
        if module not in MODULE_CODE_RANGES:
            continue
        min_code, max_code = MODULE_CODE_RANGES[module]
        for code, const_name, filepath, line_no in entries:
            if code < 0:  # 跳过系统占位码
                continue
            if not (min_code <= code <= max_code):
                print_warning(
                    f"EN-04 模块 [{module}] 的错误码 {const_name}={code} 超出规划范围 "
                    f"[{min_code}~{max_code}]：{filepath}:{line_no}"
                )

    print()
    print("============================================")
    if errors > 0:
        print(f"{RED}❌ 检查完成：{errors} 个阻断错误，{warnings} 个警告{NC}")
        sys.exit(1)
    elif warnings > 0:
        print(f"{YELLOW}🟡 检查完成：0 个阻断错误，{warnings} 个警告{NC}")
    else:
        print_ok("全部通过，枚举 code 无冲突")


if __name__ == '__main__':
    main()
