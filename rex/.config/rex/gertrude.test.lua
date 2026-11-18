local real = rex
local home = os.getenv("HOME")
local gt = home .. "/.local/scripts/gt"
local registered = {}
local calls, queued, commands, watchers, prompts = {}, {}, {}, {}, {}
local plans, answers = {}, {}
local action_result = {ok = true, stdout = "", stderr = ""}
local rex_path = "/fixture/Rex Server.app/Contents/MacOS/rex"
local lookup_result = {ok = true, stdout = rex_path .. "\n", stderr = ""}

local function answer(kind, prompt)
  table.insert(prompts, {kind = kind, prompt = prompt})
  -- Replies like {nil, "cancelled"} need an explicit range; # can't count past a nil.
  return unpack(table.remove(answers, 1), 1, 3)
end

rex = {
  action = function(definition) registered[definition.name] = definition end,
  json = real.json,
  layout = real.layout,
  ui = {
    input = function(prompt) return answer("input", prompt) end,
    pick = function(prompt) return answer("pick", prompt) end,
  },
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
    assert(argv[1] == gt and options.cwd == home and options.timeout < 30, "respect the config action deadline")
    assert(options.env.PATH:find(home .. "/.bun/bin", 1, true), "gt needs bun, which is not on the app server PATH")
    if argv[2] == "rex-plan" then return table.remove(plans, 1) end
    assert(argv[2] == "rex-action")
    return action_result
  end}),
  client = {queue = function(name, args)
    table.insert(queued, {name = name, args = args})
  end},
}

local function reset(steps, replies)
  calls, queued, commands, watchers, prompts = {}, {}, {}, {}, {}
  plans, answers = {}, replies or {}
  for _, step in ipairs(steps) do
    if type(step) == "string" then
      table.insert(plans, {ok = false, stdout = "", stderr = step})
    else
      table.insert(plans, {ok = true, stdout = real.json.encode(step), stderr = ""})
    end
  end
end
local function request(index)
  local command = commands[index]
  assert(command.argv[2] == "rex-plan" or command.argv[2] == "rex-action")
  return assert(real.json.decode(command.argv[4]))
end
local palette = {origin = "palette", session_id = "session:source", client_id = "client:source"}

dofile(assert(real.args.config, "pass config=/path/to/gertrude.lua"))
local count = 0
for _, definition in pairs(registered) do
  count = count + 1
  assert(not definition.title:find("Gertrude: ", 1, true), "category makes prefixes redundant")
  assert(definition.category == "Gertrude")
  for _, kind in pairs(definition.args) do
    assert(kind:sub(-1) == "?", "required args make actions unusable from the palette")
  end
end
assert(count == 9, "expected nine palette actions")

-- Questions go to the palette; answers go back to gt until it says to run.
local name_question = {field = "name", kind = "input", prompt = {title = "New task", confirm = "Create task"}}
reset({{ask = name_question}, {ask = {field = "name", kind = "input", prompt = {title = "New task: already exists", value = "taken"}}},
  {run = "job", title = "New demo", focus = true}}, {{"taken"}, {"demo"}})
local result = registered.gt_new.run(palette, {})
assert(#prompts == 2 and prompts[1].kind == "input" and prompts[1].prompt.title == "New task")
assert(prompts[2].prompt.value == "taken", "re-ask with the rejected answer to edit")
assert(request(1).args.name == nil and request(2).args.name == "taken" and request(3).args.name == "demo")
assert(request(3).sourceSession == "session:source" and request(3).clientID == "client:source")
assert(result.session_id == "session:test-job")
local job = calls[1]
assert(job.label == "New demo" and job.initial_windows[1].window_label == "New demo", "sessions and tabs need readable names")
assert(job.initial_windows[1].layout.block.options.cwd == home)
local command = job.initial_windows[1].layout.block.options.command
assert(command[1] == gt and command[2] == "rex-action" and command[3] == "new")
assert(real.json.decode(command[4]).args.name == "demo", "the job gets every answer; it never asks")
local watcher = watchers[1]
assert(watcher.options.detach == true, "cleanup must outlive the action")
assert(watcher.options.env.REX_SESSION == false and watcher.options.env.REX_BLOCK == false
  and watcher.options.env.REX_CLIENT == false, "do not inherit the source terminal's context")
assert(watcher.argv[1] == rex_path and watcher.argv[2] == "do", "use the resolved absolute CLI path, including spaces")
assert(watcher.argv[3] == "-s" and watcher.argv[4] == result.session_id, "watch only the job we created")
assert(watcher.argv[5] == "--fail-fast")
assert(watcher.argv[6] == home .. "/.config/rex/gertrude_job_cleanup.lua")
assert(watcher.argv[7] == "label=New demo")
assert(watcher.argv[8] == "window=window:job" and watcher.argv[9] == "block=block:job")
assert(#queued == 1 and queued[1].name == "session.select" and queued[1].args.session_id == "session:test-job")

-- Cancelling changes nothing.
reset({{ask = name_question}}, {{nil, "cancelled"}})
assert(registered.gt_new.run(palette, {}).state == "cancelled")
assert(#calls == 0 and #watchers == 0 and #queued == 0 and #commands == 1)

-- Picks pass item IDs, or typed text with allow_other.
local pr_question = {field = "number", kind = "pick", prompt = {title = "Review a pull request", allow_other = true, items = {{id = "7"}}}}
for _, reply in ipairs({{"7"}, {{text = "#8"}}}) do
  reset({{ask = pr_question}, {run = "job", title = "Review PR", focus = true}}, {reply})
  registered.gt_pr.run(palette, {})
  assert(prompts[1].kind == "pick" and prompts[1].prompt.items[1].id == "7")
  assert(request(2).args.number == (type(reply[1]) == "table" and "#8" or "7"))
end

-- Background jobs don't take over the screen.
reset({{run = "job", title = "Finish demo", focus = false}})
registered.gt_finish.run(palette, {task = "demo", confirm = "finish demo"})
assert(#prompts == 0 and #calls == 1 and #queued == 0, "finish, discard, and refresh run in the background")
assert(request(1).args.confirm == "finish demo")

-- CLI runs never switch the visible app, and arguments are never shell text.
reset({{run = "job", title = "New x", focus = true}})
registered.gt_new.run({origin = "cli", session_id = "session:source"}, {name = "no-shell; $(injection)"})
assert(#queued == 0, "CLI tests must not switch the visible app")
assert(real.json.decode(calls[1].initial_windows[1].layout.block.options.command[4]).args.name == "no-shell; $(injection)")

-- Inline steps run directly, with no job session.
reset({{run = "inline", title = "Open Support", focus = true}})
assert(registered.gt_support.run(palette, {}).state == "done")
assert(#calls == 0 and #queued == 0 and #prompts == 0, "support must not open or select a job terminal")
assert(commands[2].argv[2] == "rex-action" and commands[2].argv[3] == "support")
assert(commands[2].options.env.PATH:find("/fixture/Rex Server.app/Contents/MacOS:", 1, true) == 1, "inline gt runs rex, which is not on the app server PATH")
action_result = {ok = false, stdout = "", stderr = "gt: support fixture error\n"}
reset({{run = "inline", title = "Open Support", focus = true}})
local ok, err = pcall(registered.gt_support.run, palette, {})
assert(not ok and err == "support fixture error", "inline failures must reach the UI: " .. tostring(err))

-- gt's refusals and unanswerable prompts are reported, not swallowed.
reset({"gt: not a registered task; use gt list\n"})
ok, err = pcall(registered.gt_open.run, palette, {task = "nope"})
assert(not ok and err == "not a registered task; use gt list" and #calls == 0)
for why, expected in pairs({timeout = "Nobody answered", busy = "already asking", no_client = "No Rex app", unsupported = "update Rex"}) do
  reset({{ask = name_question}}, {{nil, why}})
  ok, err = pcall(registered.gt_new.run, palette, {})
  assert(not ok and err:find(expected, 1, true) and #calls == 0, why .. ": " .. tostring(err))
end

for _, lookup in ipairs({
  {ok = false, stdout = "", stderr = "missing rex"},
  {ok = true, stdout = "rex\n", stderr = ""},
  {ok = true, stdout = "/unexpected/output\n/cli/rex\n", stderr = ""},
}) do
  lookup_result.ok, lookup_result.stdout, lookup_result.stderr = lookup.ok, lookup.stdout, lookup.stderr
  reset({{run = "job", title = "Set up demo", focus = true}})
  local ran, failure = pcall(registered.gt_setup.run, palette, {})
  assert(not ran and tostring(failure):find("Could not locate the Rex CLI", 1, true), tostring(failure))
  assert(#calls == 0, "failed CLI lookup must not leave a job session behind")
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
rex.log("All nine Gertrude actions, palette questions, and scoped job cleanup passed with mocked Rex calls; no sessions or commands were created.")
