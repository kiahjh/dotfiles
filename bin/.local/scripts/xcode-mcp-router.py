#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["mcp==2.3.0"]
# ///
"""A lazy, stdio MCP router for every running Xcode. See scripts/xcode-mcp-router.md."""

import asyncio
import json
import os
import plistlib
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path

import anyio
import jsonschema
import mcp.types as types
from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.shared.exceptions import MCPError


STARTUP_TIMEOUT = 30
CATALOG_TIMEOUT = 30
CALL_TIMEOUT = 12 * 60 * 60


@dataclass(frozen=True)
class Instance:
    pid: int
    started_at: str
    app_path: str
    version: str
    build: str

    @property
    def bridge_path(self):
        return Path(self.app_path) / "Contents/Developer/usr/bin/mcpbridge"

    @property
    def identity(self):
        # A recycled PID must not inherit a connection to a previous Xcode.
        return self.pid, self.started_at, self.app_path

    def info(self):
        return {**asdict(self), "bridge_available": os.access(self.bridge_path, os.X_OK)}


def parse_instances(output):
    instances = []
    for line in output.splitlines():
        # ps: PID, five lstart fields, then the complete executable path (with spaces).
        fields = line.split(None, 6)
        if len(fields) != 7 or not fields[0].isdigit():
            continue
        executable = fields[6]
        if not executable.endswith("/Contents/MacOS/Xcode"):
            continue
        app = Path(executable).parents[2]
        try:
            with (app / "Contents/Info.plist").open("rb") as source:
                info = plistlib.load(source)
        except (OSError, ValueError, plistlib.InvalidFileException):
            continue
        if info.get("CFBundleIdentifier") != "com.apple.dt.Xcode":
            continue
        instances.append(Instance(
            pid=int(fields[0]),
            started_at=" ".join(fields[1:6]),
            app_path=str(app),
            version=info.get("CFBundleShortVersionString", "unknown"),
            build=info.get("ProductBuildVersion", info.get("CFBundleVersion", "unknown")),
        ))
    return sorted(instances, key=lambda instance: instance.pid)


async def discover_instances():
    def discover():
        result = subprocess.run(
            ["/bin/ps", "-ww", "-axo", "pid=,lstart=,comm="],
            capture_output=True, text=True, check=True, timeout=5,
        )
        return parse_instances(result.stdout)

    return await asyncio.to_thread(discover)


async def catalog(session):
    tools = []
    cursor = None
    seen = set()
    while True:
        params = types.PaginatedRequestParams(cursor=cursor) if cursor else None
        page = await session.list_tools(params=params)
        tools.extend(page.tools)
        cursor = page.next_cursor
        if not cursor:
            return tools
        if cursor in seen:
            raise RuntimeError("Xcode returned a repeated tool-list cursor")
        seen.add(cursor)


@dataclass
class Work:
    action: object
    future: asyncio.Future
    scope: object = None

    def cancelled(self, future):
        if future.cancelled() and self.scope is not None:
            self.scope.cancel()


class Bridge:
    """Own SDK context managers in one task; serialize calls only within an instance."""

    def __init__(self, instance):
        self.instance = instance
        self.queue = asyncio.Queue()
        self.ready = asyncio.get_running_loop().create_future()
        self.scope = None
        self.closing = False
        self.task = asyncio.create_task(self.run())

    async def run(self):
        failure = RuntimeError("Xcode bridge closed; list instances and try again")
        try:
            with anyio.CancelScope() as self.scope:
                if self.closing:
                    return
                params = StdioServerParameters(
                    command=str(self.instance.bridge_path),
                    env={
                        "MCP_XCODE_PID": str(self.instance.pid),
                        "DEVELOPER_DIR": str(Path(self.instance.app_path) / "Contents/Developer"),
                    },
                )
                async with stdio_client(params) as (read, write):
                    async with ClientSession(read, write) as session:
                        with anyio.fail_after(STARTUP_TIMEOUT):
                            initialized = await session.initialize()
                        self.ready.set_result(None)
                        while True:
                            work = await self.queue.get()
                            if work.future.cancelled():
                                continue
                            try:
                                with anyio.CancelScope() as work.scope:
                                    # The caller may have cancelled while this work was queued.
                                    if work.future.cancelled():
                                        continue
                                    result = await work.action(session, initialized)
                                if not work.future.done():
                                    work.future.set_result(result)
                            except Exception as exc:
                                if not work.future.done():
                                    work.future.set_exception(exc)
                                if isinstance(exc, (anyio.BrokenResourceError, anyio.ClosedResourceError)) or (
                                    isinstance(exc, MCPError) and exc.code == types.CONNECTION_CLOSED
                                ):
                                    # Drop a dead transport; the next call creates a fresh one.
                                    # The failed operation itself is never retried.
                                    self.closing = True
                                    return
                            finally:
                                work.scope = None
        except Exception as exc:
            failure = RuntimeError(
                f"Cannot connect to Xcode PID {self.instance.pid}: {exc}. "
                "In Xcode Settings > Intelligence, enable 'Allow external agents to use "
                "Xcode tools', approve any connection prompt, and keep a project open."
            )
        finally:
            self.closing = True
            if not self.ready.done():
                self.ready.set_exception(failure)
                # Retrieve it even if the requesting client disconnected during startup.
                self.ready.exception()
            if 'work' in locals() and not work.future.done():
                work.future.set_exception(failure)
            while not self.queue.empty():
                pending = self.queue.get_nowait()
                if not pending.future.done():
                    pending.future.set_exception(failure)

    async def request(self, action):
        # Cancelling one caller must not cancel shared startup for the other callers.
        await asyncio.shield(self.ready)
        if self.closing or self.task.done():
            raise RuntimeError("Xcode bridge disconnected; list instances and try again")
        future = asyncio.get_running_loop().create_future()
        work = Work(action, future)
        future.add_done_callback(work.cancelled)
        self.queue.put_nowait(work)
        return await future

    async def close(self):
        self.closing = True
        if self.scope is not None:
            self.scope.cancel()
        await self.task


PID = {"type": "integer", "minimum": 1, "description": "PID from list_instances."}
TOOLS = [
    types.Tool(
        name="list_instances",
        description="Find all running Xcodes, including different versions. Does not launch Xcode.",
        input_schema={"type": "object", "properties": {}, "additionalProperties": False},
        annotations=types.ToolAnnotations(read_only_hint=True, open_world_hint=False),
    ),
    types.Tool(
        name="list_tools",
        description=(
            "Discover a selected Xcode's tools and server instructions. Defaults to compact "
            "names/descriptions. Filter with query; set include_schemas=true to get exact "
            "input schemas before calling tools. Xcode versions can have different tools."
        ),
        input_schema={
            "type": "object", "required": ["xcode_pid"], "additionalProperties": False,
            "properties": {
                "xcode_pid": PID,
                "query": {"type": "string", "description": "Case-insensitive name/description substring."},
                "include_schemas": {"type": "boolean", "default": False},
            },
        },
        annotations=types.ToolAnnotations(read_only_hint=True, open_world_hint=False),
    ),
    types.Tool(
        name="call_tool",
        description=(
            "Call an Xcode tool on an explicit instance. First use list_tools with "
            "include_schemas=true to learn its arguments. To identify the right project, "
            "discover and call each instance's window/workspace listing tool. Never reuse "
            "window IDs across instances. Calls can modify files or run builds/tests."
        ),
        input_schema={
            "type": "object", "required": ["xcode_pid", "name", "arguments"],
            "additionalProperties": False,
            "properties": {
                "xcode_pid": PID,
                "name": {"type": "string", "minLength": 1},
                "arguments": {"type": "object", "additionalProperties": True},
            },
        },
        annotations=types.ToolAnnotations(read_only_hint=False, destructive_hint=True),
    ),
]


def text_result(value, *, error=False):
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=json.dumps(value, ensure_ascii=False))],
        is_error=error,
    )


class Router:
    def __init__(self, discover=discover_instances):
        self.discover = discover
        self.bridges = {}

    async def instances(self):
        instances = await self.discover()
        identities = {instance.identity for instance in instances}
        stale = [key for key, bridge in self.bridges.items()
                 if key not in identities or bridge.closing or bridge.task.done()]
        for key in stale:
            bridge = self.bridges.pop(key, None)
            if bridge is not None:
                await bridge.close()
        return instances

    async def call(self, name, arguments, meta=None):
        try:
            tool = next((tool for tool in TOOLS if tool.name == name), None)
            if tool is None:
                raise ValueError(f"Unknown router tool: {name}")
            jsonschema.validate(arguments, tool.input_schema)
            instances = await self.instances()
            if name == "list_instances":
                return text_result({
                    "instances": [instance.info() for instance in instances],
                    "message": "Open Xcode and a project to use its tools." if not instances else
                               "Use list_tools with an explicit xcode_pid to connect.",
                })
            pid = arguments["xcode_pid"]
            instance = next((item for item in instances if item.pid == pid), None)
            if instance is None:
                raise ValueError(f"Xcode PID {pid} is not running. Call list_instances again.")
            if not os.access(instance.bridge_path, os.X_OK):
                raise ValueError(f"This Xcode has no executable mcpbridge: {instance.bridge_path}")
            # No await between lookup and insertion: concurrent calls share startup.
            bridge = self.bridges.get(instance.identity)
            if bridge is None:
                bridge = Bridge(instance)
                self.bridges[instance.identity] = bridge

            async def action(session, initialized):
                with anyio.fail_after(CATALOG_TIMEOUT):
                    tools = await catalog(session)
                if name == "list_tools":
                    query = arguments.get("query", "").casefold()
                    matches = [tool for tool in tools if query in
                               f"{tool.name} {tool.description or ''}".casefold()]
                    return text_result({
                        "instance": instance.info(),
                        "instructions": initialized.instructions,
                        "tools": [tool.model_dump(by_alias=True, exclude_none=True)
                                  if arguments.get("include_schemas", False) else
                                  {"name": tool.name, "description": tool.description}
                                  for tool in matches],
                    })
                target = next((tool for tool in tools if tool.name == arguments["name"]), None)
                if target is None:
                    raise ValueError(f"Unknown Xcode tool {arguments['name']!r}; call list_tools again.")
                jsonschema.validate(arguments["arguments"], target.input_schema)
                # Never automatically retry: a failed call may already have changed a project.
                # Do not forward the outer progress token; it belongs to the router connection.
                inner_meta = {key: value for key, value in (meta or {}).items()
                              if key != "progressToken"}
                return await session.call_tool(
                    target.name, arguments["arguments"],
                    read_timeout_seconds=CALL_TIMEOUT, meta=inner_meta or None,
                )

            return await bridge.request(action)
        except jsonschema.ValidationError as exc:
            return text_result({"error": f"Invalid arguments: {exc.message}"}, error=True)
        except Exception as exc:
            return text_result({"error": str(exc)}, error=True)

    async def close(self):
        bridges, self.bridges = list(self.bridges.values()), {}
        await asyncio.gather(*(bridge.close() for bridge in bridges))


async def main():
    router = Router()

    async def list_tools(ctx, params):
        return types.ListToolsResult(tools=TOOLS)

    async def call_tool(ctx, params):
        return await router.call(params.name, params.arguments or {}, params.meta)

    server = Server(
        "xcode-router", version="0.1.0",
        instructions=(
            "Access any running Xcode through this router. Start with list_instances, then "
            "list_tools for the chosen PID. Tool schemas and Xcode instructions are loaded "
            "on demand; use include_schemas=true before calling a discovered tool. "
            "Select the instance containing the intended project, not just the newest version."
        ),
        on_list_tools=list_tools, on_call_tool=call_tool,
    )
    try:
        async with stdio_server() as (read, write):
            await server.run(read, write, server.create_initialization_options())
    finally:
        await router.close()


if __name__ == "__main__":
    asyncio.run(main())
