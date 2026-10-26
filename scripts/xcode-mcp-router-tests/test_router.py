import asyncio
import importlib.util
import json
import os
import plistlib
import sys
import tempfile
import unittest
from pathlib import Path

from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client
import mcp.types as types


SCRIPT = Path(__file__).resolve().parents[2] / "bin/.local/scripts/xcode-mcp-router.py"
spec = importlib.util.spec_from_file_location("xcode_router", SCRIPT)
router_module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = router_module
spec.loader.exec_module(router_module)


# A real stdio MCP server, not a mocked ClientSession, exercises wire compatibility,
# environment isolation, pagination, cancellation and subprocess cleanup.
FAKE_BRIDGE = '''
import asyncio
import json
import os
from pathlib import Path
import mcp.types as types
from mcp.server import Server
from mcp.server.stdio import stdio_server

events = Path(__file__).parents[3] / "events.jsonl"
def event(value):
    with events.open("a") as stream:
        stream.write(json.dumps(value) + "\\n")

async def listing(ctx, params):
    if params and params.cursor:
        return types.ListToolsResult(tools=[types.Tool(
            name="Error", input_schema={"type": "object"},
            description="Return an Xcode-side tool error",
        )])
    return types.ListToolsResult(tools=[types.Tool(
        name="Identity", description="Identify the selected Xcode",
        input_schema={"type": "object", "properties": {
            "delay": {"type": "number"}, "tag": {"type": "string"},
        }, "additionalProperties": False},
    )], next_cursor="second")

async def calling(ctx, params):
    event({"call": params.name, "arguments": params.arguments})
    if params.name == "Error":
        return types.CallToolResult(is_error=True,
            content=[types.TextContent(type="text", text="Xcode says no")])
    try:
        await asyncio.sleep((params.arguments or {}).get("delay", 0))
    except asyncio.CancelledError:
        event({"cancelled": True})
        raise
    return types.CallToolResult(content=[
        types.TextContent(type="text", text=json.dumps({
            "pid": os.environ["MCP_XCODE_PID"],
            "developer_dir": os.environ["DEVELOPER_DIR"],
            "meta": ctx.meta,
        })),
        types.ImageContent(type="image", data="aGVsbG8=", mime_type="image/png"),
    ], structured_content={"selected_pid": os.environ["MCP_XCODE_PID"]})

async def main():
    event({"started": os.getpid()})
    server = Server("fake-xcode", version="1", instructions="Instance-specific instructions",
                    on_list_tools=listing, on_call_tool=calling)
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())

asyncio.run(main())
'''


def value(result):
    return json.loads(result.content[0].text)


class RouterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.running = []

        async def discover():
            return list(self.running)

        self.router = router_module.Router(discover)
        self.addAsyncCleanup(self.router.close)

    def instance(self, pid=100, name="Xcode 27 beta.app", started="Mon Oct 26 10:00:00 2026"):
        app = self.root / name
        contents = app / "Contents"
        contents.mkdir(parents=True, exist_ok=True)
        with (contents / "Info.plist").open("wb") as target:
            plistlib.dump({"CFBundleIdentifier": "com.apple.dt.Xcode",
                          "CFBundleShortVersionString": "27.1", "ProductBuildVersion": "ABC"}, target)
        bridge = contents / "Developer/usr/bin/mcpbridge"
        bridge.parent.mkdir(parents=True, exist_ok=True)
        bridge.write_text(f"#!{sys.executable}\n" + FAKE_BRIDGE)
        bridge.chmod(0o755)
        item = router_module.Instance(pid, started, str(app), "27.1", "ABC")
        self.running.append(item)
        return item

    async def call(self, instance, name="Identity", arguments=None, meta=None):
        return await self.router.call("call_tool", {
            "xcode_pid": instance.pid, "name": name, "arguments": arguments or {},
        }, meta)

    def events(self, instance):
        path = Path(instance.app_path) / "Contents/events.jsonl"
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    async def test_discovers_paths_with_spaces_and_versions_without_scanning_applications(self):
        a = self.instance(name="Renamed custom Xcode.app")
        b = self.instance(pid=200, name="Xcode release.app")
        lines = [f" {item.pid} Mon Oct 26 10:00:00 2026 {item.app_path}/Contents/MacOS/Xcode"
                 for item in [b, a]]
        lines += ["300 Mon Oct 26 10:00:00 2026 /usr/bin/other", "garbage"]
        self.assertEqual(router_module.parse_instances("\n".join(lines)), [a, b])

    async def test_ignores_non_xcode_bundles(self):
        a = self.instance()
        (Path(a.app_path) / "Contents/Info.plist").write_bytes(plistlib.dumps({"CFBundleIdentifier": "other"}))
        line = f"100 Mon Oct 26 10:00:00 2026 {a.app_path}/Contents/MacOS/Xcode"
        self.assertEqual(router_module.parse_instances(line), [])

    async def test_no_xcode_is_a_successful_empty_list(self):
        result = await self.router.call("list_instances", {})
        self.assertFalse(result.is_error)
        self.assertEqual(value(result)["instances"], [])

    async def test_listing_instances_does_not_launch_bridges(self):
        a = self.instance()
        result = await self.router.call("list_instances", {})
        self.assertEqual(value(result)["instances"][0]["pid"], a.pid)
        self.assertEqual(self.events(a), [])

    async def test_lazily_lists_paginated_tools_and_instructions(self):
        a = self.instance()
        result = await self.router.call("list_tools", {"xcode_pid": a.pid})
        self.assertFalse(result.is_error, result)
        listing = value(result)
        self.assertEqual([tool["name"] for tool in listing["tools"]], ["Identity", "Error"])
        self.assertNotIn("inputSchema", listing["tools"][0])
        self.assertEqual(listing["instructions"], "Instance-specific instructions")
        result = await self.router.call("list_tools", {
            "xcode_pid": a.pid, "query": "IDENTITY", "include_schemas": True,
        })
        self.assertEqual(len(value(result)["tools"]), 1)
        self.assertIn("inputSchema", value(result)["tools"][0])

    async def test_routes_to_two_versions_concurrently_and_preserves_results(self):
        a, b = self.instance(), self.instance(pid=200, name="Xcode stable.app")
        results = await asyncio.gather(self.call(a), self.call(b))
        for instance, result in zip([a, b], results):
            self.assertFalse(result.is_error, result)
            self.assertEqual(value(result)["pid"], str(instance.pid))
            self.assertEqual(value(result)["developer_dir"], instance.app_path + "/Contents/Developer")
            self.assertEqual(result.content[1].type, "image")
            self.assertEqual(result.structured_content, {"selected_pid": str(instance.pid)})
        self.assertEqual(len(self.router.bridges), 2)

    async def test_concurrent_calls_share_one_bridge(self):
        a = self.instance()
        results = await asyncio.gather(self.call(a), self.call(a))
        self.assertTrue(all(not result.is_error for result in results), results)
        self.assertEqual(len([event for event in self.events(a) if "started" in event]), 1)

    async def test_preserves_session_metadata_but_not_progress_token(self):
        a = self.instance()
        result = await self.call(a, meta={"ai.opencode/sessionID": "ses_test", "progressToken": "outer"})
        self.assertEqual(value(result)["meta"], {"ai.opencode/sessionID": "ses_test"})

    async def test_preserves_xcode_errors_without_retry(self):
        a = self.instance()
        result = await self.call(a, "Error")
        self.assertTrue(result.is_error)
        self.assertEqual(result.content[0].text, "Xcode says no")
        self.assertEqual(len([event for event in self.events(a) if "call" in event]), 1)

    async def test_rejects_stale_pid_without_retargeting(self):
        a = self.instance()
        self.instance(pid=200, name="Other Xcode.app")
        self.running.remove(a)
        result = await self.call(a)
        self.assertTrue(result.is_error)
        self.assertIn("not running", value(result)["error"])
        self.assertEqual(len(self.router.bridges), 0)

    async def test_recycled_pid_gets_a_new_bridge(self):
        a = self.instance()
        await self.call(a)
        old = self.router.bridges[a.identity]
        self.running.clear()
        b = self.instance(started="Mon Oct 26 11:00:00 2026")
        result = await self.call(b)
        self.assertFalse(result.is_error, result)
        self.assertTrue(old.task.done())
        self.assertNotIn(a.identity, self.router.bridges)

    async def test_closed_xcode_connections_are_cleaned_up(self):
        a = self.instance()
        await self.call(a)
        bridge = self.router.bridges[a.identity]
        bridge_pid = next(event["started"] for event in self.events(a) if "started" in event)
        self.running.clear()
        await self.router.call("list_instances", {})
        self.assertTrue(bridge.task.done())
        with self.assertRaises(ProcessLookupError):
            os.kill(bridge_pid, 0)

    async def test_invalid_router_and_inner_arguments_are_not_forwarded(self):
        a = self.instance()
        for args in [{}, {"xcode_pid": True}, {"xcode_pid": -1}, {"xcode_pid": a.pid, "extra": 1}]:
            result = await self.router.call("list_tools", args)
            self.assertTrue(result.is_error)
        result = await self.call(a, arguments={"unexpected": True})
        self.assertTrue(result.is_error)
        result = await self.call(a, name="InventedTool")
        self.assertTrue(result.is_error)
        self.assertFalse(any("call" in event for event in self.events(a)))

    async def test_missing_bridge_reports_actionable_error(self):
        a = self.instance()
        a.bridge_path.unlink()
        result = await self.call(a)
        self.assertTrue(result.is_error)
        self.assertIn("no executable mcpbridge", value(result)["error"])

    async def test_close_before_worker_starts_does_not_launch_or_hang(self):
        a = self.instance()
        bridge = router_module.Bridge(a)
        await asyncio.wait_for(bridge.close(), 2)
        self.assertTrue(bridge.task.done())
        self.assertEqual(self.events(a), [])

    async def test_failed_startup_recovers_on_a_later_call(self):
        a = self.instance()
        a.bridge_path.write_text(f"#!{sys.executable}\nraise SystemExit(1)\n")
        result = await self.call(a)
        self.assertTrue(result.is_error)
        self.assertIn("Allow external agents", value(result)["error"])
        a.bridge_path.write_text(f"#!{sys.executable}\n" + FAKE_BRIDGE)
        result = await self.call(a)
        self.assertFalse(result.is_error, result)

    async def test_dead_bridge_is_not_retried_but_next_call_reconnects(self):
        a = self.instance()
        await self.call(a)
        bridge_pid = next(event["started"] for event in self.events(a) if "started" in event)
        os.kill(bridge_pid, 15)
        await asyncio.sleep(0.1)
        result = await self.call(a)
        self.assertTrue(result.is_error)
        result = await self.call(a)
        self.assertFalse(result.is_error, result)
        self.assertEqual(len([event for event in self.events(a) if "started" in event]), 2)

    async def test_cancellation_reaches_xcode_and_connection_remains_usable(self):
        a = self.instance()
        # Warm the connection so cancellation tests the call, not interpreter startup.
        await self.call(a)
        task = asyncio.create_task(self.call(a, arguments={"delay": 30, "tag": "cancel"}))
        for _ in range(200):
            if any(event.get("arguments", {}).get("tag") == "cancel" for event in self.events(a)):
                break
            await asyncio.sleep(0.01)
        else:
            self.fail("Call did not reach the bridge")
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        result = await asyncio.wait_for(self.call(a), 5)
        self.assertFalse(result.is_error, result)
        self.assertTrue(any(event.get("cancelled") for event in self.events(a)))

    async def test_real_router_stdio_handshake_and_small_catalog(self):
        params = StdioServerParameters(command=sys.executable, args=[str(SCRIPT)])
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as client:
                initialized = await client.initialize()
                self.assertIn("on demand", initialized.instructions)
                tools = await client.list_tools()
                self.assertEqual([tool.name for tool in tools.tools],
                                 ["list_instances", "list_tools", "call_tool"])
                result = await client.call_tool("list_instances", {})
                self.assertFalse(result.is_error, result)
                self.assertIn("instances", value(result))


if __name__ == "__main__":
    unittest.main()
