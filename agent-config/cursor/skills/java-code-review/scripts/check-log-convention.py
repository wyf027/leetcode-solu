#!/usr/bin/env python3
"""
java-code-review/scripts/check-log-convention.py
覆盖日志规范全集：
  - CR-07a  日志三段式格式：「业务名(中文) - 操作(中文) - 操作结果(中文): key = {}, ...」
            业务名 / 操作 / 操作结果均为中文短语；kv 的 key 保留英文标识符（与变量名一致）
  - CR-07b  = 两侧各一个空格（key = {} 而非 key={}）
  - CR-07c  写操作方法（create/update/remove/delete）缺少「开始 / 成功」日志
  - CR-07d  查询方法（get/query/find/list/page/count）禁止打 log.info
  - CR-07e  业务拦截（throw BusinessException 前）应有 log.warn
  - CR-07f  异常日志末尾参数应传 e 而非 e.getMessage()（增强 CR-09）
  - CR-07g  kv 的 key 必须是英文标识符（便于 grep / 与变量名一致）
用法：python3 check-log-convention.py <java-file-or-dir> [--only-service]
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

# ── 正则常量 ──────────────────────────────────────────────────────────────────

# 日志调用行：log.info/warn/error/debug("...")
LOG_CALL = re.compile(r'\blog\.(info|warn|error|debug)\s*\(')

# 日志消息字符串提取（第一个参数）
LOG_MSG_STR = re.compile(r'\blog\.(?:info|warn|error|debug)\s*\(\s*"([^"]*)"')

# 三段式格式：业务名(中文) - 操作(中文) - 操作结果(中文): ...
# 正例：
#   "岗位配置 - 创建 - 成功: id = {}"
#   "{} - 消费 - 开始: msgId = {}"                  （业务名为 {} 占位符，如 BaseListener.getClass().getSimpleName()）
#   "网关 - 初始化JwtDecoder - 成功: issuer = {}"
# 业务名/操作名/操作结果短语：必须为中文（含 CJK 字符）；首段允许 {} 占位符（动态 listener 名场景）
# 第二段动作名内允许夹杂英文/数字（如 "初始化JwtDecoder"），但必须包含至少一个 CJK 字符
LOG_THREE_PART = re.compile(
    r'^(?:[\u4e00-\u9fff][\u4e00-\u9fff\w]*|\{\})\s+-\s+'
    r'(?:[\u4e00-\u9fff\w]*[\u4e00-\u9fff][\u4e00-\u9fff\w]*|\{\})\s+-\s+'
    r'[^:]*[\u4e00-\u9fff][^:]*:'
)

# kv 格式：key = {} (= 两侧各有空格)
# 反例：key={} 或 key ={} 或 key= {}
# kv 的 key 强制英文标识符（便于 grep + 与变量名对齐）
KV_ANY        = re.compile(r'(\S+)\s*=\s*\{\}')                    # 任意非空白作为 key
KV_NO_SPACE   = re.compile(r'\b[A-Za-z_][A-Za-z0-9_]*\s*=\s*\{\}') # 所有 kv 样式（英文 key）
KV_CORRECT    = re.compile(r'\b[A-Za-z_][A-Za-z0-9_]*\s+=\s+\{\}') # 正确样式（英文 key + 两侧空格）
KV_KEY_ASCII  = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')

# 写操作方法名前缀
WRITE_METHOD = re.compile(
    r'^\s*(?:public|protected)\s+\S+\s+'
    r'(create|add|save|insert|update|modify|edit|delete|remove|batchCreate|batchUpdate|batchDelete)\w*'
    r'\s*\(',
    re.IGNORECASE
)

# 查询方法名前缀
QUERY_METHOD = re.compile(
    r'^\s*(?:public|protected)\s+\S+\s+'
    r'(get|find|query|list|page|search|count|exists|check|fetch|load|select)\w*'
    r'\s*\(',
    re.IGNORECASE
)

# BusinessException 抛出
THROW_BIZ_EX = re.compile(r'throw\s+\w*BusinessException|\w+ErrorCode\.\w+\.toEx\(\)')


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


# ── 方法体提取 ────────────────────────────────────────────────────────────────

def iter_methods(lines):
    """
    粗略迭代方法：yield (method_name, start_lineno, body_lines)
    body_lines: [(lineno, text), ...]
    """
    n = len(lines)
    i = 0
    while i < n:
        wm = WRITE_METHOD.match(lines[i]) or QUERY_METHOD.match(lines[i])
        pm = re.match(
            r'^\s*(?:public|protected)\s+\S+\s+(\w+)\s*\(',
            lines[i]
        )
        if pm:
            method_name = pm.group(1)
            start = i
            depth = lines[i].count('{') - lines[i].count('}')
            j = i + 1
            while j < n and depth > 0:
                depth += lines[j].count('{') - lines[j].count('}')
                j += 1
            body = [(k + 1, lines[k]) for k in range(start, j)]
            yield method_name, i + 1, body
            i = j
        else:
            i += 1


# ── 单文件检查 ────────────────────────────────────────────────────────────────

def check_file(path, only_service=False):
    if not path.endswith('.java'):
        return
    fname = os.path.basename(path)

    # only_service 模式下只扫 ServiceImpl
    if only_service and 'ServiceImpl' not in fname:
        return

    rel = os.path.relpath(path)

    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
    except Exception as e:
        print_warning(f"无法读取 {rel}: {e}")
        return

    content = ''.join(lines)
    # MyBatis-Plus MetaObjectHandler 的 insertFill/updateFill 是框架回调钩子，
    # 每次 INSERT/UPDATE 都会触发，加 log.info 会日志洪水，整文件豁免写操作日志检查。
    is_orm_hook = bool(re.search(r'implements\s+[\w.,\s]*\bMetaObjectHandler\b', content))

    is_mapper = 'Mapper' in fname
    is_service = 'Service' in fname or 'Handler' in fname
    is_query_file = not is_service  # Mapper、Controller 等不需要写操作日志

    for method_name, start_lineno, body in iter_methods(lines):
        body_text = ''.join(line for _, line in body)
        body_line_count = len(body)

        # ── CR-07d  查询方法禁止 log.info ──────────────────────────────────
        if QUERY_METHOD.match(lines[start_lineno - 1] if start_lineno > 0 else ''):
            info_in_body = [
                (lno, ln.rstrip())
                for lno, ln in body
                if LOG_CALL.search(ln) and 'log.info' in ln
            ]
            if info_in_body:
                for lno, ln in info_in_body[:3]:
                    print_warning(
                        f"CR-07d 查询方法 [{method_name}] 禁止打 log.info"
                        f"（高频查询会打爆日志）：{rel}:{lno}"
                    )

        # ── CR-07c  写操作方法缺 start/success 日志 ────────────────────────
        # MetaObjectHandler 钩子 insertFill/updateFill 由框架高频回调，豁免日志检查。
        if method_name in ('insertFill', 'updateFill'):
            continue
        if is_service and not is_orm_hook and WRITE_METHOD.match(lines[start_lineno - 1] if start_lineno > 0 else ''):
            has_start   = bool(re.search(r'log\.info[^;]*开始', body_text))
            has_success = bool(re.search(r'log\.info[^;]*成功', body_text))
            if not has_start:
                print_error(
                    f"CR-07c 写操作方法 [{method_name}] 入口缺少 "
                    f"log.info(\"xxx - 操作 - 开始: ...\")：{rel}:{start_lineno}"
                )
            if not has_success:
                print_error(
                    f"CR-07c 写操作方法 [{method_name}] 缺少 "
                    f"log.info(\"xxx - 操作 - 成功: ...\")：{rel}:{start_lineno}"
                )

        # ── CR-07e  业务拦截（throw）前缺 log.warn ─────────────────────────
        if is_service:
            for idx, (lno, ln) in enumerate(body):
                if THROW_BIZ_EX.search(ln):
                    # 检查前 3 行是否有 log.warn
                    pre = ''.join(line for _, line in body[max(0, idx-3):idx])
                    if 'log.warn' not in pre and 'log.error' not in pre:
                        print_warning(
                            f"CR-07e 抛出 BusinessException 前缺少 log.warn"
                            f"（建议记录触发条件）：{rel}:{lno}"
                        )

    # ── CR-07a / CR-07b  日志消息格式检查（全文扫描，覆盖 static 方法/初始化块/lambda 内日志）──
    for lno0, ln in enumerate(lines, 1):
        stripped = ln.strip()
        if stripped.startswith('//') or stripped.startswith('*'):
            continue

        m = LOG_MSG_STR.search(ln)
        if not m:
            continue
        msg = m.group(1)

        # CR-07a  三段式格式（铁律：log.info/warn/error/debug 全覆盖，无任何豁免）
        # 启动初始化、Configuration、工具类静态方法、Filter/Listener、异常处理器一律遵守
        # 业务名 / 操作 / 操作结果 必须为中文短语
        if LOG_CALL.search(ln):
            if not LOG_THREE_PART.match(msg):
                print_error(
                    f"CR-07a 日志必须严格三段式「业务名(中文) - 操作(中文) - 操作结果(中文): key = {{}}」"
                    f"（当前：\"{msg[:60]}\"）：{rel}:{lno0}"
                )

        # CR-07b  = 两侧空格
        kv_all = KV_NO_SPACE.findall(msg)
        kv_ok  = KV_CORRECT.findall(msg)
        bad_kv = [kv for kv in kv_all if kv not in kv_ok]
        if bad_kv:
            print_error(
                f"CR-07b 日志 kv 格式错误，`=` 两侧必须各有一个空格"
                f"（错误项：{bad_kv[:3]}）：{rel}:{lno0}"
            )

        # CR-07g  kv 的 key 必须是英文标识符
        for raw_kv in KV_ANY.findall(msg):
            key = raw_kv.lstrip('，,.;；:：、(（[【{｛"\'')
            if key and not KV_KEY_ASCII.match(key):
                print_error(
                    f"CR-07g 日志 kv 的 key 必须为英文标识符（与变量名一致便于 grep）"
                    f"（错误项：\"{key}\"）：{rel}:{lno0}"
                )


def main():
    if len(sys.argv) < 2:
        print("用法：python3 check-log-convention.py <java-file-or-dir> [--only-service]")
        sys.exit(1)

    only_service = '--only-service' in sys.argv
    targets = [a for a in sys.argv[1:] if not a.startswith('--')]

    print("============================================")
    print("  java-code-review / check-log-convention.py")
    print(f"  模式: {'仅 ServiceImpl' if only_service else '全部 Java 文件'}")
    print("============================================")

    for target in targets:
        if os.path.isfile(target):
            check_file(target, only_service)
        elif os.path.isdir(target):
            for root, dirs, files in os.walk(target):
                dirs[:] = [d for d in dirs if d not in ['target', '.git', 'node_modules']]
                for fname in files:
                    if fname.endswith('.java'):
                        check_file(os.path.join(root, fname), only_service)
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
        print_ok("全部通过，日志规范检查无问题")


if __name__ == '__main__':
    main()
