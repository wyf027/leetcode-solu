#!/usr/bin/env python3
# java-code-review/scripts/check-code-reuse.py
# 覆盖：RU-01~RU-07（common 模块复用检查 / 禁止重复造轮子）
#
# RU-01  DateTimeFormatter.ofPattern("yyyy...") 字面量 → 应使用 BasicConstants.DATE_PATTERN_*
# RU-02  @JsonFormat(pattern = "yyyy...") 字面量  → 应使用 BasicConstants.DATE_PATTERN_*
# RU-03  is_deleted 字段裸整数 (0/1) 赋值/比较    → 应使用 YesNo.YES/NO.code()
# RU-04  自定义 Result 响应体类                   → 应使用 common-base Result<T>
# RU-05  自定义分页响应类 (PageVO/PageData 等)     → 应使用 common-base Paged<T>
# RU-06  Service 接口未继承 IBaseService<T>       → 缺少 exists/map/group 等扩展方法
# RU-07  SimpleDateFormat 使用                   → 应使用线程安全的 DateTimeFormatter
#
# 用法：
#   python3 check-code-reuse.py <模块根路径>
#   python3 check-code-reuse.py --files file1.java file2.java ...

import sys
import os
import re

RED    = "\033[0;31m"
YELLOW = "\033[1;33m"
GREEN  = "\033[0;32m"
NC     = "\033[0m"

errors   = 0
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


# ──────────────────────────────────────────────
# BasicConstants 中的日期格式常量映射（字面量 → 常量名）
# ──────────────────────────────────────────────
DATE_CONST_MAP = {
    "yyyy":                          "DATE_PATTERN_YEAR",
    "yyyy-MM":                       "DATE_PATTERN_YEAR_MONTH",
    "yyyyMM":                        "DATE_PATTERN_YEAR_MONTH_COMPACT",
    "yyyy-MM-dd":                    "DATE_PATTERN_DATE",
    "yyyy/MM/dd":                    "DATE_PATTERN_DATE_SLASH",
    "yyyyMMdd":                      "DATE_PATTERN_DATE_COMPACT",
    "HH:mm":                         "DATE_PATTERN_TIME_MINUTE",
    "HH:mm:ss":                      "DATE_PATTERN_TIME",
    "HH:mm:ss[.SSSSSSSSS][.SSSSSS][.SSS][.SS][.S]": "DATE_PATTERN_TIME_FLEXIBLE",
    "yyyy-MM-dd HH:mm:ss":           "DATE_PATTERN_DATE_TIME",
    "yyyy/MM/dd HH:mm:ss":           "DATE_PATTERN_DATE_TIME_SLASH",
    "yyyy-MM-dd'T'HH:mm:ss":         "DATE_PATTERN_DATE_TIME_ISO",
    "yyyyMMddHHmmss":                "DATE_PATTERN_DATE_TIME_COMPACT",
    "yyyy-MM-dd HH:mm:ss.SSS":       "DATE_PATTERN_DATE_TIME_MILLIS",
    "yyyyMMddHHmmssSSS":             "DATE_PATTERN_DATE_TIME_MILLIS_COMPACT",
}

# 匹配字符串字面量中的日期格式（宽泛：含 yyyy 或 HH:mm）
DATE_LITERAL_RE = re.compile(r'"([^"]*(?:yyyy|HH:mm)[^"]*)"')

# is_deleted 裸整数：setIsDeleted(0/1)、eq(::getIsDeleted, 0/1)、set(::getIsDeleted, 0/1)
IS_DELETED_RAW_RE = re.compile(
    r'(?:setIsDeleted\s*\(\s*([01])\s*\)'
    r'|(?:eq|set|ne)\s*\(\s*\w+Entity::getIsDeleted\s*,\s*([01])\s*\)'
    r'|getIsDeleted\(\)\s*(?:==|!=)\s*([01])\b)'
)

# 自定义 Result 响应体：类名含 ApiResult/AjaxResult/R<T>/BaseResponse/ResponseVO/CommonResult
CUSTOM_RESULT_RE = re.compile(
    r'(?:^|\s)class\s+\w*(?:ApiResult|AjaxResult|BaseResponse|CommonResult|ResponseVO|ResponseBody)\b'
    r'|(?:^|\s)class\s+R\s*<'           # R<T> 泛型响应
)

# 自定义分页响应：类名含 PageVO/PageData/PageResult/PageResponse/PageWrapper
CUSTOM_PAGE_RE = re.compile(
    r'(?:^|\s)class\s+\w*(?:PageVO|PageData|PageResult|PageResponse|PageWrapper)\b'
)

# Service 接口：extends IService<T>（MyBatis-Plus 原生接口，应升级为 IBaseService<T>）
EXTENDS_ISERVICE_RE = re.compile(r'extends\s+(?:(?:\w+,\s*)*)IService\s*<')
EXTENDS_IBASESERVICE_RE = re.compile(r'extends\s+.*IBaseService\s*<')
SERVICE_INTERFACE_NAME_RE = re.compile(r'public\s+interface\s+(\w+)')

# SimpleDateFormat
SDF_RE = re.compile(r'SimpleDateFormat')


def collect_java_files(root: str):
    """递归收集所有非 test/target 目录下的 .java 文件"""
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ("target", ".git")]
        for fname in filenames:
            if fname.endswith(".java"):
                files.append(os.path.join(dirpath, fname))
    return files


def is_test_file(path: str) -> bool:
    return "test" in path.lower() or path.endswith("Test.java")


def check_file(path: str):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            content = fh.read()
            lines   = content.splitlines()
    except Exception:
        return

    fname = os.path.basename(path)

    # ── RU-07  SimpleDateFormat ──────────────────────────────────────────
    for i, line in enumerate(lines, 1):
        if SDF_RE.search(line):
            print_error(
                f"RU-07 禁止 SimpleDateFormat（非线程安全），改用 DateTimeFormatter 或"
                f" BasicConstants.DATE_PATTERN_* 配合 DateTimeFormatter.ofPattern()：{path}:{i}"
            )

    # ── RU-01  DateTimeFormatter.ofPattern("yyyy...") 字面量 ─────────────
    for i, line in enumerate(lines, 1):
        if "DateTimeFormatter" not in line and "ofPattern" not in line:
            continue
        for m in DATE_LITERAL_RE.finditer(line):
            literal = m.group(1)
            const   = DATE_CONST_MAP.get(literal)
            if const:
                print_warning(
                    f"RU-01 日期格式字符串字面量应使用 BasicConstants.{const}（当前：\"{literal}\"）："
                    f"{path}:{i}"
                )
            elif re.search(r'yyyy|HH:mm', literal):
                print_warning(
                    f"RU-01 日期格式字符串字面量应提取为 BasicConstants 常量（当前：\"{literal}\"）："
                    f"{path}:{i}"
                )

    # ── RU-02  @JsonFormat(pattern = "yyyy...") 字面量 ───────────────────
    for i, line in enumerate(lines, 1):
        if "@JsonFormat" not in line:
            continue
        for m in DATE_LITERAL_RE.finditer(line):
            literal = m.group(1)
            const   = DATE_CONST_MAP.get(literal)
            if const:
                print_warning(
                    f"RU-02 @JsonFormat pattern 应使用 BasicConstants.{const}"
                    f"（compile-time constant，可直接引用，当前字面量：\"{literal}\"）："
                    f"{path}:{i}"
                )
            elif re.search(r'yyyy|HH:mm', literal):
                print_warning(
                    f"RU-02 @JsonFormat pattern 字面量应提取为 BasicConstants 常量（当前：\"{literal}\"）："
                    f"{path}:{i}"
                )

    # ── RU-03  is_deleted 裸整数 ─────────────────────────────────────────
    # 排除注释行
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith("//") or stripped.startswith("*"):
            continue
        if IS_DELETED_RAW_RE.search(line):
            print_warning(
                f"RU-03 is_deleted 赋值/比较应使用 YesNo.YES/NO.code() 替代裸整数 0/1，语义更清晰："
                f"{path}:{i}: {stripped[:90]}"
            )

    # ── RU-04  自定义 Result 响应体 ──────────────────────────────────────
    # 只检查非 test、非 common 包的类定义
    if not is_test_file(path) and "common" not in path:
        for i, line in enumerate(lines, 1):
            if CUSTOM_RESULT_RE.search(line):
                print_error(
                    f"RU-04 禁止自定义 Result 响应体类，统一使用 common-base 的 Result<T>："
                    f"{path}:{i}: {line.strip()[:90]}"
                )

    # ── RU-05  自定义分页响应类 ──────────────────────────────────────────
    if not is_test_file(path) and "common" not in path:
        for i, line in enumerate(lines, 1):
            if CUSTOM_PAGE_RE.search(line):
                print_warning(
                    f"RU-05 自定义分页响应类，建议使用 common-base 的 Paged<T>（含 records/total/current/size/pages 字段）："
                    f"{path}:{i}: {line.strip()[:90]}"
                )

    # ── RU-06  Service 接口直接 extends IService<T> 而非 IBaseService<T> ──
    # 只检查 XxxService.java（接口文件，非 Impl，非 test）
    # 规则：extends IService<T> → 应升级为 extends IBaseService<T>（提供 exists/map/group 扩展）
    # 排除 IBaseService.java 自身（它就是 IService 的扩展者，不能继承自己）
    if fname.endswith("Service.java") and "Impl" not in fname and fname != "IBaseService.java" and not is_test_file(path):
        if EXTENDS_ISERVICE_RE.search(content) and not EXTENDS_IBASESERVICE_RE.search(content):
            m = SERVICE_INTERFACE_NAME_RE.search(content)
            name = m.group(1) if m else fname
            print_warning(
                f"RU-06 Service 接口 {name} 直接 extends IService<T>，应升级为"
                f" extends IBaseService<T>（IBaseService 继承 IService 并扩展了"
                f" exists()/map()/group() 等高频方法）：{path}"
            )


def main():
    print("============================================")
    print("  java-code-review / check-code-reuse.py")
    print("  检查 common 模块复用规范（RU-01~RU-07）")
    print("============================================")

    args = sys.argv[1:]
    if not args:
        print("用法：python3 check-code-reuse.py <模块根路径>")
        print("      python3 check-code-reuse.py --files file1.java ...")
        sys.exit(1)

    if args[0] == "--files":
        files = [f for f in args[1:] if f.endswith(".java")]
    else:
        root = os.path.expanduser(args[0])
        if not os.path.exists(root):
            print(f"路径不存在：{root}")
            sys.exit(1)
        files = collect_java_files(root)
        print(f"  扫描范围: {root}（{len(files)} 个 .java 文件）")

    if not files:
        print_ok("无 .java 文件，跳过检查")
        sys.exit(0)

    print()

    # RU-01~RU-07 逐文件检查
    print("【RU-01】DateTimeFormatter.ofPattern() 字面量格式串...")
    print("【RU-02】@JsonFormat(pattern=) 字面量格式串...")
    print("【RU-03】is_deleted 裸整数 0/1 赋值/比较...")
    print("【RU-04】自定义 Result 响应体类...")
    print("【RU-05】自定义分页响应类...")
    print("【RU-06】Service 接口未继承 IBaseService<T>...")
    print("【RU-07】SimpleDateFormat 使用...")
    print()

    for f in sorted(files):
        check_file(f)

    print()
    print("============================================")
    if errors > 0:
        print(f"{RED}❌ 检查完成：{errors} 个阻断错误，{warnings} 个警告{NC}")
        sys.exit(1)
    elif warnings > 0:
        print(f"{YELLOW}🟡 检查完成：0 个阻断错误，{warnings} 个警告{NC}")
        sys.exit(0)
    else:
        print(f"{GREEN}✅ 全部通过，common 模块复用规范{NC}")
        sys.exit(0)


if __name__ == "__main__":
    main()
