#!/usr/bin/env python3
"""
java-project-structure/scripts/generate-scaffold.py
从 DDL (CREATE TABLE) 一键生成全链路 Java 代码骨架。生成顺序：

  1. XxxEntity.java        → {service}-service/…/entity/
  2. XxxStatusEnum.java    → {service}-service/…/enums/     (多值字段，按需生成)
  3. XxxMapper.java        → {service}-service/…/mapper/
  4. XxxMapper.xml         → {service}-service/…/resources/mapper/
  5. XxxService.java       → {service}-service/…/service/
  6. XxxServiceImpl.java   → {service}-service/…/service/impl/
  7. XxxController.java    → {service}-web/…/controller/

  已存在的文件默认跳过（不覆盖），加 --overwrite 强制覆盖。

用法：
  python3 generate-scaffold.py <service-root> --ddl <sql文件> [选项]

选项：
  --ddl      <path>     DDL SQL 文件路径（支持多表）
  --service  <name>     服务名（assess/hire/system/platform/integration），
                        默认从 service-root 目录名自动推断
  --domain   <name>     只生成指定表（PascalCase，如 Question），不指定则生成全部
  --dry-run             只打印，不写入文件
  --overwrite           覆盖已存在的文件（默认跳过）

示例：
  python3 generate-scaffold.py ~/IdeaProjects/assess \\
    --ddl ~/IdeaProjects/version/antview/v0.0.0.4/脚本/assess/assess.sql \\
    --domain Question --dry-run

  python3 generate-scaffold.py ~/IdeaProjects/hire \\
    --ddl ./job_config.sql
"""

import sys
import os
import re
import subprocess
import argparse
from pathlib import Path
from datetime import date
from typing import Optional

# ── 颜色 ───────────────────────────────────────────────────────────────────
RED    = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN  = '\033[0;32m'
CYAN   = '\033[0;36m'
BOLD   = '\033[1m'
NC     = '\033[0m'

# ── 常量 ───────────────────────────────────────────────────────────────────
BASE_GROUP = 'com.succaiss'

BASE_ENTITY_COLS = {
    'id', 'created_by', 'updated_by', 'created_at', 'updated_at', 'is_deleted'
}

# SQL类型 → Java类型
SQL_TYPE_MAP = {
    'bigint':      'Long',
    'int':         'Integer',
    'integer':     'Integer',
    'smallint':    'Integer',
    'tinyint':     'Integer',
    'decimal':     'BigDecimal',
    'numeric':     'BigDecimal',
    'float':       'BigDecimal',   # 统一用 BigDecimal，避免精度问题
    'double':      'BigDecimal',
    'varchar':     'String',
    'char':        'String',
    'text':        'String',
    'mediumtext':  'String',
    'longtext':    'String',
    'datetime':    'LocalDateTime',
    'timestamp':   'LocalDateTime',
    'date':        'LocalDate',
    'time':        'LocalTime',
    'boolean':     'Boolean',
    'bit':         'Boolean',
}

# 多值字段后缀 → 生成枚举
ENUM_SUFFIXES = ('_type', '_status', '_result', '_level', '_state', '_mode', '_stage')

# 是否类字段前缀/规律 → 推荐复用 YesNo
YES_NO_PREFIXES = ('is_',)

# MyBatis-Plus BaseEntity 公共字段（entity.xml resultMap 中需要包含）
BASE_ENTITY_RESULT_COLS = [
    ('id',         'id',         'Long'),
    ('created_by', 'createdBy',  'Long'),
    ('updated_by', 'updatedBy',  'Long'),
    ('created_at', 'createdAt',  'LocalDateTime'),
    ('updated_at', 'updatedAt',  'LocalDateTime'),
    ('is_deleted', 'isDeleted',  'Integer'),
]

# Java 保留字（需 @TableField）
JAVA_RESERVED = {
    'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
    'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
    'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
    'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
    'package', 'private', 'protected', 'public', 'return', 'short', 'static',
    'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
    'transient', 'try', 'void', 'volatile', 'while',
    # MySQL 常见保留字
    'key', 'order', 'index', 'select', 'from', 'where', 'group', 'by',
    'count', 'value', 'values', 'name', 'type',
}


# ── 工具函数 ────────────────────────────────────────────────────────────────

def get_git_author() -> str:
    try:
        r = subprocess.run(['git', 'config', 'user.name'],
                           capture_output=True, text=True, timeout=5)
        return r.stdout.strip() or 'Unknown'
    except Exception:
        return 'Unknown'


def get_tool_model() -> str:
    return 'Cursor - claude-sonnet'


def today_str() -> str:
    return date.today().strftime('%Y/%m/%d')


def snake_to_pascal(name: str) -> str:
    return ''.join(part.capitalize() for part in name.split('_'))


def snake_to_camel(name: str) -> str:
    pascal = snake_to_pascal(name)
    return pascal[0].lower() + pascal[1:] if pascal else pascal


def sql_type_to_java(sql_type: str) -> str:
    """从 SQL 类型字符串解析 Java 类型（tinyint(1) → Boolean 等）。"""
    t = sql_type.lower().strip()
    # tinyint(1) 特殊处理
    if re.match(r'tinyint\s*\(\s*1\s*\)', t):
        return 'Boolean'
    base = re.split(r'[\s(]', t)[0]
    return SQL_TYPE_MAP.get(base, 'String')


def needs_big_decimal_import(fields: list) -> bool:
    return any(f['java_type'] == 'BigDecimal' for f in fields)


def needs_local_datetime_import(fields: list) -> bool:
    return any(f['java_type'] == 'LocalDateTime' for f in fields)


def needs_local_date_import(fields: list) -> bool:
    return any(f['java_type'] == 'LocalDate' for f in fields)


def needs_local_time_import(fields: list) -> bool:
    return any(f['java_type'] == 'LocalTime' for f in fields)


# ── DDL 解析 ────────────────────────────────────────────────────────────────

def parse_ddl(sql: str) -> list[dict]:
    """
    解析 DDL 中所有 CREATE TABLE 语句。
    返回 [{'table': str, 'comment': str, 'columns': [{name, sql_type, java_type, comment, nullable, enum_candidate, yes_no, json_dto, table_field}]}]
    """
    tables = []

    # 提取每个 CREATE TABLE 块
    pattern = re.compile(
        r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\((.*?)\)\s*(?:ENGINE\s*=.*?)?(?:COMMENT\s*=\s*\'(.*?)\')?(?:;|$)',
        re.IGNORECASE | re.DOTALL
    )

    for m in pattern.finditer(sql):
        table_name = m.group(1).strip('`')
        body       = m.group(2)
        table_comment = m.group(3) or ''

        columns = _parse_columns(body)
        tables.append({
            'table':   table_name,
            'comment': table_comment,
            'columns': columns,
        })

    return tables


def _parse_columns(body: str) -> list[dict]:
    """解析 CREATE TABLE 内部的列定义。"""
    columns = []
    lines = body.split('\n')

    for raw_line in lines:
        line = raw_line.strip().rstrip(',')
        if not line:
            continue
        # 跳过索引、主键约束行
        upper = line.upper()
        if any(upper.startswith(k) for k in (
                'PRIMARY', 'KEY', 'INDEX', 'UNIQUE', 'CONSTRAINT',
                'CHECK', 'FOREIGN', ')'
        )):
            continue
        # 解析列
        col = _parse_column_line(line)
        if col:
            columns.append(col)

    return columns


def _parse_column_line(line: str) -> Optional[dict]:
    """
    解析单列定义，例如：
      `status` tinyint(4) NOT NULL DEFAULT '0' COMMENT '状态：1-启用 2-停用'
    """
    # 提取 COMMENT
    comment = ''
    cm = re.search(r"COMMENT\s+'(.*?)'", line, re.IGNORECASE)
    if cm:
        comment = cm.group(1)
        line = line[:cm.start()].strip()

    # 列名（允许反引号）
    col_m = re.match(r'`?(\w+)`?\s+(.*)', line)
    if not col_m:
        return None

    col_name = col_m.group(1)
    rest = col_m.group(2).strip()

    # 跳过系统/元数据列（已在 BaseEntity）
    if col_name.lower() in BASE_ENTITY_COLS:
        return None

    # SQL 类型（取第一段）
    type_m = re.match(r'([\w]+(?:\s*\(\s*[\d,]+\s*\))?)', rest, re.IGNORECASE)
    sql_type = type_m.group(1) if type_m else 'varchar'

    java_type = sql_type_to_java(sql_type)
    camel_name = snake_to_camel(col_name)

    # 是否需要 @TableField（保留字）
    table_field = col_name.lower() in JAVA_RESERVED

    # 枚举候选：多值字段（type/status 等后缀）
    enum_candidate = any(col_name.lower().endswith(s) for s in ENUM_SUFFIXES)

    # 是否类字段（is_ 前缀）→ 提示复用 YesNo
    yes_no = col_name.lower().startswith('is_') or col_name.lower().endswith('_flag')

    # JSON DTO 字段（text 类型且 comment 含 JSON）
    json_dto = (sql_type.lower() in ('text', 'mediumtext', 'longtext')
                and 'json' in comment.lower())

    # nullable
    nullable = 'NOT NULL' not in rest.upper()

    return {
        'col_name':       col_name,
        'camel_name':     camel_name,
        'sql_type':       sql_type,
        'java_type':      java_type,
        'comment':        comment,
        'nullable':       nullable,
        'table_field':    table_field,
        'enum_candidate': enum_candidate,
        'yes_no':         yes_no,
        'json_dto':       json_dto,
    }


# ── 路径推断 ────────────────────────────────────────────────────────────────

def infer_service_name(service_root: str) -> str:
    """从 service_root 目录名推断服务名（如 assess/hire/system）。"""
    basename = os.path.basename(os.path.abspath(service_root))
    for name in ('system', 'platform', 'integration', 'hire', 'assess'):
        if name in basename.lower():
            return name
    return basename


def build_paths(service_root: str, service: str, domain: str) -> dict:
    """
    返回各文件的目标路径（绝对路径）。
    domain = PascalCase，如 JobConfig
    """
    root = os.path.abspath(service_root)
    base_pkg_path = os.path.join('src', 'main', 'java',
                                 BASE_GROUP.replace('.', os.sep),
                                 service)

    svc_module = os.path.join(root, f'{service}-service')
    web_module = os.path.join(root, f'{service}-web')

    svc_java = os.path.join(svc_module, base_pkg_path, 'service')
    web_java = os.path.join(web_module, base_pkg_path, 'web')

    return {
        'entity':      os.path.join(svc_java, 'entity',   f'{domain}Entity.java'),
        'mapper_java': os.path.join(svc_java, 'mapper',   f'{domain}Mapper.java'),
        'mapper_xml':  os.path.join(svc_module, 'src', 'main', 'resources',
                                    'mapper', f'{domain}Mapper.xml'),
        'service':     os.path.join(svc_java, 'service',  f'{domain}Service.java'),
        'service_impl':os.path.join(svc_java, 'service', 'impl', f'{domain}ServiceImpl.java'),
        'controller':  os.path.join(web_java, 'controller', f'{domain}Controller.java'),
        # 枚举放在字典外，按需追加
        'enums_dir':   os.path.join(svc_java, 'enums'),
        'pkg_service': f'{BASE_GROUP}.{service}.service',
        'pkg_web':     f'{BASE_GROUP}.{service}.web',
    }


# ── 代码生成 ────────────────────────────────────────────────────────────────

def gen_entity(table: dict, domain: str, pkg: str, author: str, today: str) -> str:
    cols = table['columns']
    table_name = table['table']
    table_comment = table['comment'] or domain

    imports = set()
    imports.add('com.baomidou.mybatisplus.annotation.TableName')
    imports.add('com.succaiss.commons.spring.mybatisplus.BaseEntity')
    imports.add('lombok.Data')
    imports.add('lombok.EqualsAndHashCode')
    imports.add('lombok.ToString')
    imports.add('lombok.experimental.Accessors')

    if needs_big_decimal_import(cols):
        imports.add('java.math.BigDecimal')
    if needs_local_datetime_import(cols):
        imports.add('java.time.LocalDateTime')
    if needs_local_date_import(cols):
        imports.add('java.time.LocalDate')
    if needs_local_time_import(cols):
        imports.add('java.time.LocalTime')
    if any(c['table_field'] for c in cols):
        imports.add('com.baomidou.mybatisplus.annotation.TableField')

    lines = [f'package {pkg}.entity;', '']
    for imp in sorted(imports):
        lines.append(f'import {imp};')
    lines.append('')

    lines += [
        f'/**',
        f' * {table_comment} 实体。',
        f' *',
        f' * @author {author} and AI({get_tool_model()})',
        f' * @since {today}',
        f' */',
        '@Data',
        '@Accessors(chain = true)',
        '@ToString(callSuper = true)',
        '@EqualsAndHashCode(callSuper = true)',
        f'@TableName("{table_name}")',
        f'public class {domain}Entity extends BaseEntity {{',
        '',
    ]

    for col in cols:
        if col['comment']:
            lines.append(f'    /** {col["comment"]} */')
        if col['table_field']:
            lines.append(f'    @TableField("{col["col_name"]}")')
        lines.append(f'    private {col["java_type"]} {col["camel_name"]};')
        lines.append('')

    lines.append('}')
    return '\n'.join(lines)


def gen_enum(col: dict, domain: str, pkg: str, author: str, today: str) -> tuple[str, str]:
    """
    生成枚举类。返回 (文件名, 内容)。
    """
    # 枚举名：去掉列名后缀，拼 domain
    suffix_used = next((s for s in ENUM_SUFFIXES if col['col_name'].lower().endswith(s)), '_type')
    base = col['col_name'][:-len(suffix_used)]
    enum_domain = snake_to_pascal(base) if base else domain
    class_name = f'{enum_domain}{snake_to_pascal(suffix_used.lstrip("_"))}Enum'
    # 解析枚举项（从 COMMENT 中提取 "1-描述 2-描述" 模式）
    entries = _parse_enum_comment(col['comment'])

    lines = [
        f'package {pkg}.enums;',
        '',
        'import com.succaiss.commons.base.enums.BaseEnum;',
        'import lombok.AllArgsConstructor;',
        'import lombok.Getter;',
        '',
        f'/**',
        f' * {col["comment"] or class_name}。',
        f' *',
        f' * @author {author} and AI({get_tool_model()})',
        f' * @since {today}',
        f' */',
        '@Getter',
        '@AllArgsConstructor',
        f'public enum {class_name} implements BaseEnum<Integer, String> {{',
        '',
    ]

    if entries:
        for code, desc in entries:
            lines.append(f'    /** {desc} */')
            const_name = re.sub(r'[^A-Z0-9_]', '', re.sub(r'[^a-zA-Z0-9]', '_', desc).upper())
            const_name = const_name or f'VALUE_{code}'
            lines.append(f'    {const_name}({code}, "{desc}"),')
            lines.append('')
    else:
        lines.append(f'    // TODO：根据业务补充枚举项')
        lines.append(f'    // EXAMPLE(1, "示例"),')
        lines.append('')

    lines += [
        '    ;',
        '',
        '    private final Integer code;',
        '    private final String  desc;',
        '}',
    ]

    return f'{class_name}.java', '\n'.join(lines)


def _parse_enum_comment(comment: str) -> list[tuple[int, str]]:
    """从 comment 中解析 '1-描述 2-描述' 格式的枚举项。"""
    pattern = re.compile(r'(\d+)\s*[-：:]\s*([^，。；,\d]+)')
    results = []
    for m in pattern.finditer(comment):
        code = int(m.group(1))
        desc = m.group(2).strip()
        if desc:
            results.append((code, desc))
    return results


def gen_mapper_java(table: dict, domain: str, pkg: str, author: str, today: str) -> str:
    lines = [
        f'package {pkg}.mapper;',
        '',
        'import com.baomidou.mybatisplus.core.mapper.BaseMapper;',
        f'import {pkg}.entity.{domain}Entity;',
        'import org.apache.ibatis.annotations.Mapper;',
        '',
        f'/**',
        f' * {table["comment"] or domain} Mapper 接口。',
        f' *',
        f' * @author {author} and AI({get_tool_model()})',
        f' * @since {today}',
        f' */',
        '@Mapper',
        f'public interface {domain}Mapper extends BaseMapper<{domain}Entity> {{',
        '',
        '}',
    ]
    return '\n'.join(lines)


def gen_mapper_xml(table: dict, domain: str, pkg: str) -> str:
    """生成 Mapper XML，resultMap 包含所有字段（含 BaseEntity 公共字段）。"""
    table_name = table['table']
    cols = table['columns']

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"',
        '        "http://mybatis.org/dtd/mybatis-3-mapper.dtd">',
        f'<mapper namespace="{pkg}.mapper.{domain}Mapper">',
        '',
        f'    <resultMap id="BaseResultMap" type="{pkg}.entity.{domain}Entity">',
    ]

    # BaseEntity 公共字段
    for col_name, field_name, java_type in BASE_ENTITY_RESULT_COLS:
        if col_name == 'id':
            lines.append(f'        <id  column="{col_name}" property="{field_name}" />')
        else:
            lines.append(f'        <result column="{col_name}" property="{field_name}" />')

    # 业务字段
    for col in cols:
        lines.append(f'        <result column="{col["col_name"]}" property="{col["camel_name"]}" />')

    lines += [
        '    </resultMap>',
        '',
        f'    <sql id="Base_Column_List">',
        '        <!-- 明确列出字段，禁止 SELECT * -->',
    ]

    all_cols = (
        [c for c, _, _ in BASE_ENTITY_RESULT_COLS]
        + [c['col_name'] for c in cols]
    )
    # 分组展示，每行约 80 字符
    chunk_lines = []
    chunk = []
    length = 0
    for c in all_cols:
        segment = c + ', '
        length += len(segment)
        chunk.append(c)
        if length > 80:
            chunk_lines.append('        ' + ', '.join(chunk))
            chunk = []
            length = 0
    if chunk:
        chunk_lines.append('        ' + ', '.join(chunk))

    lines += chunk_lines
    lines += [
        '    </sql>',
        '',
        '</mapper>',
    ]
    return '\n'.join(lines)


def gen_service_java(table: dict, domain: str, pkg: str, author: str, today: str) -> str:
    comment = table['comment'] or domain
    camel = snake_to_camel(domain)

    lines = [
        f'package {pkg}.service;',
        '',
        f'import {pkg}.dto.{domain}DTO;',
        f'import com.succaiss.commons.spring.model.PageResult;',
        '',
        f'/**',
        f' * {comment} Service 接口。',
        f' *',
        f' * @author {author} and AI({get_tool_model()})',
        f' * @since {today}',
        f' */',
        f'public interface {domain}Service {{',
        '',
        f'    /**',
        f'     * 新增{comment}。',
        f'     *',
        f'     * @param dto 请求参数',
        f'     * @return 新记录 ID',
        f'     */',
        f'    Long create({domain}DTO dto);',
        '',
        f'    /**',
        f'     * 更新{comment}。',
        f'     *',
        f'     * @param id  记录 ID',
        f'     * @param dto 请求参数',
        f'     */',
        f'    void update(Long id, {domain}DTO dto);',
        '',
        f'    /**',
        f'     * 删除{comment}。',
        f'     *',
        f'     * @param id 记录 ID',
        f'     */',
        f'    void remove(Long id);',
        '',
        f'    /**',
        f'     * 查询{comment}详情。',
        f'     *',
        f'     * @param id 记录 ID',
        f'     * @return DTO',
        f'     */',
        f'    {domain}DTO getById(Long id);',
        '',
        f'    /**',
        f'     * 分页查询{comment}列表。',
        f'     *',
        f'     * @param pageNum  页码（从 1 开始）',
        f'     * @param pageSize 每页条数（最大 100）',
        f'     * @return 分页结果',
        f'     */',
        f'    PageResult<{domain}DTO> list(int pageNum, int pageSize);',
        '',
        '}',
    ]
    return '\n'.join(lines)


def gen_service_impl(table: dict, domain: str, pkg: str, author: str, today: str) -> str:
    comment = table['comment'] or domain
    camel = snake_to_camel(domain)

    lines = [
        f'package {pkg}.service.impl;',
        '',
        'import com.baomidou.mybatisplus.extension.plugins.pagination.Page;',
        'import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;',
        f'import {pkg}.convert.{domain}Convert;',
        f'import {pkg}.dto.{domain}DTO;',
        f'import {pkg}.entity.{domain}Entity;',
        f'import {pkg}.mapper.{domain}Mapper;',
        f'import {pkg}.service.{domain}Service;',
        'import com.succaiss.commons.spring.model.PageResult;',
        'import lombok.extern.slf4j.Slf4j;',
        'import org.springframework.stereotype.Service;',
        'import javax.annotation.Resource;',
        'import java.util.List;',
        '',
        f'/**',
        f' * {comment} Service 实现。',
        f' *',
        f' * @author {author} and AI({get_tool_model()})',
        f' * @since {today}',
        f' */',
        '@Slf4j',
        '@Service',
        f'public class {domain}ServiceImpl',
        f'        extends ServiceImpl<{domain}Mapper, {domain}Entity>',
        f'        implements {domain}Service {{',
        '',
        '    @Resource',
        f'    private {domain}Convert {camel}Convert;',
        '',
        '    @Override',
        f'    public Long create({domain}DTO dto) {{',
        f'        log.info("{comment} - 创建 - 开始: dto = {{}}", dto);',
        f'        {domain}Entity entity = {camel}Convert.toEntity(dto);',
        f'        save(entity);',
        f'        log.info("{comment} - 创建 - 成功: id = {{}}", entity.getId());',
        f'        return entity.getId();',
        f'    }}',
        '',
        '    @Override',
        f'    public void update(Long id, {domain}DTO dto) {{',
        f'        log.info("{comment} - 更新 - 开始: id = {{}}, dto = {{}}", id, dto);',
        f'        {domain}Entity entity = findByIdOrThrow(id);',
        f'        {camel}Convert.copyToEntity(dto, entity);',
        f'        updateById(entity);',
        f'        log.info("{comment} - 更新 - 成功: id = {{}}", id);',
        f'    }}',
        '',
        '    @Override',
        f'    public void remove(Long id) {{',
        f'        log.info("{comment} - 删除 - 开始: id = {{}}", id);',
        f'        findByIdOrThrow(id);',
        f'        removeById(id);',
        f'        log.info("{comment} - 删除 - 成功: id = {{}}", id);',
        f'    }}',
        '',
        '    @Override',
        f'    public {domain}DTO getById(Long id) {{',
        f'        {domain}Entity entity = findByIdOrThrow(id);',
        f'        return {camel}Convert.toDTO(entity);',
        f'    }}',
        '',
        '    @Override',
        f'    public PageResult<{domain}DTO> list(int pageNum, int pageSize) {{',
        f'        pageSize = Math.min(pageSize, 100);',
        f'        Page<{domain}Entity> page = lambdaQuery()',
        f'                .orderByDesc({domain}Entity::getId)',
        f'                .page(new Page<>(pageNum, pageSize));',
        f'        List<{domain}DTO> dtos = page.getRecords().stream()',
        f'                .map({camel}Convert::toDTO)',
        f'                .toList();',
        f'        return PageResult.of(page.getTotal(), dtos);',
        f'    }}',
        '',
        '    // ── 私有辅助方法 ────────────────────────────────────────────────',
        '',
        f'    private {domain}Entity findByIdOrThrow(Long id) {{',
        f'        {domain}Entity entity = getById(id);',
        f'        if (entity == null) {{',
        f'            throw new com.succaiss.commons.base.exception.BusinessException(',
        f'                    // TODO：替换为对应的 ErrorCode',
        f'                    com.succaiss.commons.base.enums.CommonErrorCode.DATA_NOT_FOUND',
        f'            );',
        f'        }}',
        f'        return entity;',
        f'    }}',
        '',
        '}}',
    ]
    return '\n'.join(lines)


def gen_controller(table: dict, domain: str, pkg_web: str, pkg_service: str,
                   author: str, today: str) -> str:
    comment = table['comment'] or domain
    camel = snake_to_camel(domain)
    # URL 路径：PascalCase → kebab-case
    url_path = re.sub(r'(?<!^)(?=[A-Z])', '-', domain).lower()

    lines = [
        f'package {pkg_web}.controller;',
        '',
        f'import {pkg_service}.dto.{domain}DTO;',
        f'import {pkg_service}.service.{domain}Service;',
        'import com.succaiss.commons.spring.model.PageResult;',
        'import com.succaiss.commons.spring.model.Result;',
        'import io.swagger.v3.oas.annotations.Operation;',
        'import io.swagger.v3.oas.annotations.tags.Tag;',
        'import lombok.RequiredArgsConstructor;',
        'import org.springframework.validation.annotation.Validated;',
        'import org.springframework.web.bind.annotation.*;',
        '',
        f'/**',
        f' * {comment} 接口。',
        f' *',
        f' * @author {author} and AI({get_tool_model()})',
        f' * @since {today}',
        f' */',
        f'@Tag(name = "{comment}")',
        '@RestController',
        f'@RequestMapping("/{url_path}")',
        '@RequiredArgsConstructor',
        f'public class {domain}Controller {{',
        '',
        f'    private final {domain}Service {camel}Service;',
        '',
        '    @Operation(summary = "TODO - 新增")',
        '    @PostMapping',
        f'    public Result<Long> create(@RequestBody @Validated {domain}DTO dto) {{',
        f'        return Result.ok({camel}Service.create(dto));',
        '    }',
        '',
        '    @Operation(summary = "TODO - 更新")',
        '    @PutMapping("/{id}")',
        f'    public Result<Void> update(@PathVariable("id") Long id,',
        f'                               @RequestBody @Validated {domain}DTO dto) {{',
        f'        {camel}Service.update(id, dto);',
        '        return Result.ok();',
        '    }',
        '',
        '    @Operation(summary = "TODO - 删除")',
        '    @DeleteMapping("/{id}")',
        f'    public Result<Void> remove(@PathVariable("id") Long id) {{',
        f'        {camel}Service.remove(id);',
        '        return Result.ok();',
        '    }',
        '',
        '    @Operation(summary = "TODO - 详情")',
        '    @GetMapping("/{id}")',
        f'    public Result<{domain}DTO> getById(@PathVariable("id") Long id) {{',
        f'        return Result.ok({camel}Service.getById(id));',
        '    }',
        '',
        '    @Operation(summary = "TODO - 分页列表")',
        '    @GetMapping',
        f'    public Result<PageResult<{domain}DTO>> list(',
        '            @RequestParam(defaultValue = "1")  int pageNum,',
        '            @RequestParam(defaultValue = "20") int pageSize) {',
        f'        return Result.ok({camel}Service.list(pageNum, pageSize));',
        '    }',
        '',
        '}',
    ]
    return '\n'.join(lines)


# ── 文件写入 ────────────────────────────────────────────────────────────────

def write_file(path: str, content: str, dry_run: bool, overwrite: bool) -> str:
    """写入文件，返回状态标记：'written' / 'skipped' / 'dry'。"""
    if dry_run:
        print(f'{CYAN}── [DRY-RUN] {os.path.relpath(path)}{NC}')
        print(content)
        print()
        return 'dry'
    if os.path.exists(path) and not overwrite:
        print(f'{YELLOW}  ⟳ 已存在，跳过：{os.path.relpath(path)}{NC}')
        return 'skipped'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Path(path).write_text(content, encoding='utf-8')
    print(f'{GREEN}  ✅ 已生成：{os.path.relpath(path)}{NC}')
    return 'written'


# ── 主流程 ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='从 DDL 一键生成 Java 微服务全链路代码骨架',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('service_root',
                        help='服务根目录（如 ~/IdeaProjects/assess）')
    parser.add_argument('--ddl', required=True,
                        help='DDL SQL 文件路径')
    parser.add_argument('--service',
                        help='服务名（assess/hire/system/platform/integration），默认自动推断')
    parser.add_argument('--domain',
                        help='只生成指定表的代码（PascalCase，如 Question），不指定则全部生成')
    parser.add_argument('--dry-run', action='store_true',
                        help='只打印，不写入文件')
    parser.add_argument('--overwrite', action='store_true',
                        help='覆盖已存在的文件（默认跳过）')
    args = parser.parse_args()

    service_root = os.path.expanduser(args.service_root)
    if not os.path.isdir(service_root):
        print(f'{RED}❌ 路径不存在：{service_root}{NC}')
        sys.exit(1)

    ddl_path = os.path.expanduser(args.ddl)
    if not os.path.isfile(ddl_path):
        print(f'{RED}❌ DDL 文件不存在：{ddl_path}{NC}')
        sys.exit(1)

    service = args.service or infer_service_name(service_root)
    author  = get_git_author()
    today   = today_str()

    sql_content = Path(ddl_path).read_text(encoding='utf-8', errors='replace')
    tables = parse_ddl(sql_content)

    if not tables:
        print(f'{YELLOW}🟡 未解析到 CREATE TABLE 语句，请检查 DDL 文件格式。{NC}')
        sys.exit(0)

    print(f'\n{BOLD}╔══════════════════════════════════════════╗{NC}')
    print(f'{BOLD}║        DDL → 全链路代码生成器           ║{NC}')
    print(f'{BOLD}╚══════════════════════════════════════════╝{NC}')
    print(f'  服务根目录：{service_root}')
    print(f'  服务名称  ：{service}')
    print(f'  DDL 文件  ：{ddl_path}')
    print(f'  解析表数  ：{len(tables)}')
    if args.domain:
        print(f'  筛选 Domain：{args.domain}')
    print()

    total_written = 0
    total_skipped = 0

    for table in tables:
        table_name = table['table']
        domain = snake_to_pascal(table_name)

        # 筛选
        if args.domain and domain.lower() != args.domain.lower():
            continue

        comment = table['comment'] or table_name
        print(f'{BOLD}── 表：{table_name}（{comment}）→ Domain：{domain}{NC}')

        paths = build_paths(service_root, service, domain)
        pkg_svc = paths['pkg_service']
        pkg_web = paths['pkg_web']

        # 1. Entity
        entity_code = gen_entity(table, domain, pkg_svc, author, today)
        r = write_file(paths['entity'], entity_code, args.dry_run, args.overwrite)
        if r == 'written': total_written += 1
        elif r == 'skipped': total_skipped += 1

        # 2. Enum（多值字段）
        for col in table['columns']:
            if col['enum_candidate'] and not col['yes_no']:
                enum_name, enum_code = gen_enum(col, domain, pkg_svc, author, today)
                enum_path = os.path.join(paths['enums_dir'], enum_name)
                r = write_file(enum_path, enum_code, args.dry_run, args.overwrite)
                if r == 'written': total_written += 1
                elif r == 'skipped': total_skipped += 1

        # YesNo 字段提示
        yes_no_cols = [c for c in table['columns'] if c['yes_no']]
        if yes_no_cols:
            col_names = ', '.join(c['col_name'] for c in yes_no_cols)
            print(f'{YELLOW}  🟡 建议：字段 [{col_names}] 使用 YesNo 枚举，已在 Entity 中生成为 Integer，'
                  f'请手工改为 YesNo 类型并添加 @link YesNo 注释{NC}')

        # 3. Mapper.java
        mapper_java_code = gen_mapper_java(table, domain, pkg_svc, author, today)
        r = write_file(paths['mapper_java'], mapper_java_code, args.dry_run, args.overwrite)
        if r == 'written': total_written += 1
        elif r == 'skipped': total_skipped += 1

        # 4. Mapper.xml
        mapper_xml_code = gen_mapper_xml(table, domain, pkg_svc)
        r = write_file(paths['mapper_xml'], mapper_xml_code, args.dry_run, args.overwrite)
        if r == 'written': total_written += 1
        elif r == 'skipped': total_skipped += 1

        # 5. Service.java
        service_code = gen_service_java(table, domain, pkg_svc, author, today)
        r = write_file(paths['service'], service_code, args.dry_run, args.overwrite)
        if r == 'written': total_written += 1
        elif r == 'skipped': total_skipped += 1

        # 6. ServiceImpl.java
        impl_code = gen_service_impl(table, domain, pkg_svc, author, today)
        r = write_file(paths['service_impl'], impl_code, args.dry_run, args.overwrite)
        if r == 'written': total_written += 1
        elif r == 'skipped': total_skipped += 1

        # 7. Controller.java
        ctrl_code = gen_controller(table, domain, pkg_web, pkg_svc, author, today)
        r = write_file(paths['controller'], ctrl_code, args.dry_run, args.overwrite)
        if r == 'written': total_written += 1
        elif r == 'skipped': total_skipped += 1

        print()

    print(f'{BOLD}╔══════════════════════════════════════════╗{NC}')
    print(f'{BOLD}║                 生成完成                ║{NC}')
    print(f'{BOLD}╚══════════════════════════════════════════╝{NC}')
    print(f'  生成：{total_written} 个文件  跳过：{total_skipped} 个文件')
    if total_written > 0 and not args.dry_run:
        print()
        print(f'{GREEN}  后续必做：{NC}')
        print('  1. 补充 DTO / VO / Convert（运行 generate-convert.py 自动生成 Convert）')
        print('  2. 将枚举中 TODO 注释替换为实际枚举项')
        print('  3. 将 ServiceImpl 中 CommonErrorCode.DATA_NOT_FOUND 替换为对应业务 ErrorCode')
        print('  4. Controller @Operation summary 补充业务含义')
        print('  5. 执行 java-code-review skill 完成代码审查')
    print()


if __name__ == '__main__':
    main()
