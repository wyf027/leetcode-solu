"""Use the OpenAI Responses profile already configured for Claude Desktop."""

import json
import re
import sqlite3
from contextlib import closing
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener


class ModelError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class DesktopOpenAI:
    endpoint = "https://api.openai.com/v1/responses"
    model = "gpt-6.1-terra"

    def __init__(self, token):
        self.token = token

    @classmethod
    def load(cls):
        db = Path.home() / ".cc-switch/cc-switch.db"
        try:
            with closing(sqlite3.connect(f"{db.as_uri()}?mode=ro", uri=True)) as connection:
                rows = connection.execute(
                    """SELECT settings_config, meta FROM providers
                       WHERE app_type = 'claude-desktop' AND name = 'OpenAI API'
                       ORDER BY is_current DESC LIMIT 1"""
                )
                settings, meta = rows.fetchone() or ("{}", "{}")
            env = json.loads(settings).get("env", {})
            metadata = json.loads(meta)
            token = env.get("ANTHROPIC_AUTH_TOKEN")
            if (
                env.get("ANTHROPIC_BASE_URL", "").rstrip("/") == "https://api.openai.com/v1"
                and metadata.get("apiFormat") == "openai_responses"
                and isinstance(token, str) and re.fullmatch(r"[^\s]{1,512}", token)
            ):
                return cls(token)
        except (OSError, sqlite3.Error, ValueError, TypeError, AttributeError):
            pass
        raise ModelError("读取不到桌面 Claude 的 OpenAI API 配置。")

    def respond(self, instructions, messages, tool, on_delta, *, use_tool=True):
        body = {
            "model": self.model,
            "instructions": instructions,
            "input": messages,
            "store": False,
            "stream": True,
            "reasoning": {"effort": "low"},
            "max_output_tokens": 1400,
            "parallel_tool_calls": False,
            "tool_choice": "auto" if use_tool else "none",
            "tools": [tool],
        }
        request = Request(
            self.endpoint, data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.token}", "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
        )
        try:
            with build_opener(NoRedirect()).open(request, timeout=35) as response:
                for event in sse_events(response):
                    kind = event.get("type")
                    if kind in {"response.output_text.delta", "response.refusal.delta"}:
                        delta = event.get("delta")
                        if isinstance(delta, str) and delta:
                            on_delta(delta)
                    elif kind == "response.completed":
                        output = event.get("response", {}).get("output")
                        if isinstance(output, list):
                            return output
                        raise ModelError("OpenAI API 返回内容格式无效。")
                    elif kind in {"response.failed", "response.incomplete", "error"}:
                        raise ModelError("OpenAI API 未返回完整回复。")
        except HTTPError as exc:
            if exc.code == 404:
                message = f"当前 OpenAI API 配置无法访问 {self.model}。"
            elif exc.code in (401, 403):
                message = "桌面 Claude 的 OpenAI API 认证失败或当前模型权限不足。"
            elif exc.code == 429:
                message = "OpenAI API 达到请求速率或额度限制。"
            else:
                message = f"OpenAI API 请求失败（HTTP {exc.code}）。"
            raise ModelError(message) from exc
        except (URLError, TimeoutError, OSError, ValueError) as exc:
            raise ModelError("暂时无法获取 OpenAI API 响应。") from exc
        raise ModelError("OpenAI API 的回复流提前结束。")


def sse_events(stream):
    data = []
    for raw_line in stream:
        line = raw_line.rstrip(b"\r\n")
        if not line and data:
            payload = b"\n".join(data)
            data.clear()
            if payload != b"[DONE]":
                yield json.loads(payload)
        elif line.startswith(b"data:"):
            data.append(line[5:].removeprefix(b" "))


def response_text(output):
    parts = []
    for item in output:
        if item.get("type") != "message":
            continue
        for part in item.get("content", []):
            field = {"output_text": "text", "refusal": "refusal"}.get(part.get("type"))
            if field and part.get(field, "").strip():
                parts.append(part[field].strip())
    return "\n".join(parts)
