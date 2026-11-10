-- rex do rex/.config/rex/gertrude_panels.test.lua config="$PWD/rex/.config/rex/gertrude_panels.lua"
local real = rex
local home = os.getenv("HOME")
local actions = {}
local view
local calls = {}
local commands = {}
local mock = {}

rex = {
  json = real.json,
  layout = real.layout,
  action = function(definition) actions[definition.name] = definition end,
  call = function(method, args)
    if method == "session.view" then return view end
    table.insert(calls, {method = method, args = args})
    return {revision = 1}
  end,
  exec = function(argv, options)
    table.insert(commands, {argv = argv, options = options})
    return mock.result
  end,
}
dofile(assert(real.args.config, "pass config=/path/to/gertrude_panels.lua"))

for _, action in pairs(actions) do
  assert(action.category == "Gertrude")
  assert(not action.title:find("Gertrude: ", 1, true), "category makes prefixes redundant")
  assert(next(action.args) == nil, "required args make actions unusable from the palette")
end
local todo, fire = assert(actions.gt_todo), assert(actions.gt_fire_it_up)
assert(todo.title == "Toggle Todo" and fire.title == "Fire It Up")

local ctx = {origin = "key", session_id = "session:task", client_id = "client:mac"}
local tiled = {layer_id = "layer:tiled", kind = "tiled", blocks = {
  {block_id = "block:main", label = "Todos"}, {block_id = "block:api-tiled", label = "API"},
}}
local function window(id, focused, layers)
  return {window_id = id, focused_block_id = focused, layers = layers}
end
local function panel(state, labels)
  local blocks = {}
  for i, text in ipairs(labels) do blocks[i] = {block_id = "block:p" .. i, label = text} end
  return {layer_id = "layer:panel", kind = "floating", state = state, blocks = blocks}
end
local function run(action, case)
  calls, commands = {}, {}
  view = case
  return action.run(ctx, {})
end
local function check_gt(command)
  assert(#commands == 1)
  local argv = commands[1].argv
  assert(argv[1] == home .. "/.local/scripts/gt" and argv[2] == command and argv[3] == "session:task" and #argv == 3)
  assert(commands[1].options.timeout < 30, "respect the config action deadline")
  assert(commands[1].options.env.PATH:find(home .. "/.bun/bin:", 1, true) == 1, "gt needs bun, which is not on the app server PATH")
end
local function check_toggles(action, labels)
  -- Focused (any pane in the panel) → minimize.
  for i = 1, #labels do
    local result = run(action, {active_window_id = "window:b", windows = {window("window:b", "block:p" .. i, {tiled, panel(nil, labels)})}})
    assert(result.state == "minimized" and #commands == 0, labels[i])
    assert(calls[1].method == "session.set_layer_state" and calls[1].args.layer_id == "layer:panel")
    assert(calls[1].args.state == "minimized" and calls[1].args.focus == nil)
  end
  -- Minimized, visible but unfocused, or in another tab → show and focus.
  for _, case in ipairs({
    {active_window_id = "window:b", windows = {window("window:b", "block:p1", {tiled, panel("minimized", labels)})}},
    {active_window_id = "window:b", windows = {window("window:b", "block:main", {tiled, panel(nil, labels)})}},
    {active_window_id = "window:a", windows = {window("window:a", "block:a", {}), window("window:b", "block:p1", {tiled, panel(nil, labels)})}},
  }) do
    local result = run(action, case)
    assert(result.state == "focused" and #commands == 0 and #calls == 1)
    assert(calls[1].method == "session.set_layer_state" and calls[1].args.layer_id == "layer:panel")
    assert(calls[1].args.state == "normal" and calls[1].args.focus == true)
  end
end
local empty = {active_window_id = "window:b", windows = {
  window("window:a", "block:a", {{layer_id = "layer:a", kind = "tiled", blocks = {}}}),
  window("window:b", "block:main", {tiled}),
}}

-- Toggle Todo: missing → nvim with the label helper, in the active tab.
-- Tiled panes with matching labels are not the floating panel.
mock.result = {ok = true, stdout = '{"directory":"/tasks/demo","todo":"/tasks/demo/scratch/todo.md"}\n', stderr = ""}
local result = run(todo, empty)
assert(result.state == "opened")
check_gt("rex-todo")
assert(#calls == 1 and calls[1].method == "session.new_layer")
local created = calls[1].args
assert(created.session_id == "session:task" and created.window_id == "window:b" and created.focus == true)
assert(created.layout.block.label == "Todos")
assert(created.layout.block.options.cwd == "/tasks/demo")
local nvim = created.layout.block.options.command
assert(nvim[1] == "nvim" and nvim[2] == "-S" and nvim[3] == home .. "/.config/rex/gertrude_todo.nvim.lua")
assert(nvim[4] == "/tasks/demo/scratch/todo.md" and #nvim == 4)

for _, other in ipairs({"Todoss", "Todos (x)", "My Todos (3)", "Todos (3) notes", "todos (3)", "API"}) do
  assert(run(todo, {active_window_id = "window:b", windows = {window("window:b", "block:p1", {tiled, panel(nil, {other})})}}).state == "opened", other)
end
for _, text in ipairs({"Todos", "Todos (0)", "Todos (12)", "Todo", "Todo (3)"}) do
  check_toggles(todo, {text})
end

-- Fire It Up: missing → a new "Servers" tab with the three web servers in equal
-- columns on the top half and the API and ngrok on the bottom half, each in the
-- task with a shell left behind after Ctrl+C.
mock.result = {ok = true, stdout = '{"directory":"/tasks/demo","apiPort":29850}\n', stderr = ""}
result = run(fire, empty)
assert(result.state == "opened")
check_gt("rex-task")
assert(#calls == 1 and calls[1].method == "session.new_window")
created = calls[1].args
assert(created.session_id == "session:task" and created.window_label == "Servers" and created.focus == true)

local top = created.layout.split
assert(top.direction == "vertical" and top.ratio == 0.5, "two rows of equal height")
local function columns(node, share, out)
  if node.block then
    table.insert(out, {block = node.block, width = share})
    return out
  end
  assert(node.split.direction == "horizontal", "panes in a row sit side by side")
  columns(node.split.before, share * node.split.ratio, out)
  columns(node.split.after, share * (1 - node.split.ratio), out)
  return out
end
local function check_row(node, expected)
  local panes = columns(node, 1, {})
  assert(#panes == #expected)
  for i, pane in ipairs(panes) do
    assert(math.abs(pane.width - 1 / #expected) < 1e-9, "columns must be evenly sized")
    local block = pane.block
    assert(block.label == expected[i][1] and block.flavor == "com.superlogical.terminal.shell")
    assert(block.options.cwd == "/tasks/demo")
    local command = block.options.command
    assert(command[1] == "/bin/zsh" and command[2] == "-c" and command[3]:find('trap : INT; "$@"; print; exec zsh -l', 1, true))
    assert(command[4] == "fire-it-up")
    local recipe = expected[i][2]
    assert(#command == 4 + #recipe)
    for j, word in ipairs(recipe) do assert(command[4 + j] == word) end
  end
end
check_row(top.before, {
  {"Dash", {"just", "web", "dash"}}, {"Account", {"just", "web", "account"}},
  {"Storybook V2", {"just", "web", "storybook-v2"}},
})
check_row(top.after, {
  {"API", {"env", "DEVELOPER_DIR=/Applications/Xcode 26.6.app/Contents/Developer", "just", "watch-api"}},
  {"ngrok", {"/bin/bash", home .. "/.config/rex/gertrude_ngrok.sh", "29850"}},
})

-- Servers tab already open (active or not) → switch to it, start nothing.
for _, case in ipairs({
  {active_window_id = "window:a", windows = {window("window:a", "block:a", {}), {window_id = "window:s", label = "Servers", layers = {}}}},
  {active_window_id = "window:s", windows = {{window_id = "window:s", label = "Servers", layers = {}}}},
}) do
  result = run(fire, case)
  assert(result.state == "focused" and #commands == 0 and #calls == 1)
  assert(calls[1].method == "session.focus_window" and calls[1].args.window_id == "window:s")
end
-- Server-named panes elsewhere don't count as the Servers tab.
assert(run(fire, {active_window_id = "window:b", windows = {window("window:b", "block:p1", {tiled, panel(nil, {"API", "ngrok"})})}}).state == "opened")

-- Not a task session: show gt's message and create nothing.
mock.result = {ok = false, stdout = "", stderr = "gt: this Rex session isn't a Gertrude task; open a task first\n"}
for _, action in ipairs({todo, fire}) do
  local ok, err = pcall(run, action, empty)
  assert(not ok and err == "this Rex session isn't a Gertrude task; open a task first", tostring(err))
  assert(#calls == 0, "no panel without a task")
  ok, err = pcall(action.run, {origin = "cli"}, {})
  assert(not ok and tostring(err):find("Gertrude task session", 1, true))
end

-- No API port recorded yet: explain, and start nothing.
mock.result = {ok = true, stdout = '{"directory":"/tasks/demo","apiPort":null}\n', stderr = ""}
local no_port_ok, no_port_err = xpcall(function() return run(fire, empty) end, function(e) return e end)
assert(not no_port_ok and tostring(no_port_err):find("no API port", 1, true), tostring(no_port_err))
assert(#calls == 0, "never start a partial tab")

rex = real
rex.log("Toggle Todo and Fire It Up passed: open, layout, minimize, restore, refocus, and non-task cases, with mocked Rex calls.")
