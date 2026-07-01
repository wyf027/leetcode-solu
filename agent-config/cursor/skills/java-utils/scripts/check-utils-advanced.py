#!/usr/bin/env python3
# java-utils/scripts/check-utils-advanced.py
# 覆盖：
#   UT-03  工具类含公开构造方法检查（应私有构造，防止被实例化）
#
# 用法：
#   python3 check-utils-advanced.py <扫描路径>
#   python3 check-utils-advanced.py --files file1.java file2.java ...

import sys
import re
import os

RED = "\033[0;31m"
YELLOW = "\033[1;33m"
GREEN = "\033[0;32m"
NC = "\033[0m"

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


def find_utils_files(root: str):
    result = []
    for dirpath, _, filenames in os.walk(root):
        if "target" in dirpath.split(os.sep):
            continue
        for fname in filenames:
            if (fname.endswith("Utils.java") or fname.endswith("Helper.java")) \
                    and "Test" not in fname:
                result.append(os.path.join(dirpath, fname))
    return result


def check_constructor(filepath: str):
    """
    UT-03：工具类应只有 private 无参构造（或无构造器），禁止 public/protected 构造。
    特殊情况：若有 @Component/@Service 等 Spring 注解，允许 public 构造（但工具类
    通常不应有 Spring 注解，这由 check-utils.sh 的 UT-01 覆盖）。
    """
    try:
        content = open(filepath, encoding="utf-8", errors="replace").read()
        lines = content.splitlines()
    except Exception:
        return

    fname = os.path.basename(filepath)
    class_name = fname.replace(".java", "")

    # 提取类名（支持泛型、final 等修饰）
    class_pat = re.compile(
        r'public\s+(?:final\s+)?class\s+(\w+)'
    )
    class_match = class_pat.search(content)
    if not class_match:
        return  # 非 public 类，跳过
    actual_class = class_match.group(1)

    # 构造方法模式（注意：类名 + 括号，排除方法调用）
    # public ClassName( 或 protected ClassName(
    pub_ctor_pat = re.compile(
        r'^\s*(public|protected)\s+' + re.escape(actual_class) + r'\s*\('
    )
    priv_ctor_pat = re.compile(
        r'^\s*private\s+' + re.escape(actual_class) + r'\s*\('
    )

    has_public_ctor = False
    has_private_ctor = False
    public_ctor_lines = []

    for i, line in enumerate(lines, 1):
        if pub_ctor_pat.search(line):
            has_public_ctor = True
            public_ctor_lines.append((i, line.strip()))
        if priv_ctor_pat.search(line):
            has_private_ctor = True

    if has_public_ctor:
        for lineno, line_text in public_ctor_lines:
            print_error(
                f"UT-03 工具类禁止 public/protected 构造方法，应改为 "
                f"private {actual_class}() {{}} 防止被实例化："
                f"{filepath}:{lineno} → {line_text}"
            )
        return

    if not has_private_ctor:
        # 没有显式构造方法，Java 编译器会生成默认 public 无参构造
        # 工具类必须显式声明 private 构造
        print_warning(
            f"UT-03 工具类未显式声明 private 构造方法，"
            f"编译器将生成默认 public 构造（推荐添加：private {actual_class}() {{}} ）："
            f"{filepath}"
        )
        return

    # 有 private 构造，检查是否还有多余的重载 public 构造
    # （已在上面检查，走到这里说明只有 private 构造）
    print_ok(f"UT-03 通过：{fname}")


def main():
    print("============================================")
    print("  java-utils / check-utils-advanced.py")
    print("============================================")

    # 解析参数
    args = sys.argv[1:]
    if not args:
        print("用法：python3 check-utils-advanced.py <路径> [--files file1 ...]")
        sys.exit(1)

    files_to_check = []

    if args[0] == "--files":
        files_to_check = [f for f in args[1:] if f.endswith(".java")]
        # 仅保留 Utils/Helper 文件
        files_to_check = [
            f for f in files_to_check
            if re.search(r'(Utils|Helper)\.java$', os.path.basename(f))
            and "Test" not in os.path.basename(f)
        ]
    else:
        root = args[0]
        if not os.path.exists(root):
            print(f"路径不存在：{root}")
            sys.exit(1)
        files_to_check = find_utils_files(root)

    if not files_to_check:
        print_ok("无工具类文件，跳过检查")
        sys.exit(0)

    print(f"\n找到 {len(files_to_check)} 个工具类文件\n")
    print("【UT-03】检查工具类构造方法访问级别...")
    print()

    for f in sorted(files_to_check):
        check_constructor(f)

    print()
    print("============================================")
    if errors > 0:
        print(f"{RED}❌ 检查完成：{errors} 个阻断错误，{warnings} 个警告{NC}")
        sys.exit(1)
    elif warnings > 0:
        print(f"{YELLOW}🟡 检查完成：0 个阻断错误，{warnings} 个警告{NC}")
        sys.exit(0)
    else:
        print(f"{GREEN}✅ 全部通过，工具类构造方法规范检查无问题{NC}")
        sys.exit(0)


if __name__ == "__main__":
    main()
