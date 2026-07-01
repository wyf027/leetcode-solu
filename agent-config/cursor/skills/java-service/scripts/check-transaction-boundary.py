#!/usr/bin/env python3
"""
java-service/scripts/check-transaction-boundary.py
覆盖：SV-TX 多写操作缺 @Transactional（事务边界缺失）

检测逻辑：
  ① public 方法含 ≥ 2 个 DB 写操作且无 @Transactional        → ❌ ERROR
  ② public 方法含 DB 写操作 + MQ 发送且无 @Transactional      → 🟡 WARN
     （DB 写失败会回滚，但 MQ 消息已发出，造成消息与数据不一致）

跳过条件：
  - 方法名以 get/find/query/list/page/count/fetch/load/check/is 开头（查询方法）
  - 已有 @Transactional（含 readOnly = true）
  - private 方法（由调用方负责事务）
  - 构造方法、toString、hashCode、equals

用法：
  python3 check-transaction-boundary.py <java-file-or-dir>
  python3 check-transaction-boundary.py <dir> --files f1.java f2.java ...
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

# ── DB 写操作模式 ───────────────────────────────────────────────────────────────
# 格式：(compiled_pattern, 描述名称)
# 匹配时要求：不能紧跟在 . 之后（避免匹配 result.save() 等本地变量）
DB_WRITE_PATTERNS = [
    # IService 继承的写方法（直接调用或 this. 调用）
    (re.compile(r'(?<![.\w])(?:this\.)?save\s*\('),                     'save()'),
    (re.compile(r'(?<![.\w])(?:this\.)?saveBatch\s*\('),                'saveBatch()'),
    (re.compile(r'(?<![.\w])(?:this\.)?saveOrUpdate(?:Batch)?\s*\('),   'saveOrUpdate()'),
    (re.compile(r'(?<![.\w])(?:this\.)?updateById\s*\('),               'updateById()'),
    (re.compile(r'(?<![.\w])(?:this\.)?updateBatchById\s*\('),          'updateBatchById()'),
    (re.compile(r'(?<![.\w])(?:this\.)?removeById\s*\('),               'removeById()'),
    (re.compile(r'(?<![.\w])(?:this\.)?removeByIds\s*\('),              'removeByIds()'),
    (re.compile(r'(?<![.\w])(?:this\.)?remove\s*\('),                   'remove()'),
    # lambdaUpdate 链式写（触发点为 lambdaUpdate() 起头）
    (re.compile(r'(?<![.\w])lambdaUpdate\s*\('),                        'lambdaUpdate()'),
    # Mapper 直接调用（xxxMapper.insert/update/delete/remove/save）
    (re.compile(r'\b\w+[Mm]apper\.(insert|update|delete|remove|save)\w*\s*\('),
     'Mapper 写操作'),
    # 跨 Service 写操作（xxxService.create/save/update/delete/remove/add/modify）
    (re.compile(
        r'\b\w+[Ss]ervice\.'
        r'(?:create|save|update|delete|remove|add|modify|batchSave|batchCreate|batchUpdate|batchDelete)'
        r'\w*\s*\('
    ), 'Service 写操作'),
]

# ── MQ 发送模式 ─────────────────────────────────────────────────────────────────
MQ_SEND_PATTERNS = [
    re.compile(r'\bRocketMqUtil\.(?:send|sendWithTag|sendDelayMsg|sendFifo|delay|fifo)\s*\('),
    re.compile(r'\brocketMQTemplate\.(?:send|convertAndSend|asyncSend|syncSend)\s*\('),
]

# ── 查询方法前缀（跳过这些方法的检查）──────────────────────────────────────────
QUERY_NAME_RE = re.compile(
    r'(?:get|find|query|list|page|count|select|fetch|load|read|check|exist|is[A-Z])\w*$'
)

# ── public 方法签名（不匹配 class/interface/enum 行）──────────────────────────
METHOD_SIG_RE = re.compile(
    r'^\s*public\s+'
    r'(?:(?:static|final|synchronized|default|abstract)\s+)*'
    r'(?:<[^>]+>\s+)?'          # 泛型返回类型
    r'(?:[\w<>\[\],\s?]+?)\s+'  # 返回类型（非贪婪）
    r'(\w+)\s*\('               # 方法名 + (
)

SKIP_METHODS = {'toString', 'hashCode', 'equals', 'clone', 'finalize'}


# ─────────────────────────────────────────────────────────────────────────────
# 工具函数
# ─────────────────────────────────────────────────────────────────────────────

def strip_comments(content: str) -> str:
    """移除 Java 块注释与行注释（保留行数不变以对齐行号）。"""
    # 块注释：用等数量换行符替换，保持行号
    def replace_block(m):
        return '\n' * m.group(0).count('\n')

    content = re.sub(r'/\*.*?\*/', replace_block, content, flags=re.DOTALL)
    # 行注释：替换为空格（不影响行号）
    content = re.sub(r'//[^\n]*', '', content)
    return content


def strip_strings(content: str) -> str:
    """移除字符串字面量（避免字符串内的关键字触发误报）。"""
    # 替换双引号字符串为空（保留引号对本身）
    content = re.sub(r'"(?:[^"\\]|\\.)*"', '""', content)
    content = re.sub(r"'(?:[^'\\]|\\.)'", "''", content)
    return content


def has_transactional(raw_lines: list, method_line: int) -> bool:
    """
    往方法签名行向上找，遇到 @Transactional 返回 True。
    只要未遇到非注释/非空行就继续向上扫。
    """
    i = method_line - 1
    while i >= 0:
        stripped = raw_lines[i].strip()
        if not stripped:
            i -= 1
            continue
        if stripped.startswith('@'):
            if 'Transactional' in stripped:
                return True
            i -= 1
            continue
        # Javadoc / 块注释行
        if stripped.startswith('*') or stripped.startswith('/*') or stripped.startswith('*/'):
            i -= 1
            continue
        # 遇到实际代码行（上一个方法体结束的 } 等），停止
        break
    return False


def find_method_end(lines: list, start: int) -> int:
    """
    从方法签名行开始，找到方法体结束的行索引（含该行的 }）。
    遇到无方法体（abstract/interface）时返回 start。
    """
    depth = 0
    body_started = False
    for i in range(start, len(lines)):
        for ch in lines[i]:
            if ch == '{':
                depth += 1
                body_started = True
            elif ch == '}':
                depth -= 1
                if body_started and depth == 0:
                    return i
    return start


def count_write_and_mq(body_lines: list) -> tuple:
    """
    扫描方法体，返回：
      db_writes : [(offset_in_body, op_name), ...]
      mq_sends  : [(offset_in_body, op_name), ...]
    每行只计一次写操作（避免同一行多次匹配）。
    """
    db_writes = []
    mq_sends = []

    for offset, line in enumerate(body_lines):
        matched_write = False
        for pattern, op_name in DB_WRITE_PATTERNS:
            if pattern.search(line):
                db_writes.append((offset + 1, op_name))
                matched_write = True
                break  # 每行最多计一个写操作
        if not matched_write:
            for pattern in MQ_SEND_PATTERNS:
                if pattern.search(line):
                    mq_sends.append((offset + 1, 'RocketMQ 发送'))
                    break

    return db_writes, mq_sends


# ─────────────────────────────────────────────────────────────────────────────
# 核心检查
# ─────────────────────────────────────────────────────────────────────────────

def print_error(msg: str):
    global errors
    print(f"{RED}❌ [ERROR]{NC} {msg}")
    errors += 1


def print_warning(msg: str):
    global warnings
    print(f"{YELLOW}🟡 [WARN] {NC} {msg}")
    warnings += 1


def print_ok(msg: str):
    print(f"{GREEN}✅ {msg}{NC}")


def check_file(path: str):
    if 'ServiceImpl' not in os.path.basename(path):
        return

    rel = os.path.relpath(path)
    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            raw = f.read()
    except Exception as e:
        print_warning(f"无法读取 {rel}: {e}")
        return

    raw_lines = raw.splitlines()
    # 去注释、去字符串后的版本用于方法体扫描
    clean = strip_strings(strip_comments(raw))
    lines = clean.splitlines()

    i = 0
    found_any = False
    while i < len(lines):
        line = lines[i]
        m = METHOD_SIG_RE.match(line)
        if not m:
            i += 1
            continue

        method_name = m.group(1)

        # 跳过特殊方法
        if method_name in SKIP_METHODS:
            i += 1
            continue

        # 跳过查询类方法
        if QUERY_NAME_RE.match(method_name):
            i += 1
            continue

        # 找到方法体范围
        method_end = find_method_end(lines, i)
        if method_end == i:
            # abstract 或接口默认方法未找到方法体
            i += 1
            continue

        body_lines = lines[i + 1:method_end]

        # 检查是否已有 @Transactional
        if has_transactional(raw_lines, i):
            i = method_end + 1
            continue

        db_writes, mq_sends = count_write_and_mq(body_lines)

        if len(db_writes) >= 2:
            found_any = True
            ops_desc = '、'.join(
                f"第 {ln} 行 {op}" for ln, op in db_writes[:4]
            )
            if len(db_writes) > 4:
                ops_desc += f" …共 {len(db_writes)} 处"
            print_error(
                f"SV-TX {rel}:{i + 1}  {method_name}()\n"
                f"          含 {len(db_writes)} 个 DB 写操作但缺少 @Transactional，"
                f"部分操作失败将导致数据不一致\n"
                f"          写操作：{ops_desc}"
            )

        elif len(db_writes) == 1 and len(mq_sends) >= 1:
            found_any = True
            print_warning(
                f"SV-TX {rel}:{i + 1}  {method_name}()\n"
                f"          含 DB 写操作 + MQ 发送但缺少 @Transactional，"
                f"DB 回滚时消息已发出，存在消息与数据不一致风险\n"
                f"          建议加 @Transactional 或使用事务消息"
            )

        i = method_end + 1

    return found_any


# ─────────────────────────────────────────────────────────────────────────────
# 入口
# ─────────────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("用法：python3 check-transaction-boundary.py <java-file-or-dir>")
        print("      python3 check-transaction-boundary.py <dir> --files f1.java f2.java ...")
        sys.exit(1)

    print("=" * 52)
    print("  java-service / check-transaction-boundary.py")
    print("  检查：SV-TX 多写操作缺 @Transactional")
    print("=" * 52)

    # 解析参数：支持 --files 增量模式
    file_targets: list[str] = []
    dir_targets: list[str] = []
    files_mode = False

    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg == '--files':
            files_mode = True
            i += 1
            while i < len(sys.argv):
                file_targets.append(sys.argv[i])
                i += 1
        else:
            dir_targets.append(arg)
            i += 1

    if files_mode:
        for f in file_targets:
            if os.path.isfile(f):
                check_file(f)
            else:
                print_warning(f"文件不存在：{f}")
    else:
        for target in dir_targets:
            if os.path.isfile(target):
                check_file(target)
            elif os.path.isdir(target):
                for root, dirs, files in os.walk(target):
                    dirs[:] = [d for d in dirs if d not in {'target', '.git', 'node_modules', 'build'}]
                    for fname in sorted(files):
                        if fname.endswith('.java'):
                            check_file(os.path.join(root, fname))
            else:
                print_warning(f"路径不存在：{target}")

    print()
    print("=" * 52)
    if errors > 0:
        print(f"{RED}❌ 检查完成：{errors} 个阻断错误，{warnings} 个警告{NC}")
        sys.exit(1)
    elif warnings > 0:
        print(f"{YELLOW}🟡 检查完成：0 个阻断错误，{warnings} 个警告{NC}")
    else:
        print_ok("全部通过，无多写操作缺事务问题")


if __name__ == '__main__':
    main()
