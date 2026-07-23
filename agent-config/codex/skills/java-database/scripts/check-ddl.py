#!/usr/bin/env python3
"""
java-database/scripts/check-ddl.py
覆盖：DB-11（通用字段完整性：created_at/updated_at/created_by/updated_by）
      DB-16（updated_at 表级触发器存在性）
用法：python3 check-ddl.py <sql-file-or-dir>
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

# 必须字段（通用审计字段）
REQUIRED_FIELDS = ['created_at', 'updated_at', 'created_by', 'updated_by']
# 可接受别名（兼容旧命名，但首选新命名）
FIELD_ALIASES = {
    'created_at': ['created_at', 'create_time', 'gmt_create', 'gmt_created'],
    'updated_at': ['updated_at', 'update_time', 'gmt_modified'],
    'created_by': ['created_by', 'create_by', 'creator_id'],
    'updated_by': ['updated_by', 'update_by', 'updater_id'],
}


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


def parse_create_tables(content):
    """
    提取 PostgreSQL SQL 文件中所有 CREATE TABLE 语句。
    返回 [(table_name, table_body_sql)]
    """
    pattern = re.compile(
        r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?(\w+)"?)\s*\((.*?)\)\s*;',
        re.IGNORECASE | re.DOTALL
    )
    return pattern.findall(content)


def extract_columns(table_body):
    """
    从 CREATE TABLE 体中提取列名集合（PostgreSQL 风格，支持带/不带双引号）。
    跳过约束行（PRIMARY KEY / CONSTRAINT / UNIQUE / CHECK / FOREIGN KEY）。
    """
    col_pattern = re.compile(
        r'^\s*"?([a-z_][a-z0-9_]*)"?\s+\w',
        re.IGNORECASE | re.MULTILINE
    )
    skip_keywords = {'primary', 'constraint', 'unique', 'check', 'foreign', 'exclude'}
    cols = set()
    for m in col_pattern.finditer(table_body):
        name = m.group(1).lower()
        if name not in skip_keywords:
            cols.add(name)
    return cols


def check_trigger(content, table_name):
    """
    检查文件内是否存在绑定到该表的 updated_at 触发器。
    """
    pattern = re.compile(
        rf'CREATE\s+TRIGGER\s+\S+\s+BEFORE\s+UPDATE\s+ON\s+"?{re.escape(table_name)}"?',
        re.IGNORECASE
    )
    return bool(pattern.search(content))


def check_file(path):
    if not path.endswith('.sql'):
        return
    rel = os.path.relpath(path)

    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            content = f.read()
    except Exception as e:
        print_warning(f"无法读取 {rel}: {e}")
        return

    tables = parse_create_tables(content)
    if not tables:
        return

    for table_name, table_body in tables:
        cols = extract_columns(table_body)

        # DB-11：通用字段完整性
        for required_field, aliases in FIELD_ALIASES.items():
            found = any(alias in cols for alias in aliases)
            if not found:
                print_error(
                    f"DB-11 表 `{table_name}` 缺少通用字段 `{required_field}`"
                    f"（或其等价字段 {aliases}）：{rel}"
                )
            elif required_field not in cols:
                # 找到的是别名，给出迁移提示
                actual = next(a for a in aliases if a in cols)
                print_warning(
                    f"DB-11 表 `{table_name}` 使用旧字段名 `{actual}`，"
                    f"建议迁移为 `{required_field}`：{rel}"
                )

        # DB-16：updated_at 表级触发器
        if not check_trigger(content, table_name):
            print_warning(
                f"DB-16 表 `{table_name}` 未找到 BEFORE UPDATE 触发器，"
                f"updated_at 缺少表级兜底保障：{rel}"
            )


def main():
    if len(sys.argv) < 2:
        print("用法：python3 check-ddl.py <sql-file-or-dir>")
        sys.exit(1)

    print("============================================")
    print("  java-database / check-ddl.py")
    print("  检查通用字段完整性（created_at/updated_at/created_by/updated_by）")
    print("  检查 updated_at 表级触发器存在性")
    print("============================================")

    for target in sys.argv[1:]:
        if os.path.isfile(target):
            check_file(target)
        elif os.path.isdir(target):
            for root, dirs, files in os.walk(target):
                dirs[:] = [d for d in dirs if d not in ['target', '.git']]
                for fname in files:
                    if fname.endswith('.sql'):
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
        print_ok("全部通过，通用字段完整")


if __name__ == '__main__':
    main()
