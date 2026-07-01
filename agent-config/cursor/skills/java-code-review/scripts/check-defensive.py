#!/usr/bin/env python3
"""
java-code-review/scripts/check-defensive.py
覆盖防御性编程规范：
  - DF-01  深层 if-else 嵌套（超过 3 层 → 缺卫语句）
  - DF-02  方法内嵌套层数超过 4 层（代码复杂度过高）
  - DF-03  卫语句缺失：入参为 null 未提前 return/throw（入参是集合类型但无 isEmpty 检查）
  - DF-04  大段 else（else 块超过 20 行，主流程被推进 else 中）
用法：python3 check-defensive.py <java-file-or-dir>
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

# 警告阈值
NEST_WARN  = 3   # if/for/while 嵌套超过此值发出警告
NEST_BLOCK = 4   # 超过此值为阻断
ELSE_WARN  = 15  # else 块超过此行数发出警告


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


def calculate_nesting(lines, start, end):
    """
    计算从 start 到 end 行之间的最大嵌套深度。
    统计 if/for/while/switch/try 关键字进入的深度。
    """
    depth = 0
    max_depth = 0
    for i in range(start, min(end, len(lines))):
        line = lines[i].strip()
        if line.startswith('//') or line.startswith('*'):
            continue
        # 每遇到控制流关键字（后面接 {）算增加一层
        if re.match(r'^(if|else\s+if|for|while|switch|try)\s*[\({]', line):
            depth += 1
            max_depth = max(max_depth, depth)
        # else { 也算增加
        if re.match(r'^else\s*\{', line):
            depth += 1
            max_depth = max(max_depth, depth)
        # 右括号减少深度
        close_count = line.count('}')
        open_count  = line.count('{')
        if close_count > open_count:
            depth -= (close_count - open_count)
            depth = max(0, depth)
    return max_depth


def find_else_blocks(lines, start, end):
    """
    找到方法体内所有 else / else if 块，返回 [(start_lineno, block_size)]
    """
    results = []
    i = start
    while i < min(end, len(lines)):
        line = lines[i].strip()
        if re.match(r'^else\s*\{', line) and not re.match(r'^else\s+if', line):
            # 找到 else { 块，计算大小
            depth = 1
            j = i + 1
            while j < len(lines) and depth > 0:
                depth += lines[j].count('{') - lines[j].count('}')
                j += 1
            block_size = j - i
            results.append((i + 1, block_size))
        i += 1
    return results


def iter_methods(lines):
    """yield (method_name, start_idx, end_idx)"""
    method_pattern = re.compile(
        r'^\s*(public|private|protected)\s+'
        r'(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?'
        r'(?:<[^>]+>\s+)?[\w<>\[\],\s]+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{'
    )
    n = len(lines)
    i = 0
    while i < n:
        m = method_pattern.match(lines[i])
        if m:
            method_name = m.group(2)
            start = i
            depth = lines[i].count('{') - lines[i].count('}')
            j = i + 1
            while j < n and depth > 0:
                depth += lines[j].count('{') - lines[j].count('}')
                j += 1
            yield method_name, start, j
            i = j
        else:
            i += 1


def check_df03(lines, method_name, start, end, rel):
    """
    DF-03  卫语句缺失检测：
    方法入参中有 List/Collection 类型但方法体内没有 isEmpty/empty/null 检查
    """
    # 拼接方法签名（可能跨行），取首个 `(...)` 内的参数文本，避免把返回类型 / 泛型上限误判为入参
    sig_buf = []
    for k in range(start, min(end, len(lines))):
        sig_buf.append(lines[k])
        if '{' in lines[k]:
            break
    sig_text = ''.join(sig_buf)
    paren_match = re.search(r'\(([^()]*(?:\([^()]*\)[^()]*)*)\)', sig_text)
    params_text = paren_match.group(1) if paren_match else ''
    if not params_text.strip():
        return

    has_collection_param = bool(re.search(
        r'\b(List|Collection|Set|Map|Iterable)\s*<',
        params_text
    ))
    if not has_collection_param:
        return

    # 标准 setter（XxxProperties / @ConfigurationProperties / @Data 自动生成）由框架直接装配，
    # 加防御反而违反 JavaBean 约定，跳过。
    if re.match(r'^set[A-Z]', method_name):
        return

    body = ''.join(lines[start:end])
    has_empty_check = bool(re.search(
        r'(isEmpty\s*\(\s*\)|CollectionUtils\.isEmpty|CollUtil\.isEmpty'
        r'|== null|!= null|\bif\s*\([^)]*null)',
        body
    ))
    if not has_empty_check:
        print_warning(
            f"DF-03 方法 [{method_name}] 有集合入参但缺少 isEmpty/null 卫语句检查，"
            f"可能导致 NullPointerException 或空处理异常：{rel}:{start + 1}"
        )


def check_file(path):
    if not path.endswith('.java'):
        return
    # 跳过测试文件（测试中的复杂嵌套是允许的）
    if 'test' in path.lower() or 'Test.java' in path:
        return
    rel = os.path.relpath(path)

    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
    except Exception as e:
        print_warning(f"无法读取 {rel}: {e}")
        return

    for method_name, start, end in iter_methods(lines):
        method_line_count = end - start

        # DF-01 / DF-02  嵌套深度检查
        max_depth = calculate_nesting(lines, start, end)
        if max_depth > NEST_BLOCK:
            print_error(
                f"DF-02 方法 [{method_name}] 嵌套深度 {max_depth} 层（超过阻断阈值 {NEST_BLOCK} 层），"
                f"必须用卫语句/提取方法重构：{rel}:{start + 1}"
            )
        elif max_depth > NEST_WARN:
            print_warning(
                f"DF-01 方法 [{method_name}] 嵌套深度 {max_depth} 层（超过警告阈值 {NEST_WARN} 层），"
                f"建议提前 return/throw 减少嵌套：{rel}:{start + 1}"
            )

        # DF-04  大段 else 块
        else_blocks = find_else_blocks(lines, start, end)
        for else_lineno, block_size in else_blocks:
            if block_size > ELSE_WARN:
                print_warning(
                    f"DF-04 方法 [{method_name}] 中 else 块超过 {block_size} 行（第 {else_lineno} 行），"
                    f"主流程可能被推进 else，建议改用卫语句提前处理异常分支：{rel}:{else_lineno}"
                )

        # DF-03  集合入参缺卫语句
        check_df03(lines, method_name, start, end, rel)


def main():
    if len(sys.argv) < 2:
        print("用法：python3 check-defensive.py <java-file-or-dir>")
        sys.exit(1)

    print("============================================")
    print("  java-code-review / check-defensive.py")
    print(f"  嵌套警告阈值：{NEST_WARN} 层，阻断阈值：{NEST_BLOCK} 层")
    print(f"  else 块警告阈值：{ELSE_WARN} 行")
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
        print_ok("全部通过，防御性编程规范检查无问题")


if __name__ == '__main__':
    main()
