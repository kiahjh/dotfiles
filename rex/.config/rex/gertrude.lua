local home = assert(os.getenv("HOME"), "HOME is not set")
local gt = home .. "/.local/scripts/gt"
-- Rex.app's server PATH is only the system directories; gt needs bun, git, and gh.
local tool_path = home .. "/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

local function rex_executable()
  -- Rex.app's server PATH need not include its versioned CLI installation.
  -- A terminal gets REX_BIN_DIR injected; background actions do not. Fall back
  -- to the macOS app's stable Current installation, never a pinned version.
  local installed = home .. "/Library/Application Support/com.superlogical.rex/RexServer/Versions/Current/Rex Server.app/Contents/MacOS/rex"
  local result, err = rex.exec({"/bin/zsh", "-lc",
    'command -v rex || { [[ -x "$1" ]] && print -r -- "$1"; }', "gt-rex-cli", installed}, {cwd = home, timeout = 5})
  if result == nil then error(err, 0) end
  local path = result.stdout:gsub("%s+$", "")
  if not result.ok or path:sub(1, 1) ~= "/" or path:find("[\r\n]") then
    error("Could not locate the Rex CLI; nothing was changed.", 0)
  end
  return path
end

local function gt_failure(result, fallback)
  local message = result.stderr:gsub("^gt: ", ""):gsub("%s+$", "")
  return message ~= "" and message or fallback
end

local function encode(request)
  local payload, encode_error = rex.json.encode(request)
  if payload == nil then error(encode_error, 0) end
  return payload
end

-- gt decides what to ask and validates every answer; this file only shows the
-- questions. Each plan is either {ask = ...} or {run = "inline" | "job", ...}.
local function plan(operation, request)
  local result, exec_error = rex.exec({gt, "rex-plan", operation, encode(request)}, {cwd = home, timeout = 12, env = {PATH = tool_path}})
  if result == nil then error(exec_error, 0) end
  if not result.ok then error(gt_failure(result, "Gertrude couldn't prepare this action."), 0) end
  local step, decode_error = rex.json.decode(result.stdout)
  if step == nil then error(decode_error, 0) end
  return step
end

local unanswered = {
  timeout = "Nobody answered, so nothing was changed.",
  no_client = "No Rex app is connected to answer; pass the arguments instead, such as name=… or task=….",
  unsupported = "This Rex app can't show questions yet; update Rex.",
  busy = "Rex is already asking something else; answer that first.",
}

-- Returns the answer as text, or nil if the person closed the palette.
local function ask(question)
  if rex.ui == nil then error("This Rex server can't ask questions yet; restart it to finish updating Rex.", 0) end
  local show = question.kind == "pick" and rex.ui.pick or rex.ui.input
  local answer, why, detail = show(question.prompt)
  if answer == nil then
    if why == "cancelled" then return nil end
    error(unanswered[why] or ("Rex couldn't ask: " .. tostring(detail or why)), 0)
  end
  -- A pick with allow_other returns {text = ...} for typed text.
  if type(answer) == "table" then return answer.text end
  return answer
end

-- Quick steps (support, reopening) run here, out of sight.
local function run_inline(operation, request)
  local rex_dir = rex_executable():match("^(.*)/[^/]+$")
  local result, exec_error = rex.exec({gt, "rex-action", operation, encode(request)},
    {cwd = home, timeout = 20, env = {PATH = rex_dir .. ":" .. tool_path}})
  if result == nil then error(exec_error, 0) end
  if not result.ok then error(gt_failure(result, "Gertrude couldn't finish this action; try again."), 0) end
end

-- Provisioning and cleanup outlast the action's deadline, so they run in a job
-- session that shows their progress. It never asks for input.
local function start_job(operation, request, step, interactive)
  local rex_cli = rex_executable()
  local created, create_error = rex.call("session.create", {
    label = step.title,
    initial_windows = {{
      window_label = step.title,
      layout = rex.layout.block{
        flavor = "com.superlogical.terminal.shell",
        options = {cwd = home, command = {gt, "rex-action", operation, encode(request)}},
      },
    }},
  })
  if created == nil then error(create_error, 0) end

  -- Configs cannot receive events. A small, detached script watches only this
  -- job and removes the empty parent session after its terminal closes.
  local window = created.initial_windows[1]
  local watcher, watch_error = rex.exec.start({
    rex_cli, "do", "-s", created.session_id, "--fail-fast", home .. "/.config/rex/gertrude_job_cleanup.lua",
    "label=" .. step.title, "window=" .. window.window_id, "block=" .. window.block_ids[1],
  }, {detach = true, env = {REX_SESSION = false, REX_BLOCK = false, REX_CLIENT = false}})
  if watcher == nil then rex.log("warn", "Job-session cleanup could not start: " .. tostring(watch_error)) end

  -- Jobs that end in a task are shown; finish, discard, and refresh work in the
  -- background, and gt brings the job up only if it fails.
  if step.focus and interactive then
    rex.client.queue("session.select", {session_id = created.session_id})
  end
  return {session_id = created.session_id}
end

local function launch(operation, ctx, args)
  local interactive = (ctx.origin == "palette" or ctx.origin == "key") and ctx.client_id ~= nil
  local request = {sourceSession = ctx.session_id, clientID = interactive and ctx.client_id or nil, args = {}}
  for key, value in pairs(args) do request.args[key] = value end

  -- Ask until gt has every answer. Invalid answers come back as the same
  -- question with the problem in its title.
  for _ = 1, 20 do
    local step = plan(operation, request)
    if step.ask then
      local answer = ask(step.ask)
      if answer == nil then return {state = "cancelled"} end
      request.args[step.ask.field] = answer
    elseif step.run == "inline" then
      run_inline(operation, request)
      return {state = "done"}
    else
      return start_job(operation, request, step, interactive)
    end
  end
  error("Too many unanswered questions; nothing was changed.", 0)
end

local definitions = {
  {name = "gt_new", operation = "new", title = "New Task…", args = {name = "string?"},
    description = "Name a task, provision its worktree and databases, and open OpenCode."},
  {name = "gt_pr", operation = "pr", title = "Review PR…", args = {number = "integer?"},
    description = "Pick an open pull request and prepare an isolated review task, or reopen its existing one."},
  {name = "gt_fork", operation = "fork", title = "Fork Task…", args = {name = "string?", task = "string?"},
    description = "Fork the current task, including uncommitted code and both databases."},
  {name = "gt_finish", operation = "finish", title = "Finish Task…", args = {task = "string?", confirm = "string?"},
    description = "Confirm retirement of a clean, merged task. Current task is preselected."},
  {name = "gt_discard", operation = "discard", title = "Discard Task…", args = {task = "string?", confirm = "string?"},
    description = "Explicitly abandon uncommitted or unmerged work after a typed confirmation."},
  {name = "gt_refresh_db", operation = "refresh-db", title = "Refresh Task Databases…", args = {task = "string?", confirm = "string?"},
    description = "Confirm replacing a task's development and test databases with the scrubbed snapshot."},
  {name = "gt_support", operation = "support", title = "Open Support", args = {},
    description = "Open the permanent support session without touching its refresh jobs."},
  {name = "gt_open", operation = "open", title = "Reopen Task…", args = {task = "string?"},
    description = "Open an existing task without resetting its databases."},
  {name = "gt_setup", operation = "setup", title = "Resume Task Setup…", args = {task = "string?"},
    description = "Resume failed provisioning while preserving already initialized databases."},
}

for _, definition in ipairs(definitions) do
  local action = definition
  rex.action{
    name = action.name,
    title = action.title,
    category = "Gertrude",
    description = action.description,
    keywords = "gt gertrude task worktree " .. action.operation,
    args = action.args,
    run = function(ctx, args)
      return launch(action.operation, ctx, args)
    end,
  }
end
