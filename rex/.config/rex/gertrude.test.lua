local real = rex
local registered = {}
local calls = {}
local queued = {}
local commands = {}
local watchers = {}
local command_result = {ok = true, stdout = "", stderr = ""}
local rex_path = "/fixture/Rex Server.app/Contents/MacOS/rex"
local lookup_result = {ok = true, stdout = rex_path .. "\n", stderr = ""}

rex = {
  action = function(definition) registered[definition.name] = definition end,
  json = real.json,
  layout = real.layout,
  call = function(method, args)
    assert(method == "session.create", "must launch an independent job session")
    table.insert(calls, args)
    return {session_id = "session:test-job", initial_windows = {{window_id = "window:job", block_ids = {"block:job"}}}}
  end,
  exec = setmetatable({start = function(argv, options)
    table.insert(watchers, {argv = argv, options = options})
    return {}
  end}, {__call = function(_, argv, options)
    if argv[1] == "/bin/zsh" then
      assert(argv[2] == "-lc" and argv[3]:find("command -v rex", 1, true), "resolve the CLI in a login shell, not the server PATH")
      assert(argv[4] == "gt-rex-cli" and argv[5]:find("/Versions/Current/", 1, true), "fall back to the app's stable installation, passed as one argument")
      assert(options.timeout < 30)
      return lookup_result
    end
    table.insert(commands, {argv = argv, options = options})
    return command_result
  end}),
  client = {queue = function(name, args)
    table.insert(queued, {name = name, args = args})
  end},
}

dofile(assert(real.args.config, "pass config=/path/to/gertrude.lua"))
local count = 0
for _, definition in pairs(registered) do
  count = count + 1
  assert(not definition.title:find("Gertrude: ", 1, true), "category makes prefixes redundant")
  assert(definition.category == "Gertrude")
  for _, kind in pairs(definition.args) do
    assert(kind:sub(-1) == "?", "required args make actions unusable from the palette")
  end
  local before_jobs, before_queued = #calls, #queued
  local result = definition.run({origin = "palette", session_id = "session:source", client_id = "client:source"}, {})
  local command
  if definition.name == "gt_support" then
    assert(result == nil)
    assert(#calls == before_jobs and #queued == before_queued, "support must not open or select a job terminal")
    command = commands[#commands].argv
    assert(commands[#commands].options.cwd == os.getenv("HOME"))
    assert(commands[#commands].options.timeout < 30, "support must respect the config action deadline")
  else
    assert(result.session_id == "session:test-job")
    local job = calls[#calls]
    local title = definition.title:gsub("…$", "")
    assert(job.label == title and job.initial_windows[1].window_label == title, "sessions and tabs need readable names")
    assert(job.initial_windows[1].layout.block.options.cwd == os.getenv("HOME"))
    command = job.initial_windows[1].layout.block.options.command
    local watcher = watchers[#watchers]
    assert(watcher.options.detach == true, "cleanup must outlive the action")
    assert(watcher.options.env.REX_SESSION == false and watcher.options.env.REX_BLOCK == false
      and watcher.options.env.REX_CLIENT == false, "do not inherit the source terminal's context")
    assert(watcher.argv[1] == rex_path and watcher.argv[2] == "do", "use the resolved absolute CLI path, including spaces")
    assert(watcher.argv[3] == "-s" and watcher.argv[4] == result.session_id, "watch only the job we created")
    assert(watcher.argv[5] == "--fail-fast")
    assert(watcher.argv[6] == os.getenv("HOME") .. "/.config/rex/gertrude_job_cleanup.lua")
    assert(watcher.argv[7] == "label=" .. title)
    assert(watcher.argv[8] == "window=window:job" and watcher.argv[9] == "block=block:job")
    assert(queued[#queued].name == "session.select")
    assert(queued[#queued].args.session_id == "session:test-job")
  end
  assert(command[1] == os.getenv("HOME") .. "/.local/scripts/gt")
  assert(command[2] == "rex-action")
  local payload = assert(real.json.decode(command[4]))
  assert(payload.sourceSession == "session:source")
  assert(payload.clientID == "client:source")
end
assert(count == 9, "expected nine palette actions")
assert(#calls == 8 and #watchers == 8 and #commands == 1)
local before = #queued
registered.gt_new.run({origin = "cli", session_id = "session:source"}, {name = "no-shell; $(injection)"})
assert(#queued == before, "CLI tests must not switch the visible app")
local command = calls[#calls].initial_windows[1].layout.block.options.command
assert(command[3] == "new")
assert(real.json.decode(command[4]).args.name == "no-shell; $(injection)")

command_result = {ok = false, stdout = "", stderr = "support fixture error"}
local ok, err = pcall(registered.gt_support.run, {origin = "palette"}, {})
assert(not ok and tostring(err):find("support fixture error", 1, true), "support failures must reach the UI")

for _, result in ipairs({
  {ok = false, stdout = "", stderr = "missing rex"},
  {ok = true, stdout = "rex\n", stderr = ""},
  {ok = true, stdout = "/unexpected/output\n/cli/rex\n", stderr = ""},
}) do
  lookup_result.ok, lookup_result.stdout, lookup_result.stderr = result.ok, result.stdout, result.stderr
  local before_jobs = #calls
  local ran, failure = pcall(registered.gt_open.run, {origin = "palette"}, {})
  assert(not ran and tostring(failure):find("Could not locate the Rex CLI", 1, true), tostring(failure))
  assert(#calls == before_jobs, "failed CLI lookup must not leave a job session behind")
end

local cleanup_file = assert(real.args.config:match("^(.*)/")) .. "/gertrude_job_cleanup.lua"
local function test_cleanup(windows, blocks, label, expected, view_error, list_error, destroy_error, event, payload)
  local handlers, destroyed = {}, 0
  local stopped = {}
  rex = {
    session_id = "session:test-job",
    args = {label = "New Task", window = "window:job", block = "block:job"},
    on = function(event, fn) handlers[event] = fn end,
    stop = function() error(stopped, 0) end,
    session = {
      view = function(args)
        assert(args.session_id == "session:test-job")
        if view_error then return nil, view_error end
        return {label = label or "New Task", windows = windows}
      end,
      list_blocks = function(args)
        assert(args.session_id == "session:test-job")
        if list_error then return nil, list_error end
        return {blocks = blocks}
      end,
    },
    call = function(method, args)
      assert(method == "session.destroy" and args.session_id == "session:test-job", "never touch another session")
      assert(#windows == 0 and #blocks == 0, "never close a session containing any work")
      if destroy_error then return nil, destroy_error end
      destroyed = destroyed + 1
      return {}
    end,
  }
  local ran, failure = pcall(dofile, cleanup_file)
  if expected == "repurposed" then
    assert(ran and destroyed == 0)
    local handled, event_error = pcall(handlers[event], {}, payload)
    assert(not handled and event_error == stopped and destroyed == 0, "stop watching on user changes, even before the next snapshot")
  elseif expected == "waiting" then
    assert(ran and destroyed == 0, "keep the session while its job terminal is present")
    -- The terminal and its tab close in separate events. Wait for both.
    for i = #blocks, 1, -1 do blocks[i] = nil end
    local handled, event_error = pcall(handlers.session_view_changed)
    assert(handled and destroyed == 0, "a remaining tab must not be destroyed")
    for i = #windows, 1, -1 do windows[i] = nil end
    handled, event_error = pcall(handlers.session_view_changed)
    assert(not handled and event_error == stopped and destroyed == 1, "remove the empty parent after terminal exit")
  elseif expected == "destroyed" then
    assert(not ran and failure == stopped and destroyed == 1, "handle jobs that exited before the watcher attached")
  elseif expected == "preserved" then
    assert(not ran and failure == stopped and destroyed == 0, "leave renamed/repurposed jobs alone")
  else
    assert(not ran and failure == expected and destroyed == 0, "API failures must fail closed")
  end
end

test_cleanup({{window_id = "window:job"}}, {{block_id = "block:job"}}, nil, "waiting")
test_cleanup({}, {}, nil, "destroyed")
test_cleanup({}, {}, "My repurposed session", "preserved")
test_cleanup({{window_id = "window:other"}}, {}, nil, "preserved")
test_cleanup({{window_id = "window:job"}}, {{block_id = "block:job"}, {block_id = "block:user"}}, nil, "preserved")
test_cleanup({}, {{block_id = "block:detached"}}, nil, "preserved")
test_cleanup({}, {}, nil, "view failed", "view failed")
test_cleanup({}, {}, nil, "list failed", nil, "list failed")
test_cleanup({}, {}, nil, "destroy failed", nil, nil, "destroy failed")
test_cleanup({{window_id = "window:job"}}, {{block_id = "block:job"}}, nil, "repurposed", nil, nil, nil,
  "session_label_changed", {label = "My repurposed session"})
test_cleanup({{window_id = "window:job"}}, {{block_id = "block:job"}}, nil, "repurposed", nil, nil, nil,
  "window_created", {window_id = "window:user"})
test_cleanup({{window_id = "window:job"}}, {{block_id = "block:job"}}, nil, "repurposed", nil, nil, nil,
  "block_created", {block_id = "block:user"})
rex = real
rex.log("All nine Gertrude actions and scoped job cleanup passed with mocked Rex calls; no sessions or commands were created.")
