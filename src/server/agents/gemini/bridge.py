#!/usr/bin/env python3
"""
Kiteva -> Google Antigravity Python SDK bridge.

Reads one JSON request payload from stdin, runs a single turn via
google.antigravity.Agent with LocalAgentConfig, enforces Kiteva's stage tool
allowlist, workspace boundary, and Blender execution policy, and streams
newline-delimited JSON (NDJSON) events to stdout.

Diagnostics must go to stderr only so stdout remains strict NDJSON.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import shlex
import sys
from typing import Any

# Keep all third-party/SDK logging off stdout so stdout stays valid NDJSON.
logging.basicConfig(stream=sys.stderr, level=logging.WARNING)

BLENDER_DENIAL = (
    "Blender execution is disabled in Kiteva. Use permitted code-based tools, "
    "or report a capability limitation when Blender is essential."
)

COMMAND_WRAPPERS = frozenset(
    {
        "timeout",
        "gtimeout",
        "env",
        "sudo",
        "exec",
        "command",
        "nohup",
        "nice",
        "time",
        "xvfb-run",
    }
)

SHELL_EXECUTABLES = frozenset(
    {
        "sh",
        "bash",
        "zsh",
        "dash",
        "pwsh",
        "powershell",
        "powershell.exe",
        "cmd",
        "cmd.exe",
    }
)

FILE_PATH_ARG_KEYS = (
    "path",
    "file_path",
    "target_file",
    "directory",
    "dir_path",
    "search_path",
    "root",
)


def emit(event: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _split_shell_tokens(command: str) -> list[str]:
    lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|()")
    lexer.whitespace_split = True
    return list(lexer)


def _invokes_blender(command: str) -> bool:
    try:
        tokens = _split_shell_tokens(command)
    except ValueError:
        # Fail closed when a command cannot be parsed safely.
        return "blender" in command.lower() or "bpy" in command.lower()

    executable = True
    shell = False
    for index, token in enumerate(tokens):
        if token in {";", "&&", "||", "|", "&", "(", ")"}:
            executable = True
            shell = False
            continue
        if shell and re.match(r"^-(?:[a-z]*c|command)$|^/c$", token, re.IGNORECASE):
            if index + 1 < len(tokens) and _invokes_blender(tokens[index + 1]):
                return True
        if not executable:
            continue
        if (
            not token
            or token.startswith("-")
            or token.isdigit()
            or re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", token)
        ):
            continue
        name = re.split(r"[\\/]", token)[-1].lower()
        if re.match(r"^blender(?:\.exe)?$", name):
            return True
        if name in COMMAND_WRAPPERS:
            continue
        executable = False
        shell = name in SHELL_EXECUTABLES
        if re.match(r"^python[\d.]*(?:\.exe)?$", name):
            if index + 2 < len(tokens) and tokens[index + 1] == "-c":
                script = tokens[index + 2]
                if re.search(
                    r"\b(?:import\s+bpy|from\s+bpy\b)|__import__\s*\(\s*['\"]bpy['\"]",
                    script,
                ):
                    return True
    return False


def _path_inside_workspace(workspace_path: str, candidate: str) -> bool:
    if not candidate:
        return True
    workspace_real = os.path.realpath(workspace_path)
    resolved = os.path.realpath(
        candidate if os.path.isabs(candidate) else os.path.join(workspace_real, candidate)
    )
    try:
        return os.path.commonpath([workspace_real, resolved]) == workspace_real
    except ValueError:
        return False


def _normalize_tool_name(name: Any, server_name: str | None) -> str:
    raw = getattr(name, "value", name)
    text = str(raw or "").strip()
    if server_name and not text.startswith("mcp__"):
        return f"mcp__{server_name}__{text}"
    return text


def _usage_to_dict(usage: Any) -> dict[str, int | None]:
    if usage is None:
        return {
            "prompt_token_count": None,
            "cached_content_token_count": None,
            "candidates_token_count": None,
            "thoughts_token_count": None,
            "total_token_count": None,
        }
    return {
        "prompt_token_count": getattr(usage, "prompt_token_count", None),
        "cached_content_token_count": getattr(usage, "cached_content_token_count", None),
        "candidates_token_count": getattr(usage, "candidates_token_count", None),
        "thoughts_token_count": getattr(usage, "thoughts_token_count", None),
        "total_token_count": getattr(usage, "total_token_count", None),
    }


def _use_vertex() -> bool:
    for key in ("GOOGLE_GENAI_USE_VERTEXAI", "GOOGLE_GENAI_USE_ENTERPRISE"):
        if str(os.environ.get(key, "")).strip().lower() in {"1", "true", "yes"}:
            return True
    return False


def _build_model_target(model_name: str, thinking_level: str | None) -> Any:
    from google.antigravity import (
        GeminiAPIEndpoint,
        GeminiModelOptions,
        ModelTarget,
        ModelType,
        ThinkingLevel,
        VertexEndpoint,
    )

    options = None
    if thinking_level:
        options = GeminiModelOptions(thinking_level=ThinkingLevel(thinking_level))

    if _use_vertex():
        endpoint = VertexEndpoint(
            project=os.environ.get("GOOGLE_CLOUD_PROJECT") or None,
            location=os.environ.get("GOOGLE_CLOUD_LOCATION") or None,
            api_key=os.environ.get("GOOGLE_API_KEY") or None,
            options=options,
        )
    else:
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or None
        endpoint = GeminiAPIEndpoint(api_key=api_key, options=options)

    return ModelTarget(name=model_name, types=[ModelType.TEXT], endpoint=endpoint)


async def run_agent(payload: dict[str, Any]) -> int:
    try:
        from google.antigravity import (
            Agent,
            AgentBehavior,
            BuiltinTools,
            CapabilitiesConfig,
            CustomSystemInstructions,
            Image,
            LocalAgentConfig,
            hooks,
        )
        from google.antigravity.hooks import policy
        from google.antigravity.types import (
            HookResult,
            McpStdioServer,
            QuestionHookResult,
            RunCommandConfig,
            SessionContinuationMode,
            StopReason,
            Text,
            Thought,
            ToolCall,
            ToolResult,
        )
    except ImportError as exc:
        emit(
            {
                "type": "error",
                "message": (
                    f"google-antigravity Python SDK is not installed ({exc}). "
                    "Run `npm run gemini:setup` or configure VIDEO_GEMINI_PYTHON."
                ),
            }
        )
        return 1

    workspace = str(payload.get("workspace") or "").strip()
    if not workspace:
        emit({"type": "error", "message": "Workspace is required."})
        return 1
    workspace_real = os.path.realpath(workspace)

    prompt = str(payload.get("prompt") or "")
    if not prompt:
        emit({"type": "error", "message": "Prompt is required."})
        return 1

    model_name = str(payload.get("model") or "gemini-4-neon").strip()
    thinking_level = payload.get("thinkingLevel")
    text_only = bool(payload.get("textOnly", False))
    read_only = bool(payload.get("readOnly", False))

    raw_enabled_tools = payload.get("enabledTools") or []
    allowed_native_tools = set()
    enabled_builtin_tools: list[BuiltinTools] = []
    if not text_only:
        for tool_value in raw_enabled_tools:
            builtin = BuiltinTools(str(tool_value))
            enabled_builtin_tools.append(builtin)
            allowed_native_tools.add(builtin.value)

    allowed_mcp_tools = set() if text_only else {str(t) for t in (payload.get("allowedMcpTools") or [])}
    file_tool_names = {t.value for t in BuiltinTools.file_tools()}

    @hooks.pre_tool_call_decide
    def kiteva_tool_guard(tool_call: ToolCall) -> HookResult:
        if text_only:
            return HookResult(allow=False, message="This tool is unavailable in this Kiteva stage.")
        server_name = getattr(tool_call, "server_name", None)
        normalized = _normalize_tool_name(tool_call.name, server_name)
        if server_name or normalized.startswith("mcp__"):
            if normalized not in allowed_mcp_tools:
                return HookResult(
                    allow=False, message="This MCP tool is unavailable in this Kiteva stage."
                )
            return HookResult(allow=True)

        if normalized not in allowed_native_tools:
            return HookResult(allow=False, message="This tool is unavailable in this Kiteva stage.")

        args = tool_call.args if isinstance(tool_call.args, dict) else {}
        if normalized in file_tool_names:
            canonical = getattr(tool_call, "canonical_path", None)
            if isinstance(canonical, str) and canonical and not _path_inside_workspace(
                workspace_real, canonical
            ):
                return HookResult(
                    allow=False, message="File access outside the Kiteva project workspace is denied."
                )
            for key in FILE_PATH_ARG_KEYS:
                candidate = args.get(key)
                if isinstance(candidate, str) and candidate and not _path_inside_workspace(
                    workspace_real, candidate
                ):
                    return HookResult(
                        allow=False,
                        message="File access outside the Kiteva project workspace is denied.",
                    )

        if normalized == BuiltinTools.RUN_COMMAND.value:
            command = args.get("command") or args.get("CommandLine") or args.get("cmd")
            if not isinstance(command, str):
                return HookResult(allow=False, message="The command could not be inspected.")
            if _invokes_blender(command):
                return HookResult(allow=False, message=BLENDER_DENIAL)

        return HookResult(allow=True)

    @hooks.on_interaction
    def cancel_interaction(_spec: Any) -> QuestionHookResult:
        return QuestionHookResult(responses=[], cancelled=True)

    mcp_servers: list[McpStdioServer] = []
    if not text_only:
        for raw_server in payload.get("mcpServers") or []:
            if not isinstance(raw_server, dict):
                continue
            enabled = [str(t) for t in (raw_server.get("enabledTools") or [])]
            if not enabled:
                continue
            mcp_servers.append(
                McpStdioServer(
                    name=str(raw_server["name"]),
                    command=str(raw_server["command"]),
                    args=[str(a) for a in (raw_server.get("args") or [])],
                    env={str(k): str(v) for k, v in (raw_server.get("env") or {}).items()},
                    timeout_seconds=int(raw_server.get("timeoutSeconds") or 60),
                    enabled_tools=enabled,
                    force_all_tools_eager=True,
                )
            )

    policies: list[Any]
    if text_only:
        policies = [policy.deny_all()]
    else:
        # Workspace-only blocks out-of-workspace file tools; allow_all approves
        # remaining calls after kiteva_tool_guard has enforced stage/MCP/Blender rules.
        policies = [*policy.workspace_only([workspace_real]), policy.allow_all()]

    capabilities = CapabilitiesConfig(
        enable_subagents=False,
        agent_behavior=AgentBehavior.AUTONOMOUS,
        enabled_tools=enabled_builtin_tools,
        run_command_config=RunCommandConfig(
            enable_sandbox=not (text_only or read_only),
            enable_daemons=False,
        ),
    )

    skills_paths: list[str] = []
    if not text_only:
        for candidate in payload.get("skillsPaths") or []:
            resolved = os.path.realpath(str(candidate))
            if os.path.isdir(resolved):
                skills_paths.append(resolved)

    config_kwargs: dict[str, Any] = {
        "model": _build_model_target(
            model_name, str(thinking_level) if isinstance(thinking_level, str) else None
        ),
        "capabilities": capabilities,
        "policies": policies,
        "hooks": [kiteva_tool_guard, cancel_interaction],
        "workspaces": [workspace_real],
        "mcp_servers": mcp_servers,
    }

    system_prompt = payload.get("systemPrompt")
    if isinstance(system_prompt, str) and system_prompt.strip():
        config_kwargs["system_instructions"] = CustomSystemInstructions(text=system_prompt.strip())

    json_schema = payload.get("jsonSchema")
    if isinstance(json_schema, dict) and json_schema:
        config_kwargs["response_schema"] = json_schema

    app_data_dir = payload.get("appDataDir")
    if isinstance(app_data_dir, str) and app_data_dir.strip():
        os.makedirs(app_data_dir.strip(), exist_ok=True)
        config_kwargs["app_data_dir"] = app_data_dir.strip()

    save_dir = payload.get("saveDir")
    if isinstance(save_dir, str) and save_dir.strip():
        os.makedirs(save_dir.strip(), exist_ok=True)
        config_kwargs["save_dir"] = save_dir.strip()

    if skills_paths:
        config_kwargs["skills_paths"] = skills_paths

    session_id = payload.get("sessionId")
    if isinstance(session_id, str) and session_id.strip():
        config_kwargs["conversation_id"] = session_id.strip()
        config_kwargs["session_continuation_mode"] = SessionContinuationMode.RESUME
    else:
        config_kwargs["session_continuation_mode"] = SessionContinuationMode.CREATE_ONLY

    config = LocalAgentConfig(**config_kwargs)

    prompt_text = (
        f"{prompt}\n\nReturn only JSON matching this output schema:\n{json.dumps(json_schema)}"
        if isinstance(json_schema, dict) and json_schema
        else prompt
    )
    prompt_parts: list[Any] = [prompt_text]
    for raw_image in payload.get("images") or []:
        if not isinstance(raw_image, dict):
            continue
        mime_type = str(raw_image.get("mimeType") or "")
        data_b64 = str(raw_image.get("dataBase64") or "")
        if mime_type and data_b64:
            prompt_parts.append(Image(data=base64.b64decode(data_b64), mime_type=mime_type))
    chat_input: Any = prompt_parts if len(prompt_parts) > 1 else prompt_text

    tool_seq = 0
    async with Agent(config) as agent:
        conversation_id = getattr(agent, "conversation_id", None)
        if isinstance(conversation_id, str) and conversation_id:
            emit({"type": "session", "conversationId": conversation_id})

        response = await agent.chat(chat_input)
        async for chunk in response.chunks:
            if isinstance(chunk, Text):
                if chunk.text:
                    emit({"type": "text_delta", "text": chunk.text})
            elif isinstance(chunk, Thought):
                # Private model reasoning is excluded from observable activity.
                continue
            elif isinstance(chunk, ToolCall):
                tool_seq += 1
                item_id = chunk.id or f"tool-{tool_seq}"
                emit(
                    {
                        "type": "tool",
                        "itemId": item_id,
                        "toolName": getattr(chunk.name, "value", str(chunk.name)),
                        "serverName": chunk.server_name,
                    }
                )
            elif isinstance(chunk, ToolResult):
                item_id = chunk.id or f"tool-{tool_seq}"
                emit(
                    {
                        "type": "tool_result",
                        "itemId": item_id,
                        "toolName": getattr(chunk.name, "value", str(chunk.name)),
                        "serverName": chunk.server_name,
                        "failed": bool(chunk.error),
                    }
                )

        usage = await response.usage_metadata()
        stop_reason = await response.stop_reason()
        structured = await response.structured_output()
        text = await response.text()
        final_conversation_id = getattr(agent, "conversation_id", None) or conversation_id
        turn_index = len(getattr(getattr(agent, "conversation", None), "turns", []) or []) or 1

        emit(
            {
                "type": "usage",
                "usageId": f"gemini:{final_conversation_id or 'turn'}:{turn_index}",
                "responseModel": model_name,
                "usage": _usage_to_dict(usage),
            }
        )

        if stop_reason == StopReason.QUOTA_EXHAUSTED:
            emit(
                {
                    "type": "error",
                    "code": "model_capacity",
                    "message": "Gemini model quota or capacity exhausted.",
                }
            )
            return 1

        if stop_reason != StopReason.UNSPECIFIED:
            emit(
                {
                    "type": "error",
                    "message": f"Gemini turn did not complete ({stop_reason.value}).",
                }
            )
            return 1

        emit(
            {
                "type": "result",
                "ok": True,
                "conversationId": final_conversation_id,
                "structuredOutput": structured,
                "text": text or "",
            }
        )
    return 0


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        emit({"type": "error", "message": "No input payload received on stdin."})
        return 1
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        emit({"type": "error", "message": f"Invalid JSON input: {exc}"})
        return 1
    if not isinstance(payload, dict):
        emit({"type": "error", "message": "Bridge payload must be a JSON object."})
        return 1

    try:
        return asyncio.run(run_agent(payload))
    except Exception as exc:  # noqa: BLE001
        message = f"{type(exc).__name__}: {exc}"
        lower = message.lower()
        code = (
            "model_capacity"
            if any(
                marker in lower
                for marker in (
                    "resource_exhausted",
                    "quota",
                    "429",
                    "rate limit",
                    "overloaded",
                    "capacity",
                )
            )
            else "bridge_error"
        )
        emit({"type": "error", "code": code, "message": message})
        return 1


if __name__ == "__main__":
    sys.exit(main())
