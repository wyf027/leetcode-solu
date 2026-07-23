#!/usr/bin/env python3
"""
java-service/scripts/check-service-advanced.py
覆盖：SV-09（相同查询条件内联重复出现）、SV-12（Convert 中含业务逻辑/数据库查询）
用法：python3 check-service-advanced.py <java-file-or-dir>
"""

import sys
import os
import re
from collections import Counter

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


def check_sv09(lines, rel):
    """
    SV-09  相同查询条件内联重复出现（未抽为 private 方法）
    策略：找到同一文件中多次出现相同的 lambdaQuery 链条片段
    """
    # 提取所有 lambdaQuery 链条（简化为取 .eq/.in/.like 等关键条件）
    query_fragments = []
    for i, line in enumerate(lines):
        m = re.search(r'lambdaQuery\(\)[^;]+\.(?:eq|ne|like|in|ge|le|gt|lt)\s*\([^)]+\)', line)
        if m:
            # 规范化：去除空格
            fragment = re.sub(r'\s+', ' ', m.group(0).strip())
            query_fragments.append((i + 1, fragment))

    counter = Counter(frag for _, frag in query_fragments)
    for frag, count in counter.items():
        if count >= 2:
            occurrences = [lineno for lineno, f in query_fragments if f == frag]
            print_warning(
                f"SV-09 相同查询条件出现 {count} 次，建议抽取为 private 方法复用："
                f"{rel}（行 {occurrences}）"
            )


def check_sv12(lines, rel):
    """
    SV-12  Convert 中含业务逻辑/数据库查询
    """
    is_convert = 'Convert' in os.path.basename(rel) or \
                 any(re.search(r'interface\s+\w+Convert', line) for line in lines)
    if not is_convert:
        return

    content = ''.join(lines)

    # 检查是否含 Mapper 调用
    if re.search(r'\.\w+Mapper\.\w+\(', content):
        print_error(
            f"SV-12 Convert 接口中不允许调用 Mapper（数据库查询），应在 Service 层完成后传入参数：{rel}"
        )

    # 检查是否含 Service 调用
    if re.search(r'\.\w+Service\.\w+\(', content):
        print_error(
            f"SV-12 Convert 接口中不允许调用 Service（业务逻辑），Convert 只做字段映射：{rel}"
        )

    # 检查是否含 if/for 业务逻辑
    if_for_count = sum(1 for line in lines if re.search(r'^\s+(if|for|while|switch)\s*\(', line))
    if if_for_count > 3:
        print_warning(
            f"SV-12 Convert 中含较多业务判断逻辑（{if_for_count} 处），建议移到 Service 层：{rel}"
        )


def check_file(path):
    if not path.endswith('.java'):
        return
    rel = os.path.relpath(path)

    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
    except Exception as e:
        print_warning(f"无法读取 {rel}: {e}")
        return

    # SV-09 只对 ServiceImpl 文件检查
    if 'ServiceImpl' in os.path.basename(path):
        check_sv09(lines, rel)

    # SV-12 对 Convert 文件检查
    check_sv12(lines, rel)


def main():
    if len(sys.argv) < 2:
        print("用法：python3 check-service-advanced.py <java-file-or-dir>")
        sys.exit(1)

    print("============================================")
    print("  java-service / check-service-advanced.py")
    print("  检查：SV-09、SV-12")
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
        print_ok("全部通过")


if __name__ == '__main__':
    main()
