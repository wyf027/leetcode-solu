#!/usr/bin/env python3
"""
java-code-review/scripts/check-runtime-risk.py

扫描 AI 生成代码中容易造成线上稳定性事故的运行时资源风险。

重点覆盖：
  - RR-01 大文件 / 外部流一次性读入内存（OOM 风险）
  - RR-02 无界队列 / 无界线程池 / 无限循环
  - RR-03 外部 HTTP / IO 资源缺超时或关闭证据
  - RR-04 大对象 / 整包 body 直接打日志
  - RR-05 JVM 本地共享状态缓存
  - RR-06 Redis 缓存缺 TTL
  - PR-01 SQL 注入高危写法
  - PR-02 MQ / 回调幂等缺失
  - PR-03 租户隔离条件缺失
  - PR-04 事务内执行外部调用
  - PR-05 异常吞掉后返回成功 / null
  - PR-06 VO / Response 暴露敏感字段

用法：
  python3 check-runtime-risk.py <java-file-or-dir>...
  python3 check-runtime-risk.py --files "file1.java file2.java mapper.xml"
"""

import os
import re
import shlex
import sys
from pathlib import Path

RED = "\033[0;31m"
YELLOW = "\033[1;33m"
GREEN = "\033[0;32m"
NC = "\033[0m"

errors = 0
warnings = 0


def print_error(message: str) -> None:
    global errors
    print(f"{RED}❌ [ERROR]{NC} {message}")
    errors += 1


def print_warning(message: str) -> None:
    global warnings
    print(f"{YELLOW}🟡 [WARN] {NC} {message}")
    warnings += 1


def print_ok(message: str) -> None:
    print(f"{GREEN}✅ {message}{NC}")


def collect_files(args: list[str]) -> list[Path]:
    if not args:
        args = ["."]

    if args and args[0] == "--files":
        raw = args[1] if len(args) > 1 else ""
        args = shlex.split(raw)

    files: list[Path] = []
    for arg in args:
        path = Path(arg)
        if path.is_file() and path.suffix in {".java", ".xml"}:
            files.append(path)
        elif path.is_dir():
            for root, dirs, names in os.walk(path):
                dirs[:] = [d for d in dirs if d not in {".git", "target", "node_modules", "build", "out"}]
                for name in names:
                    if name.endswith((".java", ".xml")):
                        files.append(Path(root) / name)
    return sorted(set(files))


def strip_inline_comment(line: str) -> str:
    stripped = line.strip()
    if stripped.startswith("//") or stripped.startswith("*"):
        return ""
    return line


def iter_code_lines(path: Path) -> list[tuple[int, str]]:
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception as exc:
        print_warning(f"无法读取文件: file = {path}, error = {exc}")
        return []
    return [(idx, strip_inline_comment(line)) for idx, line in enumerate(lines, start=1)]


def check_xml_file(path: Path) -> None:
    rel = os.path.relpath(path)
    numbered_lines = iter_code_lines(path)
    text = "\n".join(line for _, line in numbered_lines)

    for line_no, line in numbered_lines:
        if "${" in line:
            print_error(f"PR-01 MyBatis XML 禁止使用 ${{}} 拼接 SQL，需改为 #{{}} 或白名单枚举映射: file = {rel}:{line_no}")

    is_mapper_xml = "Mapper" in path.name or "<mapper" in text
    if is_mapper_xml and re.search(r"\b(select|update|delete)\b", text, re.I):
        if not re.search(r"\b(company_id|companyId|tenant_id|tenantId)\b", text):
            print_warning(f"PR-03 Mapper XML 未看到租户隔离条件 company_id/companyId，请确认是否为全局表: file = {rel}")


def check_file(path: Path) -> None:
    if path.suffix == ".xml":
        check_xml_file(path)
        return
    if path.suffix != ".java":
        return

    # 测试文件不做运行时资源风险检查：测试代码在沙箱环境运行，局部 Map/线程池等用法合理
    path_str = str(path)
    if "/src/test/" in path_str or "\\src\\test\\" in path_str:
        return

    rel = os.path.relpath(path)
    numbered_lines = iter_code_lines(path)
    text = "\n".join(line for _, line in numbered_lines)

    # RR-01: 大文件 / 外部流全量读入内存。该类命中直接阻断。
    full_read_patterns = [
        (r"\.readAllBytes\s*\(", "InputStream.readAllBytes 会把完整内容加载进堆内存"),
        (r"\bIOUtils\.toByteArray\s*\(", "IOUtils.toByteArray 会把完整内容加载进堆内存"),
        (r"\bByteStreams\.toByteArray\s*\(", "ByteStreams.toByteArray 会把完整内容加载进堆内存"),
        (r"\bFileUtils\.readFileToByteArray\s*\(", "readFileToByteArray 会把完整文件加载进堆内存"),
        (r"\bStreamUtils\.copyToByteArray\s*\(", "copyToByteArray 会把完整流加载进堆内存"),
    ]
    for line_no, line in numbered_lines:
        for pattern, reason in full_read_patterns:
            if re.search(pattern, line):
                print_error(
                    f"RR-01 禁止外部流/大文件全量读入内存，需改为流式处理: file = {rel}:{line_no}, reason = {reason}"
                )

    for line_no, line in numbered_lines:
        if re.search(r"\bbyte\s*\[\]\s+\w*(file|video|audio|content|upload|download|bytes|data)\w*", line, re.I):
            print_warning(
                f"RR-01 大对象 byte[] 可能放大堆内存占用，请确认是否可改为 InputStream/临时文件流式处理: file = {rel}:{line_no}"
            )
        if "ByteArrayOutputStream" in line:
            print_warning(
                f"RR-01 ByteArrayOutputStream 可能导致内容在堆内累积，请确认数据上限或改为流式处理: file = {rel}:{line_no}"
            )

    # RR-02: 无界队列 / 无界线程池 / 无限循环。
    for line_no, line in numbered_lines:
        if re.search(r"new\s+LinkedBlockingQueue\s*<[^>]*>\s*\(\s*\)", line) or re.search(
            r"new\s+LinkedBlockingQueue\s*\(\s*\)", line
        ):
            print_error(f"RR-02 禁止无界 LinkedBlockingQueue，必须设置容量和拒绝策略: file = {rel}:{line_no}")
        if "Executors.newCachedThreadPool" in line:
            print_error(f"RR-02 禁止 newCachedThreadPool，无界线程增长存在 OOM 风险: file = {rel}:{line_no}")
        if "Executors.newFixedThreadPool" in line:
            print_warning(f"RR-02 newFixedThreadPool 默认无界队列，请确认任务来源有上限或改 ThreadPoolExecutor: file = {rel}:{line_no}")
        if re.search(r"\bwhile\s*\(\s*true\s*\)", line):
            print_error(f"RR-02 禁止无限循环无退出条件，必须有中断/超时/最大次数: file = {rel}:{line_no}")

    # RR-03: 外部 HTTP / IO 资源缺超时或关闭证据。
    if "HttpURLConnection" in text:
        if "setConnectTimeout" not in text or "setReadTimeout" not in text:
            print_error(f"RR-03 HttpURLConnection 必须同时设置 connect/read timeout: file = {rel}")
        if "disconnect()" not in text:
            print_warning(f"RR-03 HttpURLConnection 未看到 disconnect()，请确认连接会被释放: file = {rel}")
    if re.search(r"HttpRequest\.(get|post|put|delete)\s*\(", text) and (
        "setConnectionTimeout" not in text or "setReadTimeout" not in text
    ):
        print_warning(f"RR-03 Hutool HttpRequest 外部调用建议显式设置连接和读取超时: file = {rel}")

    # RR-04: 大对象 / 整包 body 直接打日志。
    for line_no, line in numbered_lines:
        if re.search(
            r"log\.(info|warn|error|debug)\s*\([^;]*(body|callbackBody|requestBody|responseBody|payload|dto|entity|JSONUtil\.toJsonStr|JSON\.toJSONString)",
            line,
        ):
            print_warning(
                f"RR-04 日志疑似打印整包对象/大 body，可能放大 IO 与日志成本，建议只打 id/长度/摘要: file = {rel}:{line_no}"
            )

    # RR-05: JVM 本地共享状态缓存。多实例部署下直接阻断。
    # 仅对 static（非 final）字段报错——方法内局部变量无 static 关键字，自动排除误报。
    # 判断是否为字段声明而非方法签名：方法签名行含 ( 但无 = 或 ;（含 { 结尾），字段有 = 或 ;。
    for line_no, line in numbered_lines:
        is_static_mutable = bool(re.search(r"\bstatic\b", line)) and not bool(re.search(r"\bstatic\s+final\b", line))
        if is_static_mutable and re.search(r"\b(Map|HashMap|ConcurrentHashMap|Set|HashSet)\s*<", line):
            has_parens = "(" in line
            has_assignment_or_semi = bool(re.search(r"[=;]", line))
            if not (has_parens and not has_assignment_or_semi):
                print_error(
                    f"RR-05 禁止用 JVM 本地集合缓存跨请求共享状态，多实例不一致，需改 Redis + TTL: file = {rel}:{line_no}"
                )
        if is_static_mutable and re.search(r"\bAtomic(Reference|Integer|Long|Boolean)\s*<*", line):
            has_parens = "(" in line
            has_assignment_or_semi = bool(re.search(r"[=;]", line))
            if not (has_parens and not has_assignment_or_semi):
                print_error(
                    f"RR-05 禁止用 Atomic* 保存跨请求共享状态，多实例不一致，需改 Redis/DB/MQ 幂等: file = {rel}:{line_no}"
                )
        if re.search(r"\bprivate\s+(static\s+)?volatile\s+\w+", line):
            print_error(f"RR-05 禁止 volatile 字段缓存 token/状态，需改 Redis + TTL: file = {rel}:{line_no}")

    if "@PostConstruct" in text and re.search(r"\bthis\.\w+\s*=", text):
        print_warning(f"RR-05 @PostConstruct 写实例变量，请确认只是启动期只读配置，不是跨请求共享状态: file = {rel}")

    # RR-06: Redis 缓存缺 TTL。
    # RedisUtil.set() 有三个重载：set(key, value) / set(key, value, Duration) / set(key, value, timeout, TimeUnit)
    # 只有无 TTL 的 2 参数版本需要报错；含 TimeUnit/Duration 的重载已有 TTL，不报错。
    TTL_INDICATORS = ("TimeUnit.", "Duration.", "MINUTES", "HOURS", "SECONDS", "DAYS", "MILLISECONDS")
    for line_no, line in numbered_lines:
        if re.search(r"\bRedisUtil\.set\s*\(", line):
            if not any(ind in line for ind in TTL_INDICATORS):
                print_error(f"RR-06 RedisUtil.set 缓存缺 TTL，必须使用 setEx 或等价 TTL API: file = {rel}:{line_no}")
        if re.search(r"\.opsForValue\(\)\.set\s*\(", line) and "TimeUnit" not in line and "Duration" not in line:
            print_error(f"RR-06 Redis opsForValue().set 缺 TTL，多实例缓存必须设置过期时间: file = {rel}:{line_no}")

    # PR-01: SQL 注入与绕过参数绑定风险。
    for line_no, line in numbered_lines:
        if re.search(r"\.last\s*\(", line):
            print_warning(f"PR-01 MyBatis-Plus last() 会原样拼接 SQL，请确认入参为常量或白名单: file = {rel}:{line_no}")
        if re.search(r"\.apply\s*\(", line):
            print_warning(f"PR-01 MyBatis-Plus apply() 存在 SQL 拼接风险，请确认使用占位符且入参可信: file = {rel}:{line_no}")
        if re.search(r"@(?:Select|Update|Delete|Insert)\s*\([^)]*\$\{", line):
            print_error(f"PR-01 MyBatis 注解 SQL 禁止使用 ${{}} 拼接参数: file = {rel}:{line_no}")

    # PR-02: MQ 消费 / 第三方回调存在副作用但缺少幂等证据。
    lower_name = path.name.lower()
    is_mq_consumer = (
        "@RocketMQMessageListener" in text
        or "extends BaseListener" in text
        or "implements RocketMQListener" in text
        or "onPayload" in text
    )
    is_callback = "callback" in lower_name or re.search(r"@PostMapping\s*\([^)]*callback", text, re.I)
    has_side_effect = re.search(
        r"\b(save|saveBatch|updateById|removeById|remove|lambdaUpdate)\s*\(|\b\w+Mapper\.(insert|update|delete|remove|save)\w*\s*\(|RocketMqUtil\.|RedisUtil\.",
        text,
    )
    has_idempotency_evidence = re.search(
        r"Idempot|idempot|setIfAbsent|SETNX|setNx|NX|dedup|duplicate|processed|幂等|重复|终态|唯一|unique|getAndDelete",
        text,
        re.I,
    )
    if (is_mq_consumer or is_callback) and has_side_effect and not has_idempotency_evidence:
        print_warning(
            f"PR-02 MQ 消费/第三方回调存在写库、发 MQ 或缓存副作用，但未看到幂等证据，需补 Redis SETNX/唯一约束/终态判断: file = {rel}"
        )

    # PR-03: 租户隔离风险。静态扫描只做 warning，避免误伤公共配置表。
    is_data_access_file = any(key in path.name for key in ("Service", "Mapper", "Repository"))
    has_data_access = re.search(
        r"lambdaQuery\s*\(|lambdaUpdate\s*\(|baseMapper\.|selectList\s*\(|update\s*\(|delete\s*\(|remove\s*\(|list\s*\(|page\s*\(",
        text,
    )
    if is_data_access_file and has_data_access and not re.search(r"\b(companyId|company_id|tenantId|tenant_id|SysContext)\b", text):
        print_warning(f"PR-03 数据访问代码未看到租户隔离条件，请确认不是跨公司/跨租户越权查询或更新: file = {rel}")

    # PR-04: 事务内执行外部调用，容易造成长事务和一致性问题。
    if "@Transactional" in text and re.search(
        r"HttpRequest\.|RestTemplate|WebClient|OpenFeign|FeignClient|openConnection\s*\(|\.execute\s*\(|RocketMqUtil\.|RedisUtil\.",
        text,
    ):
        print_warning(
            f"PR-04 @Transactional 方法附近存在 HTTP/MQ/Redis 外部调用，请确认事务边界、超时和失败一致性策略: file = {rel}"
        )

    # PR-05: catch 后返回成功/null/空返回，可能吞掉异常。回调场景允许返回 200，但必须有失败状态或补偿说明。
    catch_blocks = re.finditer(r"catch\s*\([^)]+\)\s*\{(?P<body>.*?)\n\s*\}", text, re.DOTALL)
    for match in catch_blocks:
        body = match.group("body")
        line_no = text[: match.start()].count("\n") + 1
        returns_success_or_null = re.search(r"return\s+(Result\.ok\s*\(|null\s*;)|\breturn\s*;", body)
        throws_or_marks_failure = re.search(r"\bthrow\b|setStatus\s*\(|success\s*=\s*false|sendFail|fail|FAILED|callbackStatus", body, re.I)
        if returns_success_or_null and not throws_or_marks_failure:
            print_warning(
                f"PR-05 catch 后返回成功/null/空返回但未看到失败状态或补偿，可能吞异常导致上游误判成功: file = {rel}:{line_no}"
            )

    # PR-06: 对外 VO / Response 暴露敏感字段。
    if path.name.endswith(("VO.java", "Response.java")):
        for line_no, line in numbered_lines:
            if re.search(r"\b(password|passwd|token|accessToken|refreshToken|secret|appSecret|privateKey|idCard|bankCard|cardNo)\b", line, re.I):
                print_error(f"PR-06 VO/Response 禁止暴露敏感字段: file = {rel}:{line_no}")
    elif path.name.endswith("DTO.java"):
        for line_no, line in numbered_lines:
            if re.search(r"\b(password|passwd|accessToken|refreshToken|appSecret|privateKey|idCard|bankCard|cardNo)\b", line, re.I):
                print_warning(f"PR-06 DTO 含敏感字段，请确认仅用于内部传输且不会返回前端/日志/MQ: file = {rel}:{line_no}")

    # PR-07: Controller 直接信任请求体 companyId，容易越权。
    if path.name.endswith("Controller.java") and re.search(r"\.getCompanyId\s*\(|companyId", text) and "SysContext.getCompanyId" not in text:
        print_warning(f"PR-07 Controller 出现 companyId 但未看到 SysContext.getCompanyId，请确认未信任前端传入租户 ID: file = {rel}")


def main() -> None:
    print("============================================")
    print("  java-code-review / check-runtime-risk.py")
    print("  扫描目标: OOM / 无界资源 / 外部调用 / 大日志 / 本地缓存 / Redis TTL / 生产风险")
    print("============================================")

    files = collect_files(sys.argv[1:])
    if not files:
        print_ok("未发现 Java/XML 文件，跳过运行时资源风险扫描")
        return

    for path in files:
        check_file(path)

    print()
    print("============================================")
    if errors > 0:
        print(f"{RED}❌ 检查完成：{errors} 个阻断错误，{warnings} 个警告{NC}")
        sys.exit(1)
    if warnings > 0:
        print(f"{YELLOW}🟡 检查完成：0 个阻断错误，{warnings} 个警告{NC}")
        return
    print_ok("全部通过，未发现运行时资源高风险模式")


if __name__ == "__main__":
    main()
