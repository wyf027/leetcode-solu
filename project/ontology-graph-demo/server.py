# /// script
# requires-python = ">=3.10"
# dependencies = ["PyYAML==6.0.3"]
# ///
"""Loopback server for the ModelScope ontology conversation demo."""

import argparse
import json
import os
import re
import runpy
import shutil
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import RLock
from urllib.parse import parse_qs, urlsplit

from desktop_openai import DesktopOpenAI, ModelError, response_text

ROOT = Path(__file__).resolve().parent
SKILL = ROOT / "vendor/ontology/scripts/ontology.py"
LOAD_GRAPH = runpy.run_path(str(SKILL))["load_graph"]
REVISION = "58623aaf38be879a9361a13df21f3e883ae8ac2a"
STORAGE = Path(os.environ.get("ONTOLOGY_DEMO_DATA", str(ROOT / ".data"))).resolve()
GUARD = RLock()
SESSION_KEY = re.compile(r"[a-f0-9]{32}")
GRAPH = "memory/ontology/graph.jsonl"
SCHEMA_FILE = "memory/ontology/schema.yaml"

ENTITY_NAMES = {"Person": "人员", "Project": "项目", "Task": "任务", "Document": "文档"}
STATUS = {"open": "待办", "in_progress": "进行中", "blocked": "阻塞", "done": "已完成", "cancelled": "已取消"}
RELATION_SCHEMA = {
    "has_owner": {"from_types": ["Project"], "to_types": ["Person"], "cardinality": "many_to_one"},
    "has_task": {"from_types": ["Project"], "to_types": ["Task"], "cardinality": "one_to_many"},
    "assigned_to": {"from_types": ["Task"], "to_types": ["Person"], "cardinality": "many_to_one"},
    "depends_on": {"from_types": ["Task"], "to_types": ["Task"], "acyclic": True},
    "part_of": {"from_types": ["Document"], "to_types": ["Project"], "cardinality": "many_to_one"},
}
SCHEMA = {
    "types": {
        "Person": {"required": ["name"]},
        "Project": {"required": ["name"]},
        "Task": {"required": ["title", "status"], "status_enum": list(STATUS)},
        "Document": {"required": ["title"]},
    },
    "relations": RELATION_SCHEMA,
}

RELATION_NAMES = {
    "has_owner": "负责人", "has_task": "包含任务", "assigned_to": "指派给",
    "depends_on": "依赖", "part_of": "属于",
}

NAME = {"type": "string", "description": "精确实体名称，保留用户原文，用对话上下文消解指代。"}
ENTITY_KIND = {"type": "string", "enum": list(ENTITY_NAMES)}
TASK_STATUS = {"type": "string", "enum": list(STATUS)}
OPERATION_TYPES = {
    "create": ("创建或查找到同名实体。", {"kind": ENTITY_KIND, "name": NAME}),
    "add_project_owner": ("创建项目及负责人并关联，也适用于同时补录两者。", {"project": NAME, "person": NAME}),
    "add_child": ("给现有项目新增任务或文档。可同时指派任务，文档的 person 须为 null。", {
        "project": NAME, "kind": {"type": "string", "enum": ["Task", "Document"]}, "name": NAME,
        "person": {"type": ["string", "null"], "description": "指定的任务负责人姓名，未指定时使用 null。"},
    }),
    "owner": ("给现有项目设置负责人。", {"project": NAME, "person": NAME}),
    "assign": ("给现有任务设置负责人。", {"task": NAME, "person": NAME}),
    "depends": ("记录 source 任务依赖 target 任务，target 是前置任务。", {"source": NAME, "target": NAME}),
    "status": ("更新现有任务的状态。", {"name": NAME, "status": TASK_STATUS}),
    "project_tasks": ("查项目下的任务。", {"project": NAME}),
    "person_work": ("查某人负责的项目和任务。", {"person": NAME}),
    "dependencies": ("查任务的前置依赖。", {"name": NAME}),
    "inspect": ("查询指定实体的属性和双向关系，可回答项目由谁负责、任务状态等问题。", {
        "name": NAME, "kind": {"type": ["string", "null"], "enum": [*ENTITY_NAMES, None]},
    }),
    "list_type": ("列出某类实体。status 仅用来筛选 Task，其余类型传 null。", {
        "kind": ENTITY_KIND, "status": {"type": ["string", "null"], "enum": [*STATUS, None]},
    }),
    "list": ("获取图谱统计。", {}),
    "validate": ("校验全图。", {}),
}
MUTATIONS = {"create", "add_project_owner", "add_child", "owner", "assign", "depends", "status"}


def object_schema(properties):
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


ONTOLOGY_TOOL = {
    "type": "function",
    "name": "ontology_turn",
    "description": "在当前对话图谱按顺序执行一组读写操作。所有写入作为一轮一起校验。",
    "strict": True,
    "parameters": object_schema({"operations": {
        "type": "array", "minItems": 1, "maxItems": 8,
        "items": {"anyOf": [
            object_schema({"action": {"type": "string", "enum": [action], "description": description}, **fields})
            for action, (description, fields) in OPERATION_TYPES.items()
        ]},
    }}),
}
INSTRUCTIONS = """你是图谱工作台的中文助手。对图谱的查询、校验和变更直接调用 ontology_turn，等到工具返回再回复。
工作实体有项目、人员、任务和文档。用户明确要求记录，或在图谱工作台中明确陈述要录入的工作事实时，提取实体和关系。
如果一条消息包含多件事，在同一次工具调用中按顺序列出操作。一个 ontology_turn 最多八项操作。
保留原始名称，去掉作为引用符的书名号和引号。遇到明确的上下文指代，使用上一轮实际返回过的名字。确实有歧义时，简短询问。
问候、闲聊、概念解释、假设、澄清直接回答。不要因提到某个实体就创建它，也不要关联未明确说明的实体。所有回复用简短纯文本，避免 Markdown 标记。
项目与负责人可用 add_project_owner 一起录入。向现有项目加入任务可用 add_child 同时指派。任务依赖的箭头从任务指向前置任务。
工具返回后，只用已提交的技能结果回复。简短直接。保留涉及的名称、数量、状态和错误原因，不编造。"""


class SkillError(Exception):
    pass


class ClientDisconnected(Exception):
    pass


def decode_operations(arguments):
    try:
        operations = json.loads(arguments)["operations"]
        if not isinstance(operations, list) or not 1 <= len(operations) <= 8:
            raise ValueError
        for operation in operations:
            action = operation["action"]
            _, fields = OPERATION_TYPES[action]
            if set(operation) != {"action", *fields}:
                raise ValueError
            for name, schema in fields.items():
                value = operation[name]
                if "enum" in schema:
                    if value not in schema["enum"]:
                        raise ValueError
                elif value is None and schema["type"] == ["string", "null"]:
                    continue
                elif not isinstance(value, str) or not 1 <= len(value.strip()) <= 250 or "\x00" in value:
                    raise ValueError
                elif isinstance(value, str):
                    operation[name] = value.strip()
        return operations
    except (TypeError, KeyError, ValueError) as exc:
        raise ModelError("OpenAI API 返回的图谱操作格式无效。") from exc


def label(entity):
    props = entity["properties"]
    return props.get("name", props.get("title", entity["id"]))


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


class Turn:
    def __init__(self, directory):
        self.directory = directory
        self.trace = []

    def cli(self, command, *arguments, plain=False):
        invocation = [str(value) for value in arguments]
        try:
            result = subprocess.run(
                [sys.executable, str(SKILL), command, *invocation],
                cwd=self.directory, capture_output=True, text=True, encoding="utf-8",
                timeout=12, check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise SkillError("Ontology CLI 执行超时。") from exc
        if result.returncode:
            raise SkillError(f"Ontology CLI 执行失败。{result.stderr.strip().splitlines()[-1] if result.stderr.strip() else ''}")
        stdout = result.stdout.strip()
        output = stdout if plain else json.loads(stdout)
        self.trace.append({"command": command, "args": invocation, "output": output})
        return output

    def snapshot(self, nodes=None):
        _, edges = LOAD_GRAPH(str(self.directory / GRAPH))
        if nodes is None:
            nodes = self.cli("list")
        ids = {entity["id"] for entity in nodes}
        return {"nodes": nodes, "edges": [e for e in edges if e["from"] in ids and e["to"] in ids]}

    def lookup(self, kind, name, create=False):
        if not name:
            raise SkillError("请提供实体名称。")
        field = "title" if kind in {"Task", "Document"} else "name"
        entities = self.cli("query", "--type", kind, "--where", dump({field: name}))
        if entities:
            return entities[0]
        if not create:
            raise SkillError(f"图谱中还没有{ENTITY_NAMES[kind]}「{name}」。")
        props = {field: name}
        if kind == "Task":
            props["status"] = "open"
        return self.cli("create", "--type", kind, "--props", dump(props))

    def relate(self, source, relation, target):
        source_id, target_id = source["id"], target["id"]
        _, edges = LOAD_GRAPH(str(self.directory / GRAPH))
        if not any(e["from"] == source_id and e["rel"] == relation and e["to"] == target_id for e in edges):
            self.cli("relate", "--from", source_id, "--rel", relation, "--to", target_id)

    def validate(self):
        output = self.cli("validate", plain=True)
        if output != "Graph is valid.":
            if "cyclic dependency" in output:
                raise SkillError("ontology 拒绝了这条关系，因为它会造成任务循环依赖。")
            if "violates cardinality" in output:
                raise SkillError("ontology 拒绝了这条关系，因为对应实体已有唯一的负责人或所属项目。")
            raise SkillError(f"ontology 校验失败。\n{output}")
        return output

    def execute(self, action, fields):
        if action == "add_project_owner":
            project = self.lookup("Project", fields["project"], create=True)
            person = self.lookup("Person", fields["person"], create=True)
            self.relate(project, "has_owner", person)
            return f"项目「{label(project)}」的负责人是{label(person)}。", [project, person]
        if action == "add_child":
            project = self.lookup("Project", fields["project"])
            child = self.lookup(fields["kind"], fields["name"], create=True)
            if child["type"] == "Document":
                if fields["person"]:
                    raise SkillError("文档可以关联项目。指派操作适用于任务。")
                self.relate(child, "part_of", project)
                return f"文档「{label(child)}」已关联到项目「{label(project)}」。", [child, project]
            self.relate(project, "has_task", child)
            reply = f"「{label(child)}」已加入项目「{label(project)}」。"
            focused = [project, child]
            if fields["person"]:
                person = self.lookup("Person", fields["person"], create=True)
                self.relate(child, "assigned_to", person)
                reply += f" 负责人是{label(person)}。"
                focused.append(person)
            return reply, focused
        if action in {"owner", "assign"}:
            kind, relation = ("Project", "has_owner") if action == "owner" else ("Task", "assigned_to")
            entity = self.lookup(kind, fields["project"] if action == "owner" else fields["task"])
            person = self.lookup("Person", fields["person"], create=True)
            self.relate(entity, relation, person)
            return f"「{label(entity)}」的负责人是{label(person)}。", [entity, person]
        if action == "depends":
            source = self.lookup("Task", fields["source"])
            target = self.lookup("Task", fields["target"])
            self.relate(source, "depends_on", target)
            return f"已记录「{label(source)}」依赖「{label(target)}」。", [source, target]
        if action == "status":
            task = self.lookup("Task", fields["name"])
            status = fields["status"]
            if task["properties"]["status"] != status:
                task = self.cli("update", "--id", task["id"], "--props", dump({"status": status}))
            return f"「{label(task)}」的状态是{STATUS[status]}。", [task]
        if action in {"project_tasks", "dependencies", "person_work"}:
            if action == "project_tasks":
                entity = self.lookup("Project", fields["project"])
                args = ["--rel", "has_task"]
            elif action == "dependencies":
                entity = self.lookup("Task", fields["name"])
                args = ["--rel", "depends_on"]
            else:
                entity = self.lookup("Person", fields["person"])
                args = ["--dir", "incoming"]
            related = self.cli("related", "--id", entity["id"], *args)
            entities = [row["entity"] for row in related]
            names = "、".join(f"「{label(row)}」" for row in entities)
            if action == "project_tasks":
                reply = f"项目「{label(entity)}」共有 {len(entities)} 项任务。"
            elif action == "dependencies":
                reply = f"「{label(entity)}」有 {len(entities)} 项前置任务。"
            else:
                reply = f"{label(entity)}负责 {len(entities)} 个项目或任务。"
            return reply + (f" {names}。" if names else ""), [entity, *entities]
        if action == "create":
            kind = fields["kind"]
            entity = self.lookup(kind, fields["name"], create=True)
            return f"已记录{ENTITY_NAMES[kind]}「{label(entity)}」。", [entity]
        if action == "inspect":
            name, kind = fields["name"], fields["kind"]
            if kind:
                entity = self.lookup(kind, name)
            else:
                matches = [row for row in self.cli("list") if label(row) == name]
                if len(matches) != 1:
                    raise SkillError(f"请补充「{name}」的类型。" if matches else f"图谱中没有「{name}」。")
                entity = matches[0]
            related = self.cli("related", "--id", entity["id"], "--dir", "both")
            text = [f"{ENTITY_NAMES[entity['type']]}「{label(entity)}」。"]
            if status := entity["properties"].get("status"):
                text.append(f"状态为{STATUS.get(status, status)}。")
            for row in related:
                source, target = (entity, row["entity"]) if row["direction"] == "outgoing" else (row["entity"], entity)
                text.append(f"「{label(source)}」{RELATION_NAMES.get(row['relation'], row['relation'])}「{label(target)}」。")
            return " ".join(text), [entity, *(row["entity"] for row in related)]
        if action == "list_type":
            kind, status = fields["kind"], fields["status"]
            if status and kind != "Task":
                raise SkillError("状态筛选适用于任务。")
            entities = (self.cli("query", "--type", kind, "--where", dump({"status": status}))
                        if status else self.cli("list", "--type", kind))
            names = "、".join(f"「{label(row)}」" for row in entities)
            category = (STATUS[status] if status else "") + ENTITY_NAMES[kind]
            return f"图谱中共有 {len(entities)} 个{category}。" + (f" {names}。" if names else ""), entities
        if action == "validate":
            self.validate()
            return "ontology 校验通过。", []
        nodes = self.cli("list")
        _, edges = LOAD_GRAPH(str(self.directory / GRAPH))
        return f"当前图谱有 {len(nodes)} 个节点、{len(edges)} 条关系。", []


def ontology_turn(directory, operations):
    mutating = any(operation["action"] in MUTATIONS for operation in operations)
    error = False
    # Stage the append-only log for the entire turn before publishing any writes.
    with GUARD, TemporaryDirectory(dir=directory) as scratch:
        staging = Path(scratch)
        turn = Turn(staging if mutating else directory)
        try:
            if mutating:
                if (directory / "memory").exists():
                    shutil.copytree(directory / "memory", staging / "memory")
                if not (staging / SCHEMA_FILE).exists():
                    turn.cli("schema-append", "--data", dump(SCHEMA))
            replies, focused = [], set()
            for operation in operations:
                reply, entities = turn.execute(operation["action"], operation)
                replies.append(reply)
                focused.update(row["id"] for row in entities)
            if mutating:
                turn.validate()
            graph = turn.snapshot()
            if mutating:
                (directory / GRAPH).parent.mkdir(parents=True, exist_ok=True)
                if not (directory / SCHEMA_FILE).exists():
                    os.replace(staging / SCHEMA_FILE, directory / SCHEMA_FILE)
                if (staging / GRAPH).exists():
                    os.replace(staging / GRAPH, directory / GRAPH)
            reply = "\n".join(replies)
        except SkillError as exc:
            error, reply, focused = True, str(exc), set()
            reader = Turn(directory)
            graph = reader.snapshot()
            turn.trace.extend(reader.trace)
    return {"reply": reply, "graph": graph, "focus": sorted(focused), "trace": turn.trace, "error": error}


def ignore_event(_kind, _payload):
    pass


def conversation(session, message, history, emit=ignore_event):
    directory = STORAGE / session
    directory.mkdir(parents=True, exist_ok=True)
    model = None

    def relay_text(delta):
        emit("delta", {"text": delta})

    try:
        client = DesktopOpenAI.load()
        model = client.model
        emit("model", {"model": model})
        messages = [*history, {"role": "user", "content": message}]
        output = client.respond(INSTRUCTIONS, messages, ONTOLOGY_TOOL, relay_text)
        calls = [item for item in output if item.get("type") == "function_call"]
        if not calls:
            reply = response_text(output)
            if not reply:
                raise ModelError("OpenAI API 未返回对话内容。")
            result = ontology_turn(directory, [])
            return {**result, "reply": reply, "model": model, "model_calls": 1}
        if len(calls) != 1 or calls[0].get("name") != ONTOLOGY_TOOL["name"]:
            raise ModelError("OpenAI API 返回了无法执行的工具调用。")
        call = calls[0]
        result = ontology_turn(directory, decode_operations(call.get("arguments")))
    except ModelError as exc:
        snapshot = ontology_turn(directory, [])
        return {**snapshot, "reply": str(exc), "error": True, "model": model, "model_calls": 0}

    emit("graph", {key: result[key] for key in ("graph", "focus", "error")})
    facts = {"result": result["reply"], "error": result["error"]}
    followup = {"type": "function_call_output", "call_id": call["call_id"], "output": dump(facts)}
    try:
        final = client.respond(
            INSTRUCTIONS, [*messages, *output, followup], ONTOLOGY_TOOL, relay_text, use_tool=False,
        )
        reply = response_text(final)
        if not reply:
            raise ModelError("OpenAI API 未返回图谱操作摘要。")
    except ModelError as exc:
        return {**result, "model": model, "model_calls": 1, "model_notice": str(exc)}
    return {**result, "reply": reply, "model": model, "model_calls": 2}


def conversation_history(body):
    prior = body.get("history", [])
    if not isinstance(prior, list) or len(prior) > 10:
        raise ValueError
    messages = []
    for item in prior:
        if not isinstance(item, dict):
            raise ValueError
        role, content = item.get("role"), item.get("content")
        if role not in {"user", "assistant"} or not isinstance(content, str) or not 1 <= len(content) <= 1000:
            raise ValueError
        messages.append({"role": role, "content": content})
    return messages


STATIC = {"/": ("index.html", "text/html; charset=utf-8")}
STATIC.update({f"/{name}": (name, content_type) for name, content_type in [
    ("styles.css", "text/css; charset=utf-8"), ("app.js", "text/javascript; charset=utf-8"),
    ("g6.min.js", "text/javascript; charset=utf-8"),
]})


class Handler(BaseHTTPRequestHandler):
    def host_ok(self):
        port = self.server.server_port
        return self.headers.get("Host") in {f"127.0.0.1:{port}", f"localhost:{port}"}

    def respond(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store" if content_type.startswith(("application/json", "text/html")) else "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def json(self, status, body):
        self.respond(status, dump(body).encode("utf-8"), "application/json; charset=utf-8")

    def do_GET(self):
        if not self.host_ok():
            return self.json(403, {"error": "仅支持本机访问。"})
        url = urlsplit(self.path)
        if url.path == "/api/state":
            session = parse_qs(url.query).get("session", [""])[0]
            if not SESSION_KEY.fullmatch(session):
                return self.json(400, {"error": "无效的对话 ID。"})
            with GUARD:
                directory = STORAGE / session
                directory.mkdir(parents=True, exist_ok=True)
                graph = Turn(directory).snapshot()
            try:
                model = DesktopOpenAI.load().model
            except ModelError:
                model = None
            return self.json(200, {"graph": graph, "version": "1.0.4", "revision": REVISION, "model": model})
        if url.path in STATIC:
            file, content_type = STATIC[url.path]
            return self.respond(200, (ROOT / "public" / file).read_bytes(), content_type)
        self.json(404, {"error": "页面不存在。"})

    def stream_turn(self, session, message, history):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store, no-transform")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Accel-Buffering", "no")
        self.close_connection = True
        self.end_headers()

        def emit(kind, payload):
            try:
                frame = "data: " + dump({"type": kind, **payload}) + "\n\n"
                self.wfile.write(frame.encode("utf-8"))
                self.wfile.flush()
            except OSError as exc:
                raise ClientDisconnected from exc

        try:
            try:
                result = conversation(session, message, history, emit)
            except (OSError, SkillError, ValueError) as exc:
                self.log_error("Turn failed: %s", exc)
                emit("error", {"message": "本地 ontology 执行失败，请检查服务日志。"})
            else:
                emit("done", {"result": result})
        except ClientDisconnected:
            return

    def do_POST(self):
        if not self.host_ok() or self.headers.get("Origin") != "http://" + self.headers.get("Host", ""):
            return self.json(403, {"error": "请从本机演示页面发起请求。"})
        if self.path != "/api/turn":
            return self.json(404, {"error": "页面不存在。"})
        if self.headers.get_content_type() != "application/json":
            return self.json(415, {"error": "请求应为 JSON。"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 65536:
                return self.json(413, {"error": "消息长度超出范围。"})
            body = json.loads(self.rfile.read(length))
            session, message = body["session"], body["message"]
            history = conversation_history(body)
            if not isinstance(session, str) or not SESSION_KEY.fullmatch(session):
                raise ValueError
            if not isinstance(message, str) or not 0 < len(message.strip()) <= 1000 or "\x00" in message:
                raise ValueError
        except (ValueError, TypeError, KeyError):
            return self.json(400, {"error": "请输入 1 至 1,000 个字符。"})
        accepted = self.headers.get("Accept", "").split(",")
        if any(value.split(";")[0].strip().lower() == "text/event-stream" for value in accepted):
            return self.stream_turn(session, message.strip(), history)
        try:
            result = conversation(session, message.strip(), history)
        except (OSError, SkillError, ValueError) as exc:
            self.log_error("Turn failed: %s", exc)
            return self.json(500, {"error": "本地 ontology 执行失败，请检查服务日志。"})
        self.json(200, result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    arguments = parser.parse_args()
    with ThreadingHTTPServer(("127.0.0.1", arguments.port), Handler) as server:
        print(f"Ontology demo: http://127.0.0.1:{server.server_port}", flush=True)
        server.serve_forever()
