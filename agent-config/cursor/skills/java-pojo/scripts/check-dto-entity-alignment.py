#!/usr/bin/env python3
"""
java-pojo/scripts/check-dto-entity-alignment.py
覆盖：
  PO-AL  字段对齐缺失（Convert 转换方向上 source 字段被 MapStruct 静默丢弃）
  PO-DUP DTO/VO 字段高度重复（应合并复用）

── PO-AL 检测逻辑（以 *Convert.java 为分析入口）────────────────────────────
  ① @Mapping 中 source/target 字段名在对应类里不存在        → ❌ ERROR（@Mapping 字段名写错）
  ② Entity→DTO 方向：source 字段未出现在 target，且无 @Mapping 覆盖
       dropped 数 ≥ 3 → ❌ ERROR（疑似批量遗漏）
       dropped 数 1~2 → 🟡 WARN（字段被静默丢弃，核实是否刻意）
  ③ DTO→VO 方向：同上，但阈值更宽松（VO 允许精简，≥ 5 才报 WARN）
  ④ void copyToEntity(DTO, @MappingTarget Entity) 方向同 DTO→Entity，规则同②

── PO-DUP 检测逻辑（扫描全部 DTO/VO 对）───────────────────────────────────
  ⑤ 两个 DTO（或两个 VO）字段重复率 ≥ 90%
       较小类 100% 包含于较大类 → ❌ ERROR（完全可以复用，必须合并）
       90% ≤ 重复率 < 100%     → 🟡 WARN（强烈建议合并为一个 DTO）
  ⑥ 类名含 Create/Save/Add vs Update/Edit/Modify 命名模式，且重复率 ≥ 70%
       → 🟡 WARN（符合团队"Create/Update 合并为一个 DTO"约定，须合并）

重复率计算：len(A∩B) / min(len(A), len(B))，排除 BaseEntity 公共字段后计算

跳过条件：
  - 有效字段数 < 3 的类（字段太少，比较无意义）
  - 不同类型之间不比较（dto 只与 dto 比，vo 只与 vo 比）
  - BaseEntity 公共字段（id/createdAt/updatedAt 等）不计入统计

用法：
  python3 check-dto-entity-alignment.py <java-file-or-dir>
  python3 check-dto-entity-alignment.py <dir> --files file1.java file2.java ...
"""

import sys
import os
import re
from dataclasses import dataclass, field
from typing import Optional

RED = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN = '\033[0;32m'
CYAN = '\033[0;36m'
NC = '\033[0m'

errors = 0
warnings = 0

# ── BaseEntity 继承字段，不计入"dropped"统计 ──────────────────────────────────
BASE_ENTITY_FIELDS = {
    'id', 'createdAt', 'updatedAt', 'createTime', 'updateTime',
    'createdBy', 'updatedBy', 'createBy', 'updateBy',
    'isDeleted', 'deleted', 'version',
    # MyBatis-Plus 约定的逻辑删除字段
    'delFlag', 'deleteFlag',
}

# ── VO 附加展示字段后缀，不计入"extra"警告 ───────────────────────────────────
VO_EXTRA_SUFFIXES = ('Desc', 'Name', 'Label', 'Text', 'Display', 'Format', 'Str')


# ─────────────────────────────────────────────────────────────────────────────
# 数据结构
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class MappingAnnotation:
    """单个 @Mapping 注解的解析结果。"""
    source: Optional[str] = None    # source = "xxx"
    target: Optional[str] = None    # target = "xxx"
    ignore: bool = False            # ignore = true
    has_value: bool = False         # constant / expression / defaultExpression 等


@dataclass
class ConvertMethod:
    """Convert 接口中单个转换方法。"""
    method_name: str
    source_type: str                # source 类名（简单名）
    target_type: str                # target 类名（简单名）
    is_list: bool = False           # 是否为列表转换（跳过）
    mappings: list = field(default_factory=list)  # list[MappingAnnotation]
    line_no: int = 0


@dataclass
class ClassInfo:
    """已解析的 Java 类信息。"""
    name: str
    path: str
    fields: set                     # set[str] 字段名集合
    kind: str = 'unknown'           # entity / dto / vo / other


# ─────────────────────────────────────────────────────────────────────────────
# 工具函数
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


def print_info(msg: str):
    print(f"{CYAN}ℹ  {msg}{NC}")


def strip_comments(content: str) -> str:
    """移除 Java 注释，保持行号对齐。"""
    content = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), content, flags=re.DOTALL)
    content = re.sub(r'//[^\n]*', '', content)
    return content


# ─────────────────────────────────────────────────────────────────────────────
# 字段提取（Entity / DTO / VO）
# ─────────────────────────────────────────────────────────────────────────────

# 匹配成员字段声明（非方法局部变量）
# 要求行首有缩进（至少 1 个空格/Tab），并有访问修饰符
_FIELD_RE = re.compile(
    r'^\s{1,}(?:private|protected)\s+'
    r'(?:(?:static|final|transient|volatile)\s+)*'
    r'([\w<>\[\]?,\s]+?)\s+'
    r'(\w+)\s*(?:;|=)',
    re.MULTILINE,
)

_STATIC_FIELD_RE = re.compile(r'\bstatic\b')


def extract_fields(content: str) -> set:
    """
    从 Java 源文件中提取成员字段名。
    策略：
    - 去除注释和字符串字面量（防止内容触发误匹配）
    - 匹配 private/protected 字段声明
    - 排除 static 字段（常量）
    - 排除 serialVersionUID
    """
    # 去除字符串字面量
    content = re.sub(r'"(?:[^"\\]|\\.)*"', '""', content)
    content = re.sub(r"'(?:[^'\\]|\\.)'", "''", content)
    content = strip_comments(content)

    fields = set()
    for m in _FIELD_RE.finditer(content):
        type_str = m.group(1)
        fname = m.group(2)
        if _STATIC_FIELD_RE.search(type_str):
            continue
        if fname == 'serialVersionUID':
            continue
        fields.add(fname)
    return fields


def classify_kind(file_name: str) -> str:
    """根据文件名推断 POJO 类型。"""
    name = os.path.basename(file_name)
    if name.endswith('Entity.java'):
        return 'entity'
    if name.endswith('DTO.java') or name.endswith('Request.java'):
        return 'dto'
    if name.endswith('VO.java') or name.endswith('Response.java'):
        return 'vo'
    return 'other'


def get_simple_name(file_name: str) -> str:
    return os.path.basename(file_name).replace('.java', '')


# ─────────────────────────────────────────────────────────────────────────────
# Convert 文件解析
# ─────────────────────────────────────────────────────────────────────────────

_MAPPING_RE = re.compile(r'@Mapping\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)', re.DOTALL)
_MAPPINGS_BLOCK_RE = re.compile(r'@Mappings\s*\(\s*\{(.*?)\}\s*\)', re.DOTALL)

_ATTR_RE = re.compile(r'(\w+)\s*=\s*"([^"]*)"')
_BOOL_ATTR_RE = re.compile(r'(\w+)\s*=\s*(true|false)')

_VALUE_KEYS = {'constant', 'expression', 'defaultValue', 'defaultExpression'}

# 方法签名：支持 List<T> 和普通 T 两种返回类型
_METHOD_SIG_RE = re.compile(
    r'(?:'
    r'List<(\w+)>\s+(\w+)\s*\((?:.*?)List<(\w+)>.*?\)'   # List → List
    r'|'
    r'(\w+)\s+(\w+)\s*\('                                  # T → ...
    r')',
    re.DOTALL,
)

# 参数列表提取
_PARAM_RE = re.compile(
    r'(?:@\w+(?:\([^)]*\))?\s+)*'   # 注解（如 @MappingTarget）
    r'(?:List<(\w+)>|(\w+))\s+\w+'  # List<Type> name 或 Type name
)


def parse_mapping_attrs(annotation_body: str) -> MappingAnnotation:
    """解析单个 @Mapping(...) 的属性。"""
    m = MappingAnnotation()
    for key, val in _ATTR_RE.findall(annotation_body):
        if key == 'source':
            m.source = val.split('.')[0] if '.' not in val else val  # 取第一段路径
        elif key == 'target':
            m.target = val.split('.')[0] if '.' not in val else val
        elif key in _VALUE_KEYS:
            m.has_value = True
    for key, val in _BOOL_ATTR_RE.findall(annotation_body):
        if key == 'ignore' and val == 'true':
            m.ignore = True
    return m


def collect_mappings_before(lines: list, method_line: int) -> list:
    """
    向上扫描 method_line 之前的 @Mapping / @Mappings 注解，返回 MappingAnnotation 列表。
    """
    mappings = []
    i = method_line - 1
    collected_text = []

    # 向上收集注解行（遇到非注解/非空/非Javadoc行停止）
    while i >= 0:
        stripped = lines[i].strip()
        if not stripped:
            i -= 1
            continue
        if stripped.startswith('@') or stripped.startswith('*') or stripped.startswith('/*') or stripped.startswith('*/'):
            collected_text.insert(0, lines[i])
            i -= 1
            continue
        break

    block = '\n'.join(collected_text)

    # 先处理 @Mappings({...}) 块
    for mb in _MAPPINGS_BLOCK_RE.finditer(block):
        for ma in _MAPPING_RE.finditer(mb.group(1)):
            mappings.append(parse_mapping_attrs(ma.group(1)))

    # 再处理独立的 @Mapping(...)
    # 跳过已在 @Mappings 块内的部分
    clean_block = _MAPPINGS_BLOCK_RE.sub('', block)
    for ma in _MAPPING_RE.finditer(clean_block):
        mappings.append(parse_mapping_attrs(ma.group(1)))

    return mappings


def parse_convert_file(path: str) -> list:
    """
    解析 *Convert.java，返回 ConvertMethod 列表。
    """
    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            raw = f.read()
    except Exception as e:
        print_warning(f"无法读取 {os.path.relpath(path)}: {e}")
        return []

    clean = strip_comments(raw)
    lines = clean.splitlines()

    # 仅处理 interface（@Mapper 接口）
    if not re.search(r'\binterface\s+\w+Convert\b', clean):
        return []

    methods = []

    # 匹配方法签名行（接口方法以 ; 结尾，可能跨多行）
    # 策略：找含方法名+( 且以 ; 结尾（或多行拼接）的行
    METHOD_LINE_RE = re.compile(
        r'^\s*(?:(?:default|void|List<\w+>|\w+)\s+)'
        r'(\w+)\s*\(([^;{]*)\)\s*;',
        re.MULTILINE,
    )

    for m in METHOD_LINE_RE.finditer(clean):
        method_name = m.group(1)
        params_raw = m.group(2)

        # 定位到行号（基于字符偏移）
        line_no = clean[:m.start()].count('\n')

        # 解析参数，提取类型
        param_types = []
        has_mapping_target = False
        for pm in _PARAM_RE.finditer(params_raw):
            typ = pm.group(1) or pm.group(2)  # List<T> → T 或 普通 T
            if typ and typ not in ('void',):
                param_types.append(typ)
            if '@MappingTarget' in params_raw:
                has_mapping_target = True

        # 确定返回类型
        ret_match = re.match(r'\s*(?:List<(\w+)>|(\w+))\s+\w+\s*\(', m.group(0))
        if not ret_match:
            continue
        is_list_ret = bool(ret_match.group(1))
        ret_type = ret_match.group(1) or ret_match.group(2)

        if ret_type in ('void', 'default'):
            # void copyToEntity(DTO, @MappingTarget Entity)
            if has_mapping_target and len(param_types) >= 2:
                # source = first param, target = @MappingTarget param (last)
                source_type = param_types[0]
                target_type = param_types[-1]
            else:
                continue
        else:
            # 普通转换：source = 第一个参数，target = 返回类型
            if not param_types:
                continue
            source_type = param_types[0]
            target_type = ret_type

        # 跳过列表到列表的方法（List<Entity> → List<DTO>），其单元素方向已覆盖
        is_list = is_list_ret and any(
            re.search(r'List<', params_raw)
            for _ in [True]
        )
        if is_list:
            continue

        mappings = collect_mappings_before(lines, line_no)

        methods.append(ConvertMethod(
            method_name=method_name,
            source_type=source_type,
            target_type=target_type,
            is_list=is_list,
            mappings=mappings,
            line_no=line_no + 1,
        ))

    return methods


# ─────────────────────────────────────────────────────────────────────────────
# 类注册表构建
# ─────────────────────────────────────────────────────────────────────────────

def build_class_registry(roots: list) -> dict:
    """
    扫描所有 Java 文件，构建 class_name → ClassInfo 映射。
    同名类取最后一个（实际项目中同名类应唯一）。
    """
    registry: dict[str, ClassInfo] = {}
    for root in roots:
        if os.path.isfile(root):
            _register_file(root, registry)
        elif os.path.isdir(root):
            for dirpath, dirs, files in os.walk(root):
                dirs[:] = [d for d in dirs if d not in {'target', '.git', 'node_modules', 'build'}]
                for fname in files:
                    if fname.endswith('.java'):
                        _register_file(os.path.join(dirpath, fname), registry)
    return registry


def _register_file(path: str, registry: dict):
    name = get_simple_name(path)
    # 只注册 Entity/DTO/VO/Request/Response 类
    kind = classify_kind(path)
    if kind == 'other':
        return
    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            content = f.read()
    except Exception:
        return
    fields = extract_fields(content)
    registry[name] = ClassInfo(name=name, path=path, fields=fields, kind=kind)


# ─────────────────────────────────────────────────────────────────────────────
# 对齐分析核心
# ─────────────────────────────────────────────────────────────────────────────

def determine_direction(source_kind: str, target_kind: str) -> str:
    """返回转换方向描述及严格程度。"""
    if source_kind == 'entity' and target_kind == 'dto':
        return 'entity→dto'
    if source_kind == 'dto' and target_kind == 'entity':
        return 'dto→entity'
    if source_kind == 'dto' and target_kind == 'vo':
        return 'dto→vo'
    if source_kind == 'entity' and target_kind == 'vo':
        return 'entity→vo'
    return 'other'


def analyze_method(method: ConvertMethod, registry: dict, convert_rel: str):
    """分析单个转换方法的字段对齐情况。"""
    src_info = registry.get(method.source_type)
    tgt_info = registry.get(method.target_type)

    if not src_info or not tgt_info:
        # 找不到对应类文件，跳过（可能是跨模块依赖）
        return

    direction = determine_direction(src_info.kind, tgt_info.kind)
    if direction == 'other':
        return  # 不关心 DTO→DTO 等方向

    src_fields = src_info.fields - BASE_ENTITY_FIELDS
    tgt_fields = tgt_info.fields - BASE_ENTITY_FIELDS

    # ── ① 检查 @Mapping 中的字段名是否存在 ─────────────────────────────────
    for ma in method.mappings:
        if ma.source and '.' not in ma.source:  # 忽略嵌套路径
            if ma.source not in src_info.fields and ma.source not in BASE_ENTITY_FIELDS:
                print_error(
                    f"PO-AL @Mapping 引用的 source 字段 '{ma.source}' 在 {method.source_type} 中不存在\n"
                    f"          → {convert_rel}:{method.line_no}  {method.method_name}()"
                )
        if ma.target and '.' not in ma.target:
            if ma.target not in tgt_info.fields and ma.target not in BASE_ENTITY_FIELDS:
                print_error(
                    f"PO-AL @Mapping 引用的 target 字段 '{ma.target}' 在 {method.target_type} 中不存在\n"
                    f"          → {convert_rel}:{method.line_no}  {method.method_name}()"
                )

    # ── 构建 @Mapping 覆盖集合 ────────────────────────────────────────────────
    # 被 @Mapping 显式处理的 source 字段（ignore/has_value/重命名）
    mapping_covered_sources: set = set()
    # 被 @Mapping 显式处理的 target 字段
    mapping_covered_targets: set = set()

    for ma in method.mappings:
        if ma.source:
            mapping_covered_sources.add(ma.source)
        if ma.target:
            mapping_covered_targets.add(ma.target)
            if ma.ignore or ma.has_value:
                # target 被忽略或有固定值，不需要 source 对应
                pass

    # ── ② 计算 source 字段被静默丢弃的字段 ──────────────────────────────────
    # MapStruct 会自动映射同名字段；source 字段在 target 中不存在，且无 @Mapping → 静默丢弃
    dropped: list = []
    for fname in sorted(src_fields):
        in_target = fname in tgt_fields
        in_mapping_source = fname in mapping_covered_sources
        if not in_target and not in_mapping_source:
            dropped.append(fname)

    # ── ③ 计算 target 字段无来源（仅在 entity→dto 方向报告）────────────────
    unmapped_targets: list = []
    if direction in ('entity→dto', 'dto→entity'):
        for fname in sorted(tgt_fields):
            # 跳过 VO 附加字段
            if any(fname.endswith(s) for s in VO_EXTRA_SUFFIXES):
                continue
            in_source = fname in src_fields
            in_mapping_target = fname in mapping_covered_targets
            if not in_source and not in_mapping_target:
                unmapped_targets.append(fname)

    # ── 输出结果 ─────────────────────────────────────────────────────────────
    _report(method, direction, dropped, unmapped_targets, convert_rel,
            src_info, tgt_info)


def _report(method: ConvertMethod, direction: str, dropped: list,
            unmapped_targets: list, convert_rel: str,
            src_info: ClassInfo, tgt_info: ClassInfo):
    """根据方向和阈值输出报告。"""
    # 确定阈值
    if direction in ('entity→dto', 'dto→entity'):
        error_threshold = 3
        warn_threshold = 1
    elif direction in ('dto→vo', 'entity→vo'):
        error_threshold = 9999   # VO 允许大量省略
        warn_threshold = 5
    else:
        return

    if not dropped and not unmapped_targets:
        return

    label = f"{convert_rel}:{method.line_no}  {method.method_name}()  [{method.source_type} → {method.target_type}]"

    # 被静默丢弃的 source 字段
    if dropped:
        dropped_str = ', '.join(f"'{f}'" for f in dropped)
        detail = (
            f"PO-AL {label}\n"
            f"          {method.source_type} 中以下字段在 {method.target_type} 不存在且无 @Mapping，"
            f"MapStruct 将静默丢弃：\n"
            f"          {dropped_str}\n"
            f"          → 若刻意省略请加 @Mapping(target=\"...\", ignore=true) 明确声明；"
            f"若遗漏请在 {method.target_type} 补充字段或在 Convert 中加 @Mapping"
        )
        if len(dropped) >= error_threshold:
            print_error(detail)
        elif len(dropped) >= warn_threshold:
            print_warning(detail)

    # target 字段无 source（仅严格方向）
    if unmapped_targets:
        um_str = ', '.join(f"'{f}'" for f in unmapped_targets)
        print_warning(
            f"PO-AL {label}\n"
            f"          {method.target_type} 中以下字段在 {method.source_type} 中无对应，"
            f"将保持 null/默认值：\n"
            f"          {um_str}\n"
            f"          → 若需要赋值请在 Convert 中加 @Mapping(source=\"...\", target=\"{unmapped_targets[0]}\")"
        )


# ─────────────────────────────────────────────────────────────────────────────
# DTO / VO 字段重复率检测（PO-DUP）
# ─────────────────────────────────────────────────────────────────────────────

# Create/Update 命名变体，重复率 ≥ 70% 即触发警告
_CREATE_UPDATE_RE = re.compile(
    r'(?:Create|Save|Add|New|Insert|Update|Edit|Modify|Patch|Put)(?:DTO|VO|Request|Response)?$',
    re.IGNORECASE,
)
# 剥离 DTO/VO/Request/Response/Entity 以及 Create/Update 等后缀，得到"领域前缀"
_STRIP_SUFFIX_RE = re.compile(
    r'(?:Create|Save|Add|New|Insert|Update|Edit|Modify|Patch|Put)?'
    r'(?:DTO|VO|Request|Response|Entity)?$',
    re.IGNORECASE,
)


def _domain_prefix(class_name: str) -> str:
    """提取类名的领域前缀，用于判断是否同属一个业务域。"""
    return _STRIP_SUFFIX_RE.sub('', class_name)


def _is_create_update_pair(nameA: str, nameB: str) -> bool:
    """判断两个类名是否为同一业务域的 Create/Update 命名变体。"""
    prefA = _domain_prefix(nameA)
    prefB = _domain_prefix(nameB)
    return (
        prefA == prefB
        and prefA != ''
        and (bool(_CREATE_UPDATE_RE.search(nameA)) or bool(_CREATE_UPDATE_RE.search(nameB)))
    )


def check_dto_duplication(
    registry: dict,
    dup_threshold: float = 0.90,
    cu_threshold: float = 0.70,
    min_fields: int = 3,
):
    """
    PO-DUP：扫描所有 DTO/VO 对，报告字段重复率超阈值的组合。

    dup_threshold : 普通重复率阈值，默认 90%
    cu_threshold  : Create/Update 命名变体的重复率阈值，默认 70%
    min_fields    : 有效字段数下限（过滤噪音），默认 3
    """
    from itertools import combinations

    # 按类型分组，只在同类型内比较
    groups: dict[str, list] = {'dto': [], 'vo': []}
    for cls in registry.values():
        if cls.kind in groups:
            groups[cls.kind].append(cls)

    found = False
    for kind, classes in groups.items():
        for cls_a, cls_b in combinations(classes, 2):
            fields_a = cls_a.fields - BASE_ENTITY_FIELDS
            fields_b = cls_b.fields - BASE_ENTITY_FIELDS

            if len(fields_a) < min_fields or len(fields_b) < min_fields:
                continue

            common = fields_a & fields_b
            small_size = min(len(fields_a), len(fields_b))
            overlap = len(common) / small_size

            # 确定适用阈值
            is_cu_pair = _is_create_update_pair(cls_a.name, cls_b.name)
            effective_threshold = cu_threshold if is_cu_pair else dup_threshold

            if overlap < effective_threshold:
                continue

            found = True

            # 确定"较小"与"较大"
            if len(fields_a) <= len(fields_b):
                smaller, larger = cls_a, cls_b
                smaller_fields, larger_fields = fields_a, fields_b
            else:
                smaller, larger = cls_b, cls_a
                smaller_fields, larger_fields = fields_b, fields_a

            unique_in_larger = larger_fields - smaller_fields
            unique_in_smaller = smaller_fields - larger_fields

            rel_smaller = os.path.relpath(smaller.path)
            rel_larger = os.path.relpath(larger.path)

            common_str = ', '.join(f"'{f}'" for f in sorted(common))
            unique_larger_str = (
                ', '.join(f"'{f}'" for f in sorted(unique_in_larger))
                if unique_in_larger else '（无额外字段，完全重复）'
            )
            unique_smaller_str = (
                f"，{smaller.name} 独有：" + ', '.join(f"'{f}'" for f in sorted(unique_in_smaller))
                if unique_in_smaller else ''
            )

            # 构建建议文案
            if is_cu_pair:
                advice = (
                    '符合"Create/Update 合并为一个 DTO"约定，'
                    '建议合并为一个 DTO，用 id 是否为 null 区分 create/update 场景'
                )
            elif overlap == 1.0:
                advice = (
                    f"{smaller.name} 的字段完全包含于 {larger.name}，"
                    f"可直接复用 {larger.name}，无需单独维护两个类"
                )
            else:
                advice = (
                    f"建议合并为一个 DTO，多余字段用 @JsonView 分组或用 null 区分场景"
                )

            msg = (
                f"PO-DUP {larger.name} 与 {smaller.name} 字段重复率 {overlap:.0%}"
                f"（{kind.upper()}，{len(common)}/{small_size} 字段相同）\n"
                f"          {larger.name}（{len(larger_fields)} 字段）: {rel_larger}\n"
                f"          {smaller.name}（{len(smaller_fields)} 字段）: {rel_smaller}\n"
                f"          共有字段：{common_str}\n"
                f"          {larger.name} 独有字段：{unique_larger_str}{unique_smaller_str}\n"
                f"          → {advice}"
            )

            # overlap == 1.0（完全包含）或 Create/Update 命名变体 → ERROR，其余 → WARN
            if overlap == 1.0 or is_cu_pair:
                print_error(msg)
            else:
                print_warning(msg)

    if not found:
        print_ok("PO-DUP 通过，未发现 DTO/VO 字段高度重复问题")


# ─────────────────────────────────────────────────────────────────────────────
# 文件级入口
# ─────────────────────────────────────────────────────────────────────────────

def check_convert_file(path: str, registry: dict):
    """分析单个 Convert 文件的所有转换方法。"""
    rel = os.path.relpath(path)
    if 'Convert' not in os.path.basename(path):
        return

    methods = parse_convert_file(path)
    if not methods:
        return

    for method in methods:
        analyze_method(method, registry, rel)


# ─────────────────────────────────────────────────────────────────────────────
# 主入口
# ─────────────────────────────────────────────────────────────────────────────

def collect_files(targets: list, files_mode_list: list) -> tuple:
    """返回 (convert_files, all_roots) 供后续使用。"""
    convert_files = []
    all_roots = []

    if files_mode_list:
        for f in files_mode_list:
            if f.endswith('.java') and 'Convert' in os.path.basename(f):
                convert_files.append(f)
            all_roots.append(os.path.dirname(f))
        return convert_files, list(set(all_roots))

    for target in targets:
        all_roots.append(target)
        if os.path.isfile(target):
            if 'Convert' in os.path.basename(target):
                convert_files.append(target)
        elif os.path.isdir(target):
            for root, dirs, files in os.walk(target):
                dirs[:] = [d for d in dirs if d not in {'target', '.git', 'node_modules', 'build'}]
                for fname in files:
                    if fname.endswith('Convert.java'):
                        convert_files.append(os.path.join(root, fname))

    return convert_files, all_roots


def main():
    if len(sys.argv) < 2:
        print("用法：python3 check-dto-entity-alignment.py <java-file-or-dir>")
        print("      python3 check-dto-entity-alignment.py <dir> --files f1.java f2.java ...")
        sys.exit(1)

    print("=" * 56)
    print("  java-pojo / check-dto-entity-alignment.py")
    print("  检查：PO-AL Convert 字段对齐 / PO-DUP DTO 重复率")
    print("=" * 56)

    # 解析参数
    targets: list = []
    files_mode_list: list = []
    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == '--files':
            i += 1
            while i < len(sys.argv):
                files_mode_list.append(sys.argv[i])
                i += 1
        else:
            targets.append(sys.argv[i])
            i += 1

    convert_files, all_roots = collect_files(targets, files_mode_list)

    print(f"\n正在构建类注册表（扫描 Entity/DTO/VO 字段）...")
    registry = build_class_registry(all_roots)
    print(f"  已载入 {len(registry)} 个 POJO 类\n")

    # ── PO-AL：Convert 字段对齐检查 ──────────────────────────────────────────
    if convert_files:
        print(f"【PO-AL】正在分析 {len(convert_files)} 个 Convert 文件...\n")
        for cf in sorted(convert_files):
            check_convert_file(cf, registry)
    else:
        print_ok("PO-AL 未找到 *Convert.java 文件，跳过字段对齐检查")

    # ── PO-DUP：DTO/VO 字段重复率检查 ────────────────────────────────────────
    dto_vo_count = sum(1 for c in registry.values() if c.kind in ('dto', 'vo'))
    if dto_vo_count >= 2:
        print(f"\n【PO-DUP】正在检查 {dto_vo_count} 个 DTO/VO 的字段重复率...\n")
        check_dto_duplication(registry)
    else:
        print_ok("PO-DUP DTO/VO 数量不足，跳过重复率检查")

    print()
    print("=" * 56)
    if errors > 0:
        print(f"{RED}❌ 检查完成：{errors} 个阻断错误，{warnings} 个警告{NC}")
        sys.exit(1)
    elif warnings > 0:
        print(f"{YELLOW}🟡 检查完成：0 个阻断错误，{warnings} 个警告{NC}")
    else:
        print_ok("全部通过，字段对齐与重复率检查均无问题")


if __name__ == '__main__':
    main()
