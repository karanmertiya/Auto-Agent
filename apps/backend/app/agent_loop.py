from __future__ import annotations

import asyncio
import inspect
import json
from dataclasses import dataclass, field
from typing import Any, Callable, Mapping, Protocol

from .mcp_client import MCPClient, MCPError


Message = dict[str, Any]


class ToolCallingModel(Protocol):
  async def complete(self, messages: list[Message], tools: list[dict[str, Any]]) -> Any:
    ...


@dataclass(frozen=True)
class ToolCall:
  id: str
  name: str
  arguments: dict[str, Any]


@dataclass
class AgentLoopConfig:
  max_steps: int = 12
  system_prompt: str = (
    "You are Auto-Agent. Convert the user's automation intent into exact MCP tool calls. "
    "Use only the provided tools, satisfy each required JSON schema field, and stop when the task is complete."
  )


@dataclass
class AgentRunResult:
  final_text: str
  messages: list[Message]
  tool_outputs: list[dict[str, Any]] = field(default_factory=list)
  steps: int = 0
  finished: bool = False


class AgentLoop:
  def __init__(self, mcp_client: MCPClient, model: ToolCallingModel | Callable[..., Any], config: AgentLoopConfig | None = None):
    self.mcp_client = mcp_client
    self.model = model
    self.config = config or AgentLoopConfig()

  async def run(self, user_intent: str, extra_context: list[Message] | None = None) -> AgentRunResult:
    if not self.mcp_client.tools:
      raise MCPError("No MCP tools are connected. Connect MCP servers before running the agent loop.")

    messages: list[Message] = [
      {"role": "system", "content": self.config.system_prompt},
      {"role": "user", "content": user_intent},
    ]
    if extra_context:
      messages.extend(extra_context)

    tool_outputs: list[dict[str, Any]] = []
    final_text = ""

    for step in range(1, self.config.max_steps + 1):
      response = await self._complete(messages)
      assistant_message = to_assistant_message(response)
      messages.append(assistant_message)

      tool_calls = extract_tool_calls(response)
      if not tool_calls:
        final_text = str(assistant_message.get("content") or "")
        return AgentRunResult(
          final_text=final_text,
          messages=messages,
          tool_outputs=tool_outputs,
          steps=step,
          finished=True,
        )

      for tool_call in tool_calls:
        tool_output = await self._execute_tool_call(tool_call)
        tool_outputs.append(
          {
            "tool_call_id": tool_call.id,
            "tool_name": tool_call.name,
            "output": tool_output,
          }
        )
        messages.append(
          {
            "role": "tool",
            "tool_call_id": tool_call.id,
            "name": tool_call.name,
            "content": json.dumps(tool_output, default=str),
          }
        )

    return AgentRunResult(
      final_text=final_text or "Step limit reached before the automation task was marked complete.",
      messages=messages,
      tool_outputs=tool_outputs,
      steps=self.config.max_steps,
      finished=False,
    )

  async def run_single_intent(self, intent: str, arguments: Mapping[str, Any] | None = None) -> dict[str, Any]:
    tool = self.mcp_client.choose_tool_for_intent(intent)
    if tool is None:
      raise MCPError(f"No MCP tool matched intent: {intent}")
    return await self.mcp_client.execute_tool(tool.exposed_name, arguments or {})

  async def _complete(self, messages: list[Message]) -> Any:
    tools = self.mcp_client.format_openai_tools()

    if hasattr(self.model, "complete"):
      result = self.model.complete(messages=messages, tools=tools)
      return await result if inspect.isawaitable(result) else result

    if callable(self.model):
      result = self.model(messages=messages, tools=tools)
      return await result if inspect.isawaitable(result) else result

    raise TypeError("Model must be callable or expose an async complete(messages, tools) method.")

  async def _execute_tool_call(self, tool_call: ToolCall) -> dict[str, Any]:
    try:
      return await self.mcp_client.execute_tool(tool_call.name, tool_call.arguments)
    except Exception as error:
      return {
        "error": type(error).__name__,
        "message": str(error),
      }


class OpenAIChatAdapter:
  def __init__(self, client: Any, model: str, temperature: float = 0.0):
    self.client = client
    self.model = model
    self.temperature = temperature

  async def complete(self, messages: list[Message], tools: list[dict[str, Any]]) -> Any:
    create = self.client.chat.completions.create
    kwargs = {
      "model": self.model,
      "messages": messages,
      "tools": tools,
      "temperature": self.temperature,
    }
    if inspect.iscoroutinefunction(create):
      return await create(**kwargs)
    return await asyncio.to_thread(lambda: create(**kwargs))


def extract_tool_calls(response: Any) -> list[ToolCall]:
  message = get_response_message(response)
  raw_calls = get_value(message, "tool_calls") or []
  tool_calls: list[ToolCall] = []

  for index, raw_call in enumerate(raw_calls):
    call_id = str(get_value(raw_call, "id") or f"tool-call-{index}")
    function_payload = get_value(raw_call, "function") or raw_call
    name = str(get_value(function_payload, "name"))
    raw_arguments = get_value(function_payload, "arguments") or {}

    if isinstance(raw_arguments, str):
      arguments = json.loads(raw_arguments or "{}")
    else:
      arguments = dict(raw_arguments)

    tool_calls.append(ToolCall(id=call_id, name=name, arguments=arguments))

  return tool_calls


def to_assistant_message(response: Any) -> Message:
  message = get_response_message(response)
  content = get_value(message, "content") or ""
  tool_calls = get_value(message, "tool_calls")

  normalized: Message = {"role": "assistant", "content": content}
  if tool_calls:
    normalized["tool_calls"] = normalize_tool_calls(tool_calls)
  return normalized


def normalize_tool_calls(tool_calls: Any) -> list[dict[str, Any]]:
  normalized_calls: list[dict[str, Any]] = []

  for raw_call in tool_calls:
    function_payload = get_value(raw_call, "function") or raw_call
    arguments = get_value(function_payload, "arguments") or "{}"
    if not isinstance(arguments, str):
      arguments = json.dumps(arguments)

    normalized_calls.append(
      {
        "id": str(get_value(raw_call, "id") or ""),
        "type": str(get_value(raw_call, "type") or "function"),
        "function": {
          "name": str(get_value(function_payload, "name")),
          "arguments": arguments,
        },
      }
    )

  return normalized_calls


def get_response_message(response: Any) -> Any:
  if isinstance(response, Mapping):
    choices = response.get("choices")
    if choices:
      return get_value(choices[0], "message")
    return response.get("message", response)

  choices = getattr(response, "choices", None)
  if choices:
    return get_value(choices[0], "message")

  return getattr(response, "message", response)


def get_value(value: Any, key: str) -> Any:
  if isinstance(value, Mapping):
    return value.get(key)
  return getattr(value, key, None)
