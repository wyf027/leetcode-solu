#!/usr/bin/env python3
"""
java-redis/scripts/check-cache-const.py
覆盖：RD-06（Redis Key 三段命名规范）、RD-08（CacheConst 常量缺 Javadoc）
用法：python3 check-cache-const.py <java-file-or-dir>
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

# Key 三段命名正则：{服务域}:{实体}:{标识} 或含 %s 占位符
KEY_PATTERN = re.compile(r'^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*:[a-z0-9_%s-]+$')


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


def check_file(path):
    if not path.endswith('.java'):
        return
    rel = os.path.relpath(path)

    # 只处理 CacheConst 文件
    basename = os.path.basename(path)
    is_cache_const = 'CacheConst' in basename or 'CacheKey' in basename

    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
    except Exception as e:
        print_warning(f"无法读取 {rel}: {e}")
        return

    for i, line in enumerate(lines):
        # 提取字符串常量（Key 值）
        m = re.search(r'String\s+(\w+)\s*=\s*"([^"]+)"', line)
        if not m:
            continue

        const_name = m.group(1)
        key_value = m.group(2)

        # RD-06  Key 三段命名规范
        # Key 值应包含至少两个冒号（三段式）
        colon_count = key_value.count(':')
        if colon_count < 2:
            print_error(
                f"RD-06 Redis Key 不符合三段命名规范 {{服务域}}:{{实体}}:{{标识}}，"
                f"当前值 \"{key_value}\"：{rel}:{i + 1} [{const_name}]"
            )
        else:
            # 进一步验证格式
            if not KEY_PATTERN.match(key_value):
                print_warning(
                    f"RD-06 Redis Key 格式疑似不规范（期望全小写 + 冒号分隔）："
                    f"\"{key_value}\"：{rel}:{i + 1} [{const_name}]"
                )

        # RD-08  CacheConst 常量缺 Javadoc（含 TTL/Key 格式说明）
        if is_cache_const:
            # 检查前 3 行是否有注释
            pre_lines = ''.join(lines[max(0, i-3):i])
            has_comment = '//' in pre_lines or '/**' in pre_lines or '*' in pre_lines
            if not has_comment:
                print_warning(
                    f"RD-08 CacheConst 常量 [{const_name}] 缺少注释（应说明 TTL 和 Key 格式）："
                    f"{rel}:{i + 1}"
                )


def main():
    if len(sys.argv) < 2:
        print("用法：python3 check-cache-const.py <java-file-or-dir>")
        sys.exit(1)

    print("============================================")
    print("  java-redis / check-cache-const.py")
    print("  检查：RD-06（Key 三段命名）、RD-08（CacheConst 注释）")
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
        print_ok("全部通过，Redis Key 命名规范")


if __name__ == '__main__':
    main()
