#!/usr/bin/env python3
"""
java-mq/scripts/check-mq-advanced.py
覆盖：MQ-03（onPayload try-catch 后静默 return）、MQ-06（onPayload 缺少入参校验）、MQ-09（发送后缺 log.info）
用法：python3 check-mq-advanced.py <java-file-or-dir>
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


def extract_method_body(lines, start_idx):
    """从 start_idx 行开始提取方法体（直到匹配的 }），返回方法体行列表"""
    depth = 0
    body = []
    for i in range(start_idx, len(lines)):
        line = lines[i]
        depth += line.count('{') - line.count('}')
        body.append((i + 1, line))
        if i > start_idx and depth <= 0:
            break
    return body


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

    # 只处理 Listener 文件
    is_listener = any('extends BaseListener' in line or 'implements RocketMQListener' in line
                      for line in lines)
    if not is_listener and 'Listener' not in os.path.basename(path):
        # 对非 Listener 文件，只检查 MQ-09（发送后缺日志）
        check_mq09(lines, rel)
        return

    content = ''.join(lines)

    # MQ-03  onPayload try-catch 后静默 return（吞异常）
    on_payload_idx = None
    for i, line in enumerate(lines):
        if re.search(r'(void|onPayload)\s+onPayload\s*\(', line) or \
           (re.search(r'protected\s+void\s+\w+\s*\(', line) and i > 0):
            on_payload_idx = i
            break

    if on_payload_idx is not None:
        body = extract_method_body(lines, on_payload_idx)
        body_text = '\n'.join(line for _, line in body)

        # 检测是否有 try-catch + return 组合
        has_try_catch = 'try {' in body_text or 'try{' in body_text
        if has_try_catch:
            # 检测 catch 块中是否有 return 但没有 throw/log.error
            catch_pattern = re.search(
                r'catch\s*\([^)]+\)\s*\{([^}]*)\}',
                body_text,
                re.DOTALL
            )
            if catch_pattern:
                catch_body = catch_pattern.group(1)
                if re.search(r'\breturn\b', catch_body) and \
                   not re.search(r'(throw|log\.error|log\.warn)', catch_body):
                    print_error(
                        f"MQ-03 onPayload 中 catch 块静默 return（吞异常），消息会被确认但实际未处理："
                        f"{rel}:{on_payload_idx + 1}"
                    )

    # MQ-06  onPayload 缺少入参非空校验
    if on_payload_idx is not None:
        body = extract_method_body(lines, on_payload_idx)
        body_text = '\n'.join(line for _, line in body)
        if not re.search(
            r'(Objects\.requireNonNull|Assert\.|if\s*\(.*==\s*null|BeanUtils\.isEmpty|StringUtils\.isEmpty)',
            body_text
        ):
            print_warning(
                f"MQ-06 onPayload 缺少入参非空校验（建议在方法开头校验 payload 非空）："
                f"{rel}:{on_payload_idx + 1}"
            )

    # MQ-09
    check_mq09(lines, rel)


def check_mq09(lines, rel):
    """MQ-09  发送消息日志缺失（RocketMqUtil.send 后应有 log.info）"""
    for i, line in enumerate(lines):
        if re.search(r'RocketMqUtil\.(send|sendWithTag|delay|fifo)\s*\(', line):
            # 检查后面 10 行是否有 log.info/debug
            # 扩大窗口到 10 行，覆盖 try-catch 块内 send + 方法末尾 log 的常见结构
            next_lines = ''.join(lines[i+1:i+11])
            if not re.search(r'log\.(info|debug)', next_lines):
                print_warning(
                    f"MQ-09 发送 MQ 消息后缺少 log.info 日志记录（建议在发送后记录 topic/tag/消息摘要）："
                    f"{rel}:{i + 1}"
                )


def main():
    if len(sys.argv) < 2:
        print("用法：python3 check-mq-advanced.py <java-file-or-dir>")
        sys.exit(1)

    print("============================================")
    print("  java-mq / check-mq-advanced.py")
    print("  检查：MQ-03、MQ-06、MQ-09")
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
        print_ok("全部通过，MQ 高级规范检查无问题")


if __name__ == '__main__':
    main()
