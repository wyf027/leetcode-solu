#!/usr/bin/env python3
"""
java-testing/scripts/check-test-coverage.py
覆盖：TS-01（@Service 类缺 *Test.java）、TS-04（写操作缺 verify 校验）、TS-06（覆盖率粗估）、TS-08（@BeforeEach 共享可变状态）
用法：python3 check-test-coverage.py <java-project-dir>
"""

import sys
import os
import re
from pathlib import Path

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


def collect_java_files(root_dir):
    """返回 (main_files, test_files)"""
    main_files = []
    test_files = []
    for path in Path(root_dir).rglob('*.java'):
        parts = path.parts
        if 'target' in parts or '.git' in parts:
            continue
        if 'test' in parts or 'Test' in str(path.name):
            test_files.append(path)
        else:
            main_files.append(path)
    return main_files, test_files


def check_ts01(main_files, test_files):
    """TS-01  @Service 类缺少对应 *Test.java"""
    print("\n【TS-01】检查 @Service 类是否有对应测试文件...")

    service_classes = []
    for path in main_files:
        try:
            content = path.read_text(encoding='utf-8', errors='replace')
            if '@Service' in content or '@Component' in content:
                if 'ServiceImpl' in path.name or 'Service' in path.name:
                    service_classes.append(path)
        except Exception:
            continue

    test_names = {p.name.replace('Test.java', '') for p in test_files}
    missing_tests = []
    for svc in service_classes:
        class_name = svc.name.replace('.java', '')
        if class_name not in test_names:
            missing_tests.append(svc)

    if missing_tests:
        for path in missing_tests:
            print_warning(f"TS-01 Service 类缺少对应测试文件：{os.path.relpath(path)}")
    else:
        print_ok("TS-01 通过，所有 Service 类均有测试文件")

    return len(service_classes), len(service_classes) - len(missing_tests)


def check_ts04(test_files):
    """TS-04  写操作测试缺少 verify 校验"""
    print("\n【TS-04】检查写操作测试缺少 verify 持久化/MQ 校验...")

    write_op_pattern = re.compile(
        r'(save|update|delete|remove|create|add|insert|send|publish)\w*\s*\(',
        re.IGNORECASE
    )
    verify_pattern = re.compile(r'verify\s*\(|\.verify\(|then\(.*\)\.should\(')

    for path in test_files:
        try:
            content = path.read_text(encoding='utf-8', errors='replace')
        except Exception:
            continue

        # 找到 @Test 方法并检查是否有写操作但无 verify
        method_blocks = re.split(r'@Test\s*', content)[1:]
        for block in method_blocks:
            # 提取方法体（到下一个 @Test 之前）
            method_match = re.match(r'[^{]*\{(.*?)(?=\n\s*@|\Z)', block, re.DOTALL)
            if not method_match:
                continue
            method_body = method_match.group(1)

            if write_op_pattern.search(method_body):
                if not verify_pattern.search(method_body):
                    # 找方法名
                    method_name_m = re.match(r'\s*(?:public\s+)?void\s+(\w+)', block)
                    method_name = method_name_m.group(1) if method_name_m else 'unknown'
                    print_warning(
                        f"TS-04 写操作测试缺少 verify 校验（验证持久化/MQ 发送）："
                        f"{os.path.relpath(path)} [{method_name}]"
                    )


def check_ts06(service_total, service_covered):
    """TS-06  覆盖率粗估"""
    print("\n【TS-06】测试覆盖率粗估（按 Service 文件）...")
    if service_total == 0:
        print_ok("TS-06 无 Service 文件")
        return

    coverage = (service_covered / service_total) * 100
    print(f"  Service 类总计：{service_total} 个")
    print(f"  有测试文件：{service_covered} 个")
    print(f"  粗估覆盖率：{coverage:.1f}%")

    if coverage < 50:
        print_warning(f"TS-06 Service 层测试覆盖率低于 50%（当前 {coverage:.1f}%），建议补充测试")
    elif coverage < 80:
        print_warning(f"TS-06 Service 层测试覆盖率低于 80%（当前 {coverage:.1f}%），建议继续完善")
    else:
        print_ok(f"TS-06 覆盖率良好（{coverage:.1f}%）")


def check_ts08(test_files):
    """TS-08  @BeforeEach 共享可变状态（测试间互相污染）"""
    print("\n【TS-08】检查 @BeforeEach 共享可变状态...")

    for path in test_files:
        try:
            content = path.read_text(encoding='utf-8', errors='replace')
        except Exception:
            continue

        if '@BeforeEach' not in content:
            continue

        # 检查是否在 @BeforeEach 中修改了 class-level 字段（非 mock 类字段）
        # 简化检测：@BeforeEach 方法内有字段赋值（this.xxx = 或 xxx =）
        before_each_m = re.search(
            r'@BeforeEach\s+(?:public\s+)?void\s+\w+\s*\(\s*\)\s*\{([^}]*)\}',
            content, re.DOTALL
        )
        if before_each_m:
            before_body = before_each_m.group(1)
            # 检测是否有列表/map 等可变集合的初始化
            if re.search(r'new\s+(ArrayList|HashMap|HashSet|LinkedList|ArrayDeque)\s*\(', before_body):
                print_warning(
                    f"TS-08 @BeforeEach 中创建可变集合，可能导致测试间状态污染，"
                    f"建议在每个测试方法内独立初始化：{os.path.relpath(path)}"
                )


def main():
    if len(sys.argv) < 2:
        print("用法：python3 check-test-coverage.py <java-project-dir>")
        sys.exit(1)

    print("============================================")
    print("  java-testing / check-test-coverage.py")
    print("  检查：TS-01、TS-04、TS-06、TS-08")
    print("============================================")

    all_main = []
    all_test = []
    for target in sys.argv[1:]:
        if os.path.isdir(target):
            m, t = collect_java_files(target)
            all_main.extend(m)
            all_test.extend(t)
        else:
            print_warning(f"路径不存在或不是目录：{target}")

    service_total, service_covered = check_ts01(all_main, all_test)
    check_ts04(all_test)
    check_ts06(service_total, service_covered)
    check_ts08(all_test)

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
