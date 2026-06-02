from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
from dataclasses import dataclass, field
from typing import Any, Mapping

DEFAULT_PROTOCOL_VERSION = "2024-11-05"


JSONSchema = dict[str, Any]


@dataclass(frozen=True)
class MCPServerConfig:
  name: str
  command: str
  args: list[str] = field(default_factory=list)
  env: dict[str, str] = field(default_factory=dict)
  cwd: str | None = None
  protocol_version: str = DEFAULT_PROTOCOL_VERSION

  @classmethod
  def from_dict(cls, data: Mapping[str, Any]) -> "MCPServerConfig":
    return cls(
      name=str(data["name"]),
      command=str(data["command"]),
      args=[str(arg) for arg in data.get("args", [])],
      env={str(key): str(value) for key, value in data.get("env", {}).items()},
      cwd=str(data["cwd"]) if data.get("cwd") else None,
      protocol_version=str(data.get("protocol_version", DEFAULT_PROTOCOL_VERSION)),
    )


@dataclass(frozen=True)
class MCPTool:
  server_name: str
  original_name: str
  exposed_name: str
  description: str
  input_schema: JSONSchema


@dataclass
class MCPSession:
  config: MCPServerConfig
  process: asyncio.subprocess.Process
  request_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
  tools: dict[str, MCPTool] = field(default_factory=dict)


class MCPError(RuntimeError):
  pass


class MCPToolValidationError(MCPError):
  pass


class MCPClient:
  """Async MCP stdio client with tool discovery, schema conversion, and safe dispatch."""

  def __init__(self, request_timeout: float = 30.0, max_retries: int = 2, backoff_seconds: float = 0.4):
    self.request_timeout = request_timeout
    self.max_retries = max_retries
    self.backoff_seconds = backoff_seconds
    self._request_id = 0
    self._sessions: dict[str, MCPSession] = {}
    self._tools_by_exposed_name: dict[str, MCPTool] = {}

  @property
  def tools(self) -> list[MCPTool]:
    return sorted(self._tools_by_exposed_name.values(), key=lambda tool: tool.exposed_name)

  async def connect_many(self, configs: list[MCPServerConfig]) -> None:
    for config in configs:
      await self.connect(config)

  async def connect(self, config: MCPServerConfig) -> list[MCPTool]:
    if config.name in self._sessions:
      return list(self._sessions[config.name].tools.values())

    env = os.environ.copy()
    env.update(config.env)

    process = await asyncio.create_subprocess_exec(
      config.command,
      *config.args,
      stdin=asyncio.subprocess.PIPE,
      stdout=asyncio.subprocess.PIPE,
      stderr=asyncio.subprocess.DEVNULL,
      cwd=config.cwd,
      env=env,
    )
    session = MCPSession(config=config, process=process)
    self._sessions[config.name] = session

    await self._request(
      session,
      "initialize",
      {
        "protocolVersion": config.protocol_version,
        "capabilities": {"tools": {}},
        "clientInfo": {"name": "auto-agent-mcp-dispatcher", "version": "0.1.0"},
      },
    )
    await self._notify(session, "notifications/initialized", {})

    tool_payload = await self._request(session, "tools/list", {})
    discovered_tools = self._parse_tools(config.name, tool_payload)

    session.tools = {tool.exposed_name: tool for tool in discovered_tools}
    self._tools_by_exposed_name.update(session.tools)
    return discovered_tools

  def format_openai_tools(self) -> list[dict[str, Any]]:
    return [
      {
        "type": "function",
        "function": {
          "name": tool.exposed_name,
          "description": tool.description,
          "parameters": ensure_object_schema(tool.input_schema),
        },
      }
      for tool in self.tools
    ]

  def format_langchain_tools(self) -> list[dict[str, Any]]:
    return [
      {
        "name": tool.exposed_name,
        "description": tool.description,
        "args_schema": ensure_object_schema(tool.input_schema),
        "server_name": tool.server_name,
        "mcp_tool_name": tool.original_name,
      }
      for tool in self.tools
    ]

  def choose_tool_for_intent(self, intent: str) -> MCPTool | None:
    matches = self.find_tools_for_intent(intent, limit=1)
    return matches[0] if matches else None

  def find_tools_for_intent(self, intent: str, limit: int = 5) -> list[MCPTool]:
    intent_tokens = tokenize(intent)
    if not intent_tokens:
      return []

    scored: list[tuple[int, MCPTool]] = []
    for tool in self.tools:
      haystack = tokenize(f"{tool.exposed_name} {tool.original_name} {tool.description}")
      score = len(intent_tokens & haystack)
      if score:
        scored.append((score, tool))

    scored.sort(key=lambda item: (-item[0], item[1].exposed_name))
    return [tool for _, tool in scored[:limit]]

  async def execute_tool(self, exposed_name: str, arguments: Mapping[str, Any] | None = None) -> dict[str, Any]:
    tool = self._tools_by_exposed_name.get(exposed_name)
    if tool is None:
      raise MCPError(f"Unknown MCP tool: {exposed_name}")

    schema = ensure_object_schema(tool.input_schema)
    args = dict(arguments or {})
    validate_arguments(schema, args)

    session = self._sessions.get(tool.server_name)
    if session is None:
      raise MCPError(f"MCP server is not connected: {tool.server_name}")

    return await self._request_with_retry(
      session,
      "tools/call",
      {"name": tool.original_name, "arguments": args},
    )

  async def close(self) -> None:
    for session in self._sessions.values():
      if session.process.returncode is not None:
        continue
      session.process.terminate()
      try:
        await asyncio.wait_for(session.process.wait(), timeout=5)
      except asyncio.TimeoutError:
        session.process.kill()
        await session.process.wait()

  async def _request_with_retry(self, session: MCPSession, method: str, params: Mapping[str, Any]) -> dict[str, Any]:
    last_error: Exception | None = None

    for attempt in range(self.max_retries + 1):
      try:
        return await self._request(session, method, params)
      except (asyncio.TimeoutError, MCPError) as error:
        last_error = error
        if attempt >= self.max_retries:
          break
        await asyncio.sleep(self.backoff_seconds * (2 ** attempt))

    raise MCPError(f"MCP request failed after retries: {method}") from last_error

  async def _request(self, session: MCPSession, method: str, params: Mapping[str, Any]) -> dict[str, Any]:
    if session.process.stdin is None or session.process.stdout is None:
      raise MCPError("MCP process stdio streams are unavailable.")

    self._request_id += 1
    request_id = self._request_id
    payload = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": dict(params)}

    async with session.request_lock:
      await write_framed_json(session.process.stdin, payload)

      while True:
        response = await asyncio.wait_for(read_framed_json(session.process.stdout), timeout=self.request_timeout)
        if response.get("id") != request_id:
          continue
        if "error" in response:
          raise MCPError(f"MCP error for {method}: {response['error']}")
        return response.get("result", {})

  async def _notify(self, session: MCPSession, method: str, params: Mapping[str, Any]) -> None:
    if session.process.stdin is None:
      raise MCPError("MCP process stdin is unavailable.")
    await write_framed_json(session.process.stdin, {"jsonrpc": "2.0", "method": method, "params": dict(params)})

  def _parse_tools(self, server_name: str, payload: Mapping[str, Any]) -> list[MCPTool]:
    tools: list[MCPTool] = []

    for raw_tool in payload.get("tools", []):
      original_name = str(raw_tool["name"])
      exposed_name = make_exposed_name(server_name, original_name)
      input_schema = ensure_object_schema(raw_tool.get("inputSchema", {}))
      description = str(raw_tool.get("description") or f"MCP tool {original_name} from {server_name}.")
      tool = MCPTool(
        server_name=server_name,
        original_name=original_name,
        exposed_name=exposed_name,
        description=description,
        input_schema=input_schema,
      )
      tools.append(tool)

    return tools


async def write_framed_json(writer: asyncio.StreamWriter, payload: Mapping[str, Any]) -> None:
  body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
  writer.write(f"Content-Length: {len(body)}\r\n\r\n".encode("ascii") + body)
  await writer.drain()


async def read_framed_json(reader: asyncio.StreamReader) -> dict[str, Any]:
  first_line = await reader.readline()
  if not first_line:
    raise MCPError("MCP server closed stdout.")

  if first_line.lstrip().startswith(b"{"):
    return json.loads(first_line.decode("utf-8"))

  headers = parse_header_line(first_line)
  while True:
    line = await reader.readline()
    if line in (b"\r\n", b"\n", b""):
      break
    headers.update(parse_header_line(line))

  content_length = int(headers.get("content-length", "0"))
  if content_length <= 0:
    raise MCPError("MCP response did not include a valid Content-Length header.")

  body = await reader.readexactly(content_length)
  return json.loads(body.decode("utf-8"))


def parse_header_line(line: bytes) -> dict[str, str]:
  decoded = line.decode("ascii", errors="ignore").strip()
  if ":" not in decoded:
    return {}
  key, value = decoded.split(":", 1)
  return {key.lower(): value.strip()}


def make_exposed_name(server_name: str, tool_name: str) -> str:
  raw_name = f"{server_name}__{tool_name}"
  safe_name = re.sub(r"[^a-zA-Z0-9_]", "_", raw_name)
  safe_name = re.sub(r"_+", "_", safe_name).strip("_")

  if not safe_name or safe_name[0].isdigit():
    safe_name = f"tool_{safe_name}"

  if len(safe_name) <= 64:
    return safe_name

  digest = hashlib.sha1(raw_name.encode("utf-8")).hexdigest()[:8]
  return f"{safe_name[:55]}_{digest}"


def ensure_object_schema(schema: Mapping[str, Any]) -> JSONSchema:
  normalized = dict(schema or {})
  normalized.setdefault("type", "object")
  normalized.setdefault("properties", {})
  normalized.setdefault("required", [])
  return normalized


def validate_arguments(schema: Mapping[str, Any], arguments: Mapping[str, Any]) -> None:
  if schema.get("type") != "object":
    raise MCPToolValidationError("Tool input schema must be an object.")

  properties = schema.get("properties", {})
  required = schema.get("required", [])

  for key in required:
    if key not in arguments:
      raise MCPToolValidationError(f"Missing required tool argument: {key}")

  if schema.get("additionalProperties") is False:
    extra_keys = set(arguments) - set(properties)
    if extra_keys:
      raise MCPToolValidationError(f"Unexpected tool arguments: {', '.join(sorted(extra_keys))}")

  for key, value in arguments.items():
    property_schema = properties.get(key)
    if property_schema:
      validate_value(key, value, property_schema)


def validate_value(key: str, value: Any, schema: Mapping[str, Any]) -> None:
  if "enum" in schema and value not in schema["enum"]:
    raise MCPToolValidationError(f"{key} must be one of {schema['enum']}.")

  expected_type = schema.get("type")
  if isinstance(expected_type, list):
    valid = any(matches_json_type(value, candidate) for candidate in expected_type)
  elif expected_type:
    valid = matches_json_type(value, expected_type)
  else:
    valid = True

  if not valid:
    raise MCPToolValidationError(f"{key} does not match JSON schema type {expected_type}.")


def matches_json_type(value: Any, expected_type: str) -> bool:
  if expected_type == "string":
    return isinstance(value, str)
  if expected_type == "number":
    return isinstance(value, (int, float)) and not isinstance(value, bool)
  if expected_type == "integer":
    return isinstance(value, int) and not isinstance(value, bool)
  if expected_type == "boolean":
    return isinstance(value, bool)
  if expected_type == "array":
    return isinstance(value, list)
  if expected_type == "object":
    return isinstance(value, dict)
  if expected_type == "null":
    return value is None
  return True


def tokenize(value: str) -> set[str]:
  return {token for token in re.split(r"[^a-zA-Z0-9]+", value.lower()) if len(token) > 2}
