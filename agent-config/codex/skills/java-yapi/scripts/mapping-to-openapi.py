#!/usr/bin/env python3
"""
java-yapi/scripts/mapping-to-openapi.py

将 LLM 产出的中间 mapping（YAML）转换为 OpenAPI 3.0 yapi.json，
供 sync-yapi.sh 上传到 YApi。

mapping 格式规范：references/MAPPING_SCHEMA.md

用法：
    # 单文件模式（小型项目）
    python3 mapping-to-openapi.py <service-root>/.yapi-tmp/mapping.yaml \\
        --output <service-root>/yapi.json

    # 目录模式（按 Controller 分片，推荐 5+ Controller 项目）
    python3 mapping-to-openapi.py <service-root>/.yapi-tmp/mapping/ \\
        --output <service-root>/yapi.json

目录模式聚合规则：
    - 仅读取目录下 *.yaml / *.yml 文件，不递归子目录
    - service 段：以唯一一份为准；若多份均提供且不一致 → 报错
    - enums / schemas：字典合并，重复 key → 报错（强制规避歧义）
    - groups：列表追加，按 name 去重时若内容不一致 → 报错
    - 推荐拆分约定：
        _meta.yaml          → service + 公共 enums + 公共 schemas
        <controller>.yaml   → 每个 Controller 一个分组（含其专属 schemas）

设计原则：
    - 纯模板转换，无歧义；不解析 Java 源码
    - mapping 写错不容忍（fail-fast，给出可定位错误）
    - example/mock 由字段名 + 类型派生，mapping 可显式覆盖
    - 禁止 *-extra.yaml / *-merged.yaml / merge.py 这类一次性拼接辅助文件
    - OpenAPI paths 仅含相对 service.base_path 的路径；网关前缀写入 servers[].url，避免与 YApi 项目前缀重复拼接
"""
from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import yaml
except ImportError:
    print("缺少依赖 PyYAML，请运行：pip3 install pyyaml", file=sys.stderr)
    sys.exit(2)


# ── Mock 派生（按字段名关键字）─────────────────────────────────────────────────

MOCK_BY_NAME: List[Tuple[Tuple[str, ...], Dict[str, Any]]] = [
    (('phone', 'mobile', 'tel'),
     {'example': '13800138000', 'mock': "@string('number', 11)"}),
    (('email', 'mail'),
     {'example': 'user@example.com', 'mock': '@email'}),
    (('avatar', 'image', 'img', 'photo'),
     {'example': 'https://example.com/avatar.jpg', 'mock': '@image'}),
    (('url', 'link', 'href', 'src'),
     {'example': 'https://example.com/file', 'mock': '@url'}),
    (('ip',),
     {'example': '203.0.113.10', 'mock': '@ip'}),
    (('username', 'realname', 'nickname'),
     {'example': '张三', 'mock': '@cname'}),
    (('addr', 'address'),
     {'example': '北京市海淀区中关村大街 1 号', 'mock': '@county(true)'}),
    (('province',),
     {'example': '北京市', 'mock': '@province'}),
    (('city',),
     {'example': '海淀区', 'mock': '@city'}),
    (('title', 'name'),
     {'example': '示例标题', 'mock': '@ctitle(4, 8)'}),
    (('desc', 'remark', 'note', 'content', 'reason', 'intro', 'summary'),
     {'example': '这是一段示例说明', 'mock': '@cparagraph(1, 3)'}),
]


def derive_string_mock(field_name: str) -> Dict[str, Any]:
    name = field_name.lower()
    for keys, payload in MOCK_BY_NAME:
        if any(k in name for k in keys):
            return payload
    if name == 'id' or name.endswith('id') or name.endswith('Id'.lower()):
        return {'example': '1947283920182378496', 'mock': "@string('number', 18)"}
    return {'example': '示例文本', 'mock': '@cword(4, 8)'}


def derive_integer_mock(field_name: str) -> Dict[str, Any]:
    name = field_name.lower()
    if name == 'id' or name.endswith('id'):
        return {'example': 1, 'mock': '@integer(1, 999999)'}
    if any(k in name for k in ('count', 'num', 'total', 'size')):
        return {'example': 1, 'mock': '@integer(0, 1000)'}
    if any(k in name for k in ('age',)):
        return {'example': 25, 'mock': '@integer(18, 60)'}
    if any(k in name for k in ('status', 'type', 'state', 'level')):
        return {'example': 1, 'mock': '@integer(0, 5)'}
    return {'example': 1, 'mock': '@integer(1, 100)'}


# ── Schema 渲染 ───────────────────────────────────────────────────────────────

PRIMITIVE_OPENAPI = {
    'string':   {'type': 'string'},
    'integer':  {'type': 'integer', 'format': 'int32'},
    'long':     {'type': 'string'},  # JS 安全：long 序列化为 string
    'number':   {'type': 'number'},
    'boolean':  {'type': 'boolean'},
    'datetime': {'type': 'string', 'format': 'date-time'},
    'date':     {'type': 'string', 'format': 'date'},
    'time':     {'type': 'string', 'format': 'time'},
}


class MappingError(Exception):
    pass


# 曾用 StubJson + properties._ref 误导 YApi；mapping 与 yapi.json 均禁止回退
_FORBIDDEN_SCHEMA_NAMES = frozenset({'StubJson'})


class Builder:
    def __init__(self, mapping: Dict[str, Any]):
        self.mapping = mapping
        self.schemas_def = mapping.get('schemas', {}) or {}
        bad = _FORBIDDEN_SCHEMA_NAMES & frozenset(self.schemas_def.keys())
        if bad:
            raise MappingError(
                f"禁止占位 schema 名：{', '.join(sorted(bad))}；"
                "若需不展开 DTO，请使用 fields: [] 并在 description 中说明（如 BizData），"
                "禁止 StubJson 与假字段 _ref。"
            )
        self.enums_def = mapping.get('enums', {}) or {}
        self.service = mapping.get('service', {}) or {}
        self.groups = mapping.get('groups', []) or []
        self._schema_cache: Dict[str, Dict[str, Any]] = {}
        self._building: set = set()

    # --- field schema ---

    def render_field_schema(self, field: Dict[str, Any]) -> Dict[str, Any]:
        """根据 mapping field 描述生成 OpenAPI schema 片段。"""
        fname = field.get('name', '<anonymous>')
        ftype = field.get('type')
        if not ftype:
            raise MappingError(f"字段 {fname} 缺少 type")

        desc = field.get('description', '') or ''

        if ftype == 'array':
            items = field.get('items')
            if items is None:
                raise MappingError(f"array 字段 {fname} 缺少 items")
            inner = self._items_schema(items, fname)
            schema = {'type': 'array', 'items': inner}
        elif ftype == 'ref':
            ref_name = field.get('ref')
            if not ref_name:
                raise MappingError(f"ref 字段 {fname} 缺少 ref")
            self._ensure_schema(ref_name)
            schema = {'$ref': f'#/components/schemas/{ref_name}'}
        elif ftype == 'enum':
            enum_name = field.get('enum')
            if not enum_name:
                raise MappingError(f"enum 字段 {fname} 缺少 enum")
            schema = self._render_enum(enum_name, fname)
            # 枚举映射 description 优先级最高：字段 description 与映射拼接，避免被覆盖
            mapping_desc = schema.pop('_mapping_desc', '')
            if mapping_desc:
                desc = f"{desc}（{mapping_desc}）" if desc else mapping_desc
            elif schema.get('description'):
                desc = desc or schema['description']
        elif ftype == 'object':
            sub_fields = field.get('fields', [])
            props, required = self._render_field_list(sub_fields)
            schema = {'type': 'object', 'properties': props}
            if required:
                schema['required'] = required
        elif ftype == 'map':
            schema = self._render_map_schema(field, fname)
        elif ftype in PRIMITIVE_OPENAPI:
            schema = dict(PRIMITIVE_OPENAPI[ftype])
            mock_payload = self._derive_mock(ftype, fname, field)
            schema.update(mock_payload)
        else:
            raise MappingError(f"字段 {fname} 未知 type: {ftype}")

        if desc:
            schema['description'] = desc
        if 'example' in field and 'example' not in schema:
            schema['example'] = field['example']
        if 'mock' in field:
            schema['mock'] = {'mock': str(field['mock'])}
        return schema

    def _render_map_schema(self, field: Dict[str, Any], fname: str) -> Dict[str, Any]:
        """
        渲染 Map<K,V> 字段。

        YApi 对 additionalProperties 展示不友好；当 key 集合有限时，mapping 应显式声明 keys，
        本方法会把它展开为固定 properties，便于页面展示字段结构。
        """
        values = field.get('values')
        if values is None:
            raise MappingError(f"map 字段 {fname} 缺少 values（Map value 类型）")
        value_schema = self._map_value_schema(values, fname)

        keys = field.get('keys')
        if keys is None:
            return {'type': 'object', 'additionalProperties': value_schema}
        if not isinstance(keys, list) or not keys:
            raise MappingError(f"map 字段 {fname} 的 keys 必须为非空数组；动态 Map 请删除 keys")

        props: Dict[str, Any] = {}
        required: List[str] = []
        for item in keys:
            if isinstance(item, str):
                key_name = item
                key_desc = ''
                key_required = False
            elif isinstance(item, dict):
                key_name = item.get('name')
                key_desc = item.get('description', '') or ''
                key_required = item.get('required') is True
            else:
                raise MappingError(f"map 字段 {fname} 的 keys 项非法：{item!r}")
            if not key_name:
                raise MappingError(f"map 字段 {fname} 的 keys 项缺少 name：{item!r}")
            if key_name == '_ref':
                raise MappingError(f"map 字段 {fname} 的固定 key 禁止为 _ref")

            prop_schema = copy.deepcopy(value_schema)
            if key_desc:
                prop_schema['description'] = key_desc
            props[key_name] = prop_schema
            if key_required:
                required.append(key_name)

        schema: Dict[str, Any] = {'type': 'object', 'properties': props}
        if required:
            schema['required'] = required
        return schema

    def _map_value_schema(self, values: Any, fname: str) -> Dict[str, Any]:
        if isinstance(values, str):
            return self._items_schema(values, fname)
        if isinstance(values, dict):
            return self.render_field_schema({'name': f'{fname}Value', **values})
        raise MappingError(f"map 字段 {fname} values 形态非法：{values!r}")

    def _items_schema(self, items: Any, parent_name: str) -> Dict[str, Any]:
        if isinstance(items, str):
            if items in PRIMITIVE_OPENAPI:
                base = dict(PRIMITIVE_OPENAPI[items])
                base.update(self._derive_mock(items, parent_name, {}))
                return base
            if items in self.enums_def:
                return self._render_enum(items, parent_name)
            self._ensure_schema(items)
            return {'$ref': f'#/components/schemas/{items}'}
        if isinstance(items, dict):
            return self.render_field_schema({'name': parent_name, **items})
        raise MappingError(f"array 字段 {parent_name} items 形态非法：{items!r}")

    def _derive_mock(self, prim_type: str, fname: str, field: Dict[str, Any]) -> Dict[str, Any]:
        """根据基础类型 + 字段名派生 example / mock。"""
        if 'example' in field or 'mock' in field:
            payload: Dict[str, Any] = {}
            if 'example' in field:
                payload['example'] = field['example']
            if 'mock' in field:
                payload['mock'] = {'mock': str(field['mock'])}
            return payload

        if prim_type == 'string':
            payload = derive_string_mock(fname)
        elif prim_type == 'integer':
            payload = derive_integer_mock(fname)
        elif prim_type == 'long':
            payload = {'example': '1947283920182378496', 'mock': "@string('number', 18)"}
        elif prim_type == 'number':
            payload = {'example': 100.0, 'mock': '@float(0, 10000, 2, 2)'}
        elif prim_type == 'boolean':
            payload = {'example': True, 'mock': '@boolean'}
        elif prim_type == 'datetime':
            payload = {'example': '2024-01-01 12:00:00', 'mock': "@datetime('yyyy-MM-dd HH:mm:ss')"}
        elif prim_type == 'date':
            payload = {'example': '2024-01-01', 'mock': "@date('yyyy-MM-dd')"}
        elif prim_type == 'time':
            payload = {'example': '12:00:00', 'mock': "@time('HH:mm:ss')"}
        else:
            payload = {}

        result: Dict[str, Any] = {}
        if 'example' in payload:
            result['example'] = payload['example']
        if 'mock' in payload:
            result['mock'] = {'mock': payload['mock']}
        return result

    def _render_enum(self, enum_name: str, fname: str) -> Dict[str, Any]:
        e = self.enums_def.get(enum_name)
        if not e:
            raise MappingError(f"字段 {fname} 引用未定义枚举 {enum_name}")
        etype = e.get('type', 'integer')
        storage = e.get('storage', 'code')
        values = e.get('values', [])
        if not values:
            raise MappingError(f"枚举 {enum_name} values 为空")

        if storage == 'code':
            codes = [v['code'] for v in values]
            example = codes[0]
            base_type = 'integer' if etype == 'integer' else 'string'
            base = {'type': base_type, 'enum': codes,
                    'example': example, 'mock': {'mock': example}}
        else:
            descs = [v['label'] for v in values]
            example = descs[0]
            base = {'type': 'string', 'enum': descs,
                    'example': example, 'mock': {'mock': example}}

        # 把完整枚举映射放到一个临时 key，由 render_field_schema 与字段 desc 拼接
        meta = e.get('description', '') or enum_name
        mapping_desc = ' | '.join(f"{v['code']}={v['label']}" for v in values)
        base['description'] = meta
        base['_mapping_desc'] = mapping_desc
        return base

    def _render_field_list(self, fields: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], List[str]]:
        props: Dict[str, Any] = {}
        required: List[str] = []
        for f in fields:
            fname = f.get('name')
            if not fname:
                raise MappingError(f"字段缺少 name：{f!r}")
            if fname == '_ref':
                raise MappingError(
                    "字段名禁止为 _ref（YApi 会当作真实出参）；请删除该假字段，"
                    "或改用 schema.description / 具名 DTO 描述业务数据。"
                )
            props[fname] = self.render_field_schema(f)
            if f.get('required') is True:
                required.append(fname)
        return props, required

    # --- schema (top-level) ---

    def _ensure_schema(self, name: str) -> Dict[str, Any]:
        if name in self._schema_cache:
            return self._schema_cache[name]
        if name in self._building:
            # 循环引用占位（OpenAPI 允许 $ref 自引用）
            return {'$ref': f'#/components/schemas/{name}'}
        if name not in self.schemas_def:
            raise MappingError(f"引用了未定义 schema：{name}")

        self._building.add(name)
        sdef = self.schemas_def[name]
        fields = sdef.get('fields', [])
        props, required = self._render_field_list(fields)
        schema_obj: Dict[str, Any] = {
            'type': 'object',
            'description': sdef.get('description', '') or name,
            'properties': props,
        }
        if required:
            schema_obj['required'] = required
        self._schema_cache[name] = schema_obj
        self._building.discard(name)
        return schema_obj

    def build_components(self) -> Dict[str, Any]:
        # 触发所有 schemas 构建，避免遗漏未被 endpoint 引用的 schema
        for name in list(self.schemas_def.keys()):
            self._ensure_schema(name)
        return {'schemas': self._schema_cache}

    # --- response wrapper (Result<T>) ---

    def _wrap_result(self, payload_schema: Dict[str, Any], payload_desc: str = '业务数据') -> Dict[str, Any]:
        """统一套 Result<T> 包装：{ code, message, data }"""
        return {
            'type': 'object',
            'properties': {
                'code': {
                    'type': 'integer',
                    'description': '响应码，0=成功',
                    'example': 0,
                    'mock': {'mock': 0},
                },
                'message': {
                    'type': 'string',
                    'description': '响应信息',
                    'example': 'success',
                    'mock': {'mock': 'success'},
                },
                'data': {
                    **payload_schema,
                    'description': payload_desc,
                } if payload_schema else {
                    'type': 'object',
                    'description': payload_desc,
                    'nullable': True,
                },
            },
            'required': ['code', 'message'],
        }

    def _build_response_schema(self, response: Any) -> Dict[str, Any]:
        if response is None or response == 'void':
            return self._wrap_result({}, '空数据')
        if isinstance(response, str):
            self._ensure_schema(response)
            return self._wrap_result({'$ref': f'#/components/schemas/{response}'},
                                     self.schemas_def.get(response, {}).get('description', '') or response)
        if isinstance(response, dict):
            payload = self.render_field_schema({'name': 'data', **response})
            return self._wrap_result(payload, response.get('description', '业务数据'))
        raise MappingError(f"非法 response 配置：{response!r}")

    # --- endpoints ---

    def _build_request_body(self, request_body: Any) -> Optional[Dict[str, Any]]:
        if request_body is None:
            return None
        if isinstance(request_body, str):
            self._ensure_schema(request_body)
            schema = {'$ref': f'#/components/schemas/{request_body}'}
        elif isinstance(request_body, dict):
            if request_body.get('type') == 'array':
                items = request_body.get('items', 'long')
                inner = self._items_schema(items, 'items')
                schema = {'type': 'array', 'items': inner}
                desc = request_body.get('description')
                if desc:
                    schema['description'] = desc
            else:
                fields = request_body.get('fields', [])
                props, required = self._render_field_list(fields)
                schema = {'type': 'object', 'properties': props}
                if required:
                    schema['required'] = required
        else:
            raise MappingError(f"非法 request_body：{request_body!r}")
        return {
            'required': True,
            'content': {'application/json': {'schema': schema}},
        }

    # group.name（= OpenAPI tag = YApi 分类）必须是 4~12 字符的纯业务短语，禁止技术后缀
    _GROUP_NAME_FORBIDDEN_SUFFIXES = (
        'Controller', 'controller',
        'Service', 'service',
        'Manager', 'manager',
        'Api', 'API',
        '接口', '服务', '管理器',
    )

    @staticmethod
    def _visible_len(s: str) -> int:
        # 去除空格后视觉字符数（中英数各计 1）
        return len(re.sub(r'\s+', '', s))

    def _validate_group_name(self, name: Any) -> None:
        if not name or not isinstance(name, str):
            raise MappingError("group 缺少 name")
        s = name.strip()
        for suffix in self._GROUP_NAME_FORBIDDEN_SUFFIXES:
            if s.endswith(suffix):
                raise MappingError(
                    f"group.name 含禁止的技术后缀「{suffix}」：{s!r}\n"
                    f"  规范：4~12 字符纯业务短语，禁止 Controller/Service/Manager/接口/服务/API 等后缀\n"
                    f"  示例：评估流程 / 评测报告 / 评估流程（内部）/ OA 试卷 / 题目管理"
                )
        vlen = self._visible_len(s)
        if vlen < 4 or vlen > 12:
            raise MappingError(
                f"group.name 长度不符合规范（去空格后 {vlen} 字符，要求 4~12）：{s!r}\n"
                f"  示例：评估流程 / 评测报告 / 评估流程（内部）/ OA 试卷 / 题目管理\n"
                f"  提示：单字业务名（如「职位」「题目」）请补足，例如「职位管理」「题目管理」"
            )

    # summary 必须为「业务名称 - 操作」格式（与 SKILL.md「接口名称（summary）命名」一致）
    _SUMMARY_BAD_HEAD_VERBS = (
        '获取', '查询', '查看', '搜索', '列出', '检索',
        '新增', '创建', '添加',
        '更新', '修改', '编辑', '保存',
        '删除', '移除',
        '提交', '触发', '轮询', '执行', '运行',
        '批量', '统计', '导出', '导入', '上传', '下载',
        '发布', '关闭', '启用', '禁用', '重置',
    )

    def _validate_summary(self, summary: Any, path: str, method: str) -> None:
        loc = f"{method.upper()} {path}"
        if not summary or not isinstance(summary, str):
            raise MappingError(f"endpoint 缺少 summary：{loc}")
        s = summary.strip()
        if ' - ' not in s:
            raise MappingError(
                f"summary 不符合「业务名称 - 操作」格式：{loc}\n"
                f"  当前：{summary!r}\n"
                f"  规范：使用全角/半角空格包围的「 - 」分隔，左侧业务名称，右侧动词短语\n"
                f"  示例：评估流程 - 分页查询 / AI 一面报告 - 详情查询（最近一次）"
            )
        biz, _, op_part = s.partition(' - ')
        biz, op_part = biz.strip(), op_part.strip()
        if not biz or not op_part:
            raise MappingError(
                f"summary 业务名或操作为空：{loc}\n  当前：{summary!r}")
        for v in self._SUMMARY_BAD_HEAD_VERBS:
            if biz.startswith(v):
                raise MappingError(
                    f"summary 业务名疑似动词起头，缺少业务前缀：{loc}\n"
                    f"  当前业务名：{biz!r}\n"
                    f"  动词应放在「 - 」之后；示例：'获取职位详情' → '职位 - 详情查询'"
                )

    # webhook 端点：业务方暴露给外部（如 AI 服务）的异步回调契约。
    # 校验目标：caller / trigger 必填；request_body 必须按具名 schema 逐字段展开，
    # 杜绝把回调协议塞进 description 当纯文本（这是 YApi 上看不到任何字段的根因）。
    def _validate_webhook(self, ep: Dict[str, Any], path: str, method: str) -> None:
        wh = ep.get('webhook')
        if wh is None:
            return
        loc = f"{method.upper()} {path}"
        if not isinstance(wh, dict):
            raise MappingError(
                f"endpoint.webhook 必须为对象（含 caller / trigger / 可选 retry）：{loc}"
            )
        caller = (wh.get('caller') or '').strip() if isinstance(wh.get('caller'), str) else ''
        trigger = (wh.get('trigger') or '').strip() if isinstance(wh.get('trigger'), str) else ''
        if not caller:
            raise MappingError(
                f"endpoint.webhook.caller 必填（写明回调方服务名）：{loc}\n"
                f"  示例：caller: 'exam-generate-svc（AI 服务）'"
            )
        if not trigger:
            raise MappingError(
                f"endpoint.webhook.trigger 必填（写明触发时机）：{loc}\n"
                f"  示例：trigger: '异步出题任务完成时回调'"
            )
        rb = ep.get('request_body')
        if rb is None:
            raise MappingError(
                f"webhook 端点必须声明 request_body（按 schema 展开回调字段）：{loc}\n"
                f"  禁止把回调协议写在 description / 备注里当纯文本——这正是 YApi 上「啥都看不到」的根因\n"
                f"  正确做法：在 schemas 中定义 XxxCallbackRequest，按 Java DTO 逐字段写全，再 request_body: XxxCallbackRequest"
            )
        if isinstance(rb, str):
            target = self.schemas_def.get(rb)
            if target is not None and not target.get('fields'):
                raise MappingError(
                    f"webhook 端点的 request_body 引用了空 fields 的占位 schema {rb!r}：{loc}\n"
                    f"  必须按 Java 回调 DTO 逐字段写全 fields"
                )
        elif isinstance(rb, dict):
            if not rb.get('fields'):
                raise MappingError(
                    f"webhook 端点的 inline request_body 必须包含 fields：{loc}"
                )

    @staticmethod
    def _render_webhook_description(ep: Dict[str, Any]) -> Optional[str]:
        """webhook endpoint 渲染固定 description 头部块（caller / trigger / retry）。"""
        wh = ep.get('webhook')
        if not isinstance(wh, dict):
            return None
        lines = ['⚠️ 本接口为 Webhook 回调', '']
        lines.append(f"- 回调方：{wh.get('caller', '')}")
        lines.append(f"- 触发时机：{wh.get('trigger', '')}")
        retry = wh.get('retry')
        if retry:
            lines.append(f"- 重试策略：{retry}")
        return '\n'.join(lines)

    def _build_parameters(self, ep: Dict[str, Any]) -> List[Dict[str, Any]]:
        params: List[Dict[str, Any]] = []
        for p in ep.get('path_params', []) or []:
            schema = self.render_field_schema(p)
            # 枚举类型的完整映射已被 render_field_schema 写入 schema['description']；
            # YApi 导入时仅读 parameter 顶层 description，故此处回填保证枚举列表可见。
            param_desc = schema.get('description', '') or p.get('description', '') or ''
            params.append({
                'name': p['name'],
                'in': 'path',
                'required': True,
                'description': param_desc,
                'schema': schema,
            })
        for p in ep.get('query_params', []) or []:
            schema = self.render_field_schema(p)
            param_desc = schema.get('description', '') or p.get('description', '') or ''
            params.append({
                'name': p['name'],
                'in': 'query',
                'required': bool(p.get('required', False)),
                'description': param_desc,
                'schema': schema,
            })
        return params

    def _build_endpoint(self, group_name: str, ep: Dict[str, Any]) -> Tuple[str, str, Dict[str, Any]]:
        path = ep.get('path')
        method = (ep.get('method') or '').lower()
        if not path or method not in ('get', 'post', 'put', 'delete', 'patch'):
            raise MappingError(f"非法 endpoint：path={path}, method={method}")

        summary = ep.get('summary')
        self._validate_summary(summary, path, method)
        self._validate_webhook(ep, path, method)

        base_path = (self.service.get('base_path', '') or '').rstrip('/')
        if not path.startswith('/'):
            raise MappingError(
                f"endpoint.path 必须以 '/' 开头：{method.upper()} {path}\n"
                f"  规范：path 是相对 service.base_path 的子路径，且以 '/' 起始\n"
                f"  示例：base_path='/api/v1/assess'，path='/report/trace/{{flowId}}'"
            )
        if base_path and (path == base_path or path.startswith(base_path + '/')):
            raise MappingError(
                f"endpoint.path 重复包含 service.base_path：{method.upper()} {path}\n"
                f"  service.base_path = {base_path!r}\n"
                f"  当前 path        = {path!r}\n"
                f"  规范：path 不应再包含 base_path 前缀，脚本会自动拼接\n"
                f"  修复：把 path 改为 {path[len(base_path):]!r}"
            )
        # paths 的 key 仅含相对路径；完整 URL 由 servers[].url + path 组成（OpenAPI 3 约定）
        op: Dict[str, Any] = {
            'tags': [group_name],
            'summary': summary,
            'parameters': self._build_parameters(ep),
            'responses': {
                '200': {
                    'description': 'OK',
                    'content': {
                        'application/json': {
                            'schema': self._build_response_schema(ep.get('response')),
                        },
                    },
                },
            },
        }
        webhook_banner = self._render_webhook_description(ep)
        user_desc = ep.get('description') or ''
        if webhook_banner and user_desc:
            op['description'] = webhook_banner + '\n\n' + user_desc
        elif webhook_banner:
            op['description'] = webhook_banner
        elif user_desc:
            op['description'] = user_desc
        body = self._build_request_body(ep.get('request_body'))
        if body is not None:
            op['requestBody'] = body
        return path, method, op

    def build_paths(self) -> Dict[str, Any]:
        paths: Dict[str, Dict[str, Any]] = {}
        for g in self.groups:
            gname = g.get('name')
            self._validate_group_name(gname)
            for ep in g.get('endpoints', []) or []:
                rel_path, method, op = self._build_endpoint(gname, ep)
                paths.setdefault(rel_path, {})[method] = op
        return paths

    def build_tags(self) -> List[Dict[str, str]]:
        tags = []
        for g in self.groups:
            self._validate_group_name(g.get('name'))
            tags.append({
                'name': g['name'],
                'description': g.get('description', '') or g['name'],
            })
        return tags

    def build(self) -> Dict[str, Any]:
        info = {
            'title': self.service.get('name', '未命名服务'),
            'version': str(self.service.get('version', '1.0.0')),
            'description': self.service.get('description', '') or '',
        }
        base_path = (self.service.get('base_path', '') or '').rstrip('/')
        doc: Dict[str, Any] = {
            'openapi': '3.0.0',
            'info': info,
            'tags': self.build_tags(),
            'paths': self.build_paths(),
            'components': self.build_components(),
        }
        if base_path:
            doc['servers'] = [{'url': base_path}]
        return doc


# ── CLI ──────────────────────────────────────────────────────────────────────

FORBIDDEN_NAME_PATTERNS = (
    re.compile(r'-extra\.ya?ml$', re.IGNORECASE),
    re.compile(r'-merged\.ya?ml$', re.IGNORECASE),
    re.compile(r'^temp.*\.ya?ml$', re.IGNORECASE),
    re.compile(r'^merge\.py$', re.IGNORECASE),
    re.compile(r'^combine\.py$', re.IGNORECASE),
)


def _check_forbidden_names(paths: List[Path]) -> None:
    bad = [p.name for p in paths
           if any(pat.search(p.name) for pat in FORBIDDEN_NAME_PATTERNS)]
    if bad:
        raise MappingError(
            "检测到违反命名规范的文件：" + ", ".join(bad) +
            "\n  → mapping 文件命名规范见 references/MAPPING_SCHEMA.md「文件命名」章节"
            "\n  → 单文件模式：mapping.yaml；分片模式：mapping/<controller-kebab>.yaml + _meta.yaml"
            "\n  → 禁止 *-extra.yaml / *-merged.yaml / temp*.yaml / merge.py / combine.py"
        )


def _merge_mappings(parts: List[Tuple[Path, Dict[str, Any]]]) -> Dict[str, Any]:
    merged: Dict[str, Any] = {'service': None, 'enums': {}, 'schemas': {}, 'groups': []}
    seen_groups: Dict[str, Tuple[Path, Dict[str, Any]]] = {}
    for path, doc in parts:
        if not isinstance(doc, dict):
            raise MappingError(f"{path.name}：根节点必须是 mapping object")
        svc = doc.get('service')
        if svc is not None:
            if merged['service'] is None:
                merged['service'] = svc
            elif merged['service'] != svc:
                raise MappingError(
                    f"{path.name}：service 段与其他分片不一致；"
                    f"约定：仅在 _meta.yaml 中声明 service")
        for key in ('enums', 'schemas'):
            for name, body in (doc.get(key) or {}).items():
                if name in merged[key]:
                    raise MappingError(
                        f"{path.name}：{key}.{name} 重复定义；"
                        f"分片之间禁止重名（消除歧义）")
                merged[key][name] = body
        for g in doc.get('groups') or []:
            gname = g.get('name')
            if not gname:
                raise MappingError(f"{path.name}：group 缺少 name")
            if gname in seen_groups:
                prev_path, prev_g = seen_groups[gname]
                if prev_g != g:
                    raise MappingError(
                        f"group「{gname}」在 {prev_path.name} 与 {path.name} "
                        f"内容不一致；同名分组只能定义一次")
                continue
            seen_groups[gname] = (path, g)
            merged['groups'].append(g)
    if merged['service'] is None:
        raise MappingError("缺少 service 段（推荐放在 _meta.yaml）")
    return merged


def _intercept_paths_relative_to_servers(openapi: Dict[str, Any]) -> None:
    """
    强制 OpenAPI paths 仅含相对路径：若存在 servers[].url 且 paths 的 key 误带该前缀，
    则剥除前缀（与 YApi 项目「路径前缀」叠加时避免 /api/api/... 重复）。
    正常由 Builder 已生成相对路径时，本函数不改变内容。
    """
    servers = openapi.get('servers') or []
    if not servers:
        return
    base = (servers[0].get('url') or '').rstrip('/')
    if not base:
        return
    paths = openapi.get('paths')
    if not isinstance(paths, dict) or not paths:
        return
    new_paths: Dict[str, Any] = {}
    for key, ops in paths.items():
        if key == base or key.startswith(base + '/'):
            stripped = '/' + key[len(base):].lstrip('/') if key != base else '/'
            new_paths[stripped] = ops
        else:
            new_paths[key] = ops
    openapi['paths'] = new_paths


def _load_mapping(input_path: Path) -> Dict[str, Any]:
    if input_path.is_file():
        _check_forbidden_names([input_path])
        try:
            return yaml.safe_load(input_path.read_text(encoding='utf-8'))
        except yaml.YAMLError as e:
            raise MappingError(f"YAML 解析失败 {input_path.name}：{e}")
    if input_path.is_dir():
        files = sorted([p for p in input_path.iterdir()
                        if p.is_file() and p.suffix.lower() in ('.yaml', '.yml')])
        if not files:
            raise MappingError(f"目录为空：{input_path}")
        _check_forbidden_names(list(input_path.iterdir()))
        parts: List[Tuple[Path, Dict[str, Any]]] = []
        for fp in files:
            try:
                parts.append((fp, yaml.safe_load(fp.read_text(encoding='utf-8'))))
            except yaml.YAMLError as e:
                raise MappingError(f"YAML 解析失败 {fp.name}：{e}")
        return _merge_mappings(parts)
    raise MappingError(f"路径不存在：{input_path}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description='将 mapping YAML 转换为 OpenAPI 3.0 yapi.json',
    )
    parser.add_argument('mapping',
                        help='mapping YAML 文件路径，或包含分片的目录（推荐 .yapi-tmp/mapping/）')
    parser.add_argument('--output', '-o', default=None,
                        help='输出 yapi.json 路径，默认 <service-root>/yapi.json')
    parser.add_argument('--dry-run', action='store_true',
                        help='只打印统计，不写文件')
    args = parser.parse_args()

    input_path = Path(args.mapping).expanduser().resolve()
    try:
        mapping = _load_mapping(input_path)
    except MappingError as e:
        print(f"错误：{e}", file=sys.stderr)
        return 1

    try:
        openapi = Builder(mapping).build()
    except MappingError as e:
        print(f"mapping 数据错误：{e}", file=sys.stderr)
        return 1

    _intercept_paths_relative_to_servers(openapi)

    endpoint_count = sum(1 for ms in openapi['paths'].values() for _ in ms)
    schema_count = len(openapi['components']['schemas'])
    print(f"  service: {openapi['info']['title']}")
    print(f"  endpoints: {endpoint_count}")
    print(f"  schemas:   {schema_count}")
    print(f"  tags:      {len(openapi['tags'])}")

    if args.dry_run:
        return 0

    if args.output:
        output_path = Path(args.output).expanduser().resolve()
    else:
        default_dir = input_path.parent if input_path.is_file() else input_path.parent
        output_path = default_dir / 'yapi.json'
    output_path.write_text(json.dumps(openapi, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"已生成 OpenAPI 3.0：{output_path}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
