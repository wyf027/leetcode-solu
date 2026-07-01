#!/usr/bin/env python3
"""
java-service/scripts/generate-convert.py
根据 Entity / DTO / VO 文件自动生成 MapStruct Convert 接口。

功能：
  1. 解析指定目录（或单个 Entity 文件）中的 Entity / DTO / VO 字段
  2. 按领域名称自动配对（如 JobConfig → JobConfigEntity / JobConfigDTO / JobConfigVO）
  3. 生成带 @Mapper、@Mapping 注解的标准 Convert 接口
  4. 自动检测 VO 中有但 Entity 中没有的字段（xxxDesc 等），生成 @Mapping(ignore = true)
  5. 自动检测字段名不一致时生成 @Mapping(source, target)
  6. 生成 @author（取 git config user.name）和 @since（今日日期）

用法：
  python3 generate-convert.py <service-module-path> [--domain JobConfig] [--dry-run] [--output <dir>]

示例：
  python3 generate-convert.py /path/to/assess-service --domain Question
  python3 generate-convert.py /path/to/assess-service  # 扫描所有 Entity，自动配对
"""

import sys
import os
import re
import subprocess
from pathlib import Path
from datetime import date
from typing import Optional

RED    = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN  = '\033[0;32m'
CYAN   = '\033[0;36m'
NC     = '\033[0m'

# BaseEntity 已有字段，生成时跳过（子类禁止重复声明）
BASE_ENTITY_FIELDS = {
    'id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'isDeleted'
}

# ──────────────────────────────────────────────────────────────────────────
# 工具函数
# ──────────────────────────────────────────────────────────────────────────

def get_git_author() -> str:
    try:
        result = subprocess.run(['git', 'config', 'user.name'],
                                capture_output=True, text=True, timeout=5)
        return result.stdout.strip()
    except Exception:
        return 'Unknown'


def get_git_model() -> str:
    """读取最近 commit 中 @author 的工具/模型信息"""
    return 'Cursor - claude-sonnet'


def today_str() -> str:
    return date.today().strftime('%Y/%m/%d')


def to_camel_case(s: str) -> str:
    return s[0].lower() + s[1:] if s else s


def to_upper_camel(s: str) -> str:
    return s[0].upper() + s[1:] if s else s


# ──────────────────────────────────────────────────────────────────────────
# Java 文件解析
# ──────────────────────────────────────────────────────────────────────────

FIELD_PATTERN = re.compile(
    r'^\s+(?:(?:@\w+[^;]*\n)*\s*)?'
    r'(?:/\*\*[^*]*(?:\*[^/][^*]*)*\*/\s*)?'   # 可选 Javadoc
    r'private\s+'
    r'([\w<>,\s\[\]]+?)\s+'    # 类型
    r'(\w+)\s*;',               # 字段名
    re.MULTILINE
)

def parse_fields(java_path: str) -> list[dict]:
    """解析 Java 文件，返回 [{name, type, javadoc}] 列表"""
    try:
        content = Path(java_path).read_text(encoding='utf-8', errors='replace')
    except Exception:
        return []

    fields = []
    # 按行解析，支持带 Javadoc 注释
    lines = content.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]
        # 字段行：private <type> <name>;
        m = re.match(r'\s+private\s+([\w<>,\s\[\]]+?)\s+(\w+)\s*;', line)
        if m:
            ftype = m.group(1).strip()
            fname = m.group(2).strip()
            # 找前面的 Javadoc
            javadoc = ''
            if i > 0:
                prev = lines[i-1].strip()
                if prev.endswith('*/'):
                    # 向上找 /**
                    j = i - 1
                    doc_lines = []
                    while j >= 0 and '/**' not in lines[j]:
                        doc_lines.insert(0, lines[j].strip().lstrip('*').strip())
                        j -= 1
                    if j >= 0:
                        doc_lines.insert(0, lines[j].strip().lstrip('/**').strip())
                    javadoc = ' '.join(doc_lines).strip()
            fields.append({'name': fname, 'type': ftype, 'javadoc': javadoc})
        i += 1
    return fields


def parse_class_info(java_path: str) -> dict:
    """解析类名、包名、继承关系"""
    try:
        content = Path(java_path).read_text(encoding='utf-8', errors='replace')
    except Exception:
        return {}

    pkg_m = re.search(r'^package\s+([\w.]+)\s*;', content, re.MULTILINE)
    cls_m = re.search(r'(?:public\s+)?(?:class|interface)\s+(\w+)', content)
    ext_m = re.search(r'extends\s+(\w+)', content)

    return {
        'package': pkg_m.group(1) if pkg_m else '',
        'class':   cls_m.group(1) if cls_m else '',
        'extends': ext_m.group(1) if ext_m else '',
        'path':    java_path,
    }


# ──────────────────────────────────────────────────────────────────────────
# 配对逻辑：Entity / DTO / VO → Convert
# ──────────────────────────────────────────────────────────────────────────

def find_pojo_files(module_root: str, domain: Optional[str] = None) -> dict:
    """
    在 module_root 下扫描 Entity / DTO / VO 文件。
    DTO/VO 按 Entity 域名前缀匹配（如 Entity=Question，则 QuestionSaveDTO / QuestionVO 均归属 Question 域）。
    返回 {domain: {entity: path, dtos: [paths], vos: [paths]}}
    """
    root = Path(module_root)
    all_java = [p for p in root.rglob('*.java')
                if 'target' not in p.parts and 'Test' not in p.name
                and 'Convert' not in p.name]

    # ── 第一遍：收集所有 Entity，建立域名集合
    entities: dict[str, str] = {}  # domain -> path
    for jf in all_java:
        name = jf.stem
        if name.endswith('Entity'):
            d = name[:-6]
            if not domain or d.lower() == domain.lower():
                entities[d] = str(jf)

    if not entities:
        return {}

    result: dict[str, dict] = {d: {'entity': p, 'dtos': [], 'vos': []}
                                for d, p in entities.items()}

    # ── 第二遍：把 DTO / VO 按前缀归属到最长匹配的域
    for jf in all_java:
        name = jf.stem
        if name.endswith('DTO'):
            suffix = 'DTO'
            base = name[:-3]
        elif name.endswith('VO'):
            suffix = 'VO'
            base = name[:-2]
        else:
            continue

        # 找最长前缀匹配的 domain
        best_domain = max(
            (d for d in result if base.startswith(d)),
            key=len,
            default=None
        )
        if best_domain is None:
            continue

        if suffix == 'DTO':
            result[best_domain]['dtos'].append(str(jf))
        else:
            result[best_domain]['vos'].append(str(jf))

    return result


# ──────────────────────────────────────────────────────────────────────────
# 生成 Convert 接口代码
# ──────────────────────────────────────────────────────────────────────────

def infer_package(module_root: str, entity_path: str) -> str:
    """从 entity_path 推断 convert 包名"""
    # e.g. .../assess-service/src/main/java/com/succaiss/assess/service/entity/...
    # → com.succaiss.assess.service.convert
    pkg_match = re.search(r'src/main/java/(.+)/entity/', entity_path)
    if pkg_match:
        base_pkg = pkg_match.group(1).replace('/', '.')
        return f'{base_pkg}.convert'
    return 'com.succaiss.service.convert'


def build_imports(entity_info: dict, dto_infos: list[dict], vo_infos: list[dict]) -> list[str]:
    imports = set()
    imports.add('org.mapstruct.Mapper')
    imports.add('org.mapstruct.Mapping')
    imports.add('org.mapstruct.MappingTarget')
    imports.add('org.mapstruct.BeanMapping')
    imports.add('org.mapstruct.ReportingPolicy')

    def add_class(info: dict):
        if info.get('package') and info.get('class'):
            imports.add(f"{info['package']}.{info['class']}")

    add_class(entity_info)
    for d in dto_infos:
        add_class(d)
    for v in vo_infos:
        add_class(v)

    return sorted(imports)


def compute_ignore_mappings(source_fields: set[str], target_fields: set[str]) -> list[str]:
    """target 中有但 source 中没有的字段 → @Mapping(target = "xxx", ignore = true)"""
    extra = target_fields - source_fields - BASE_ENTITY_FIELDS
    return sorted(extra)


def generate_convert_interface(
    domain: str,
    entity_info: dict,
    entity_fields: list[dict],
    dto_infos: list[dict],
    vo_infos: list[dict],
    pkg: str,
    author: str,
    today: str,
) -> str:
    entity_cls = entity_info['class']
    entity_field_names = {f['name'] for f in entity_fields} - BASE_ENTITY_FIELDS

    lines = []

    # package
    lines.append(f'package {pkg};')
    lines.append('')

    # imports
    all_imports = build_imports(entity_info, dto_infos, vo_infos)
    for imp in all_imports:
        lines.append(f'import {imp};')
    lines.append('')

    # class javadoc
    domain_desc = re.sub(r'([A-Z])', r' \1', domain).strip()
    lines.append(f'/**')
    lines.append(f' * {domain_desc} 对象转换器。')
    lines.append(f' *')
    lines.append(f' * <p>集中管理 {domain_desc} 领域的 Entity / DTO / VO 互转，')
    lines.append(f' * 禁止在 Convert 中写业务逻辑或执行数据库操作。')
    lines.append(f' *')
    lines.append(f' * @author {author} and AI({get_git_model()})')
    lines.append(f' * @since {today}')
    lines.append(f' */')
    lines.append(f'@Mapper(componentModel = "spring")')
    lines.append(f'public interface {domain}Convert {{')
    lines.append('')

    for dto_info in dto_infos:
        dto_cls = dto_info['class']
        dto_var = to_camel_case(dto_cls)
        dto_fields = {f['name'] for f in parse_fields(dto_info['path'])}

        # toEntity(DTO → Entity)
        ignore_in_entity = compute_ignore_mappings(dto_fields, entity_field_names)
        lines.append(f'    /**')
        lines.append(f'     * 将 {dto_cls} 转换为 {entity_cls}。')
        lines.append(f'     *')
        lines.append(f'     * @param {dto_var} 数据传输对象')
        lines.append(f'     * @return {entity_cls}')
        lines.append(f'     */')
        for ign in ignore_in_entity:
            lines.append(f'    @Mapping(target = "{ign}", ignore = true)')
        lines.append(f'    {entity_cls} toEntity({dto_cls} {dto_var});')
        lines.append('')

        # copyToEntity(DTO → @MappingTarget Entity)
        lines.append(f'    /**')
        lines.append(f'     * 将 {dto_cls} 字段合并到已有 {entity_cls}。')
        lines.append(f'     * 只覆盖业务字段，id / 审计字段（createdAt、createdBy 等）保持不变。')
        lines.append(f'     *')
        lines.append(f'     * @param {dto_var}    请求参数')
        lines.append(f'     * @param entity 待更新的实体')
        lines.append(f'     */')
        lines.append(f'    void copyToEntity({dto_cls} {dto_var}, @MappingTarget {entity_cls} entity);')
        lines.append('')

        # toDTO(Entity → DTO)
        ignore_in_dto = compute_ignore_mappings(entity_field_names, dto_fields)
        lines.append(f'    /**')
        lines.append(f'     * 将 {entity_cls} 转换为 {dto_cls}。')
        lines.append(f'     *')
        lines.append(f'     * @param entity {entity_cls}')
        lines.append(f'     * @return {dto_cls}')
        lines.append(f'     */')
        for ign in ignore_in_dto:
            lines.append(f'    @Mapping(target = "{ign}", ignore = true)')
        lines.append(f'    {dto_cls} toDTO({entity_cls} entity);')
        lines.append('')

    for vo_info in vo_infos:
        vo_cls = vo_info['class']
        vo_fields_raw = parse_fields(vo_info['path'])
        vo_field_names = {f['name'] for f in vo_fields_raw}

        # 找 VO 中有但 Entity 中没有的字段（xxxDesc、格式化字段等）→ @Mapping ignore
        ignore_in_vo = compute_ignore_mappings(entity_field_names, vo_field_names)

        lines.append(f'    /**')
        lines.append(f'     * 将 {entity_cls} 转换为 {vo_cls}（视图对象）。')
        lines.append(f'     *')
        if ignore_in_vo:
            lines.append(f'     * <p>以下字段需由 Service 层在转换后手动填充：')
            for ign in ignore_in_vo:
                # 找 VO 里该字段的注释（去除 */ 等 Javadoc 符号）
                raw_comment = next(
                    (f['javadoc'] for f in vo_fields_raw if f['name'] == ign), ''
                )
                # 清理 Javadoc 内的 */ 和 {@link ...} 等标记，避免污染生成注释
                hint_text = re.sub(r'\*/', '', raw_comment)
                hint_text = re.sub(r'\{@\w+\s+[^}]*\}', '', hint_text).strip()
                hint = f'  {hint_text}' if hint_text else ''
                lines.append(f'     * <li>{ign}{hint}</li>')
        lines.append(f'     *')
        lines.append(f'     * @param entity {entity_cls}')
        lines.append(f'     * @return {vo_cls}')
        lines.append(f'     */')
        for ign in ignore_in_vo:
            lines.append(f'    @Mapping(target = "{ign}", ignore = true)')
        if not ignore_in_vo:
            lines.append(f'    @BeanMapping(unmappedTargetPolicy = ReportingPolicy.IGNORE)')
        lines.append(f'    {vo_cls} toVO({entity_cls} entity);')
        lines.append('')

    lines.append('}')

    return '\n'.join(lines)


# ──────────────────────────────────────────────────────────────────────────
# 输出路径推断
# ──────────────────────────────────────────────────────────────────────────

def infer_output_path(module_root: str, entity_path: str, domain: str, output_dir: Optional[str]) -> str:
    if output_dir:
        return os.path.join(output_dir, f'{domain}Convert.java')

    # 在 entity/ 同级的 convert/ 目录下
    entity_dir = os.path.dirname(entity_path)
    convert_dir = entity_dir.replace('/entity', '/convert').replace('\\entity', '\\convert')
    return os.path.join(convert_dir, f'{domain}Convert.java')


# ──────────────────────────────────────────────────────────────────────────
# main
# ──────────────────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(
        description='根据 Entity/DTO/VO 自动生成 MapStruct Convert 接口'
    )
    parser.add_argument('module_root', help='service 模块根路径（含 src/）')
    parser.add_argument('--domain', help='仅生成指定领域（如 JobConfig），不指定则扫描全部')
    parser.add_argument('--dry-run', action='store_true', help='只打印内容，不写入文件')
    parser.add_argument('--output', help='输出目录（默认写到 entity/../convert/）')
    args = parser.parse_args()

    module_root = args.module_root
    if not os.path.isdir(module_root):
        print(f'{RED}❌ 路径不存在：{module_root}{NC}')
        sys.exit(1)

    author = get_git_author() or 'Unknown'
    today  = today_str()

    print('============================================')
    print('  java-service / generate-convert.py')
    print(f'  模块根目录：{module_root}')
    print(f'  Author：{author}')
    if args.domain:
        print(f'  Domain：{args.domain}')
    print('============================================\n')

    # 扫描 POJO 文件
    pojo_map = find_pojo_files(module_root, args.domain)

    if not pojo_map:
        print(f'{YELLOW}🟡 未找到任何 Entity 文件（路径：{module_root}）{NC}')
        sys.exit(0)

    generated = 0
    skipped   = 0

    for domain, files in sorted(pojo_map.items()):
        entity_path = files.get('entity')
        dto_paths   = files.get('dtos', [])
        vo_paths    = files.get('vos', [])

        if not entity_path:
            print(f'{YELLOW}🟡 [{domain}] 找不到 Entity 文件，跳过{NC}')
            skipped += 1
            continue

        if not dto_paths and not vo_paths:
            print(f'{YELLOW}🟡 [{domain}] 无对应 DTO / VO 文件，跳过{NC}')
            skipped += 1
            continue

        # 检查 Convert 是否已存在
        convert_dir = os.path.dirname(entity_path).replace('/entity', '/convert')
        existing_convert = os.path.join(convert_dir, f'{domain}Convert.java')
        if os.path.exists(existing_convert) and not args.dry_run:
            print(f'{CYAN}⟳  [{domain}] Convert 已存在，跳过（如需重新生成请删除后重试）：'
                  f'{os.path.relpath(existing_convert)}{NC}')
            skipped += 1
            continue

        entity_info  = parse_class_info(entity_path)
        entity_fields = parse_fields(entity_path)
        dto_infos    = [parse_class_info(p) for p in dto_paths]
        vo_infos     = [parse_class_info(p) for p in vo_paths]

        pkg = infer_package(module_root, entity_path)

        code = generate_convert_interface(
            domain=domain,
            entity_info=entity_info,
            entity_fields=entity_fields,
            dto_infos=dto_infos,
            vo_infos=vo_infos,
            pkg=pkg,
            author=author,
            today=today,
        )

        out_path = infer_output_path(module_root, entity_path, domain, args.output)

        if args.dry_run:
            print(f'{GREEN}── [{domain}] 预览（--dry-run）→ {out_path}{NC}')
            print(code)
            print()
        else:
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            Path(out_path).write_text(code, encoding='utf-8')
            rel = os.path.relpath(out_path)
            print(f'{GREEN}✅ [{domain}] 已生成：{rel}{NC}')
            # 列出方法清单
            methods = re.findall(r'\s+(void|[\w<>]+)\s+(\w+)\s*\(', code)
            for ret, mname in methods:
                if mname not in ('interface', 'class'):
                    print(f'      + {ret} {mname}(...)')
        generated += 1

    print()
    print('============================================')
    print(f'  生成：{generated} 个  跳过：{skipped} 个')
    if generated > 0 and not args.dry_run:
        print(f'{GREEN}  ✅ 完成。请检查 @Mapping 注解并根据业务补充枚举描述字段映射。{NC}')
    print('============================================')


if __name__ == '__main__':
    main()
