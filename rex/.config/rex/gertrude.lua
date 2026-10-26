local home = assert(os.getenv("HOME"), "HOME is not set")
local gt = home .. "/.local/scripts/gt"

local function launch(operation, title, ctx, args)
  local interactive = ctx.origin == "palette" or ctx.origin == "key"
  local payload, encode_error = rex.json.encode({
    sourceSession = ctx.session_id,
    clientID = interactive and ctx.client_id or nil,
    args = args,
  })
  if payload == nil then error(encode_error, 0) end

  -- Support never needs input or provisioning output. Keep it out of the sidebar.
  if operation == "support" then
    local result, exec_error = rex.exec({gt, "rex-action", operation, payload}, {cwd = home, timeout = 25})
    if result == nil then error(exec_error, 0) end
    if not result.ok then error(result.stderr ~= "" and result.stderr or "Could not open support; try again.", 0) end
    return
  end

  local job_title = title:gsub("…$", "")
  local created, create_error = rex.call("session.create", {
    label = job_title,
    initial_windows = {{
      window_label = job_title,
      layout = rex.layout.block{
        flavor = "com.superlogical.terminal.shell",
        options = {
          cwd = home,
          command = {gt, "rex-action", operation, payload},
        },
      },
    }},
  })
  if created == nil then error(create_error, 0) end

  -- Configs cannot receive events. A small, detached script watches only this
  -- job and removes the empty parent session after its terminal closes.
  local window = created.initial_windows[1]
  local watcher, watch_error = rex.exec.start({
    "rex", "do", "-s", created.session_id, "--fail-fast", home .. "/.config/rex/gertrude_job_cleanup.lua",
    "label=" .. job_title, "window=" .. window.window_id, "block=" .. window.block_ids[1],
  }, {detach = true, env = {REX_SESSION = false, REX_BLOCK = false, REX_CLIENT = false}})
  if watcher == nil then rex.log("warn", "Job-session cleanup could not start: " .. tostring(watch_error)) end

  if interactive and ctx.client_id then
    rex.client.queue("session.select", {session_id = created.session_id})
  end
  return {session_id = created.session_id}
end

local definitions = {
  {name = "gt_new", operation = "new", title = "New Task…", args = {name = "string?"},
    description = "Name a task, provision its worktree and databases, and open OpenCode."},
  {name = "gt_pr", operation = "pr", title = "Review PR…", args = {number = "integer?"},
    description = "Enter a pull request number and prepare an isolated review task."},
  {name = "gt_fork", operation = "fork", title = "Fork Task…", args = {name = "string?", task = "string?"},
    description = "Fork the current task, including uncommitted code and both databases."},
  {name = "gt_finish", operation = "finish", title = "Finish Task…", args = {task = "string?"},
    description = "Confirm retirement of a clean, merged task. Current task is preselected."},
  {name = "gt_discard", operation = "discard", title = "Discard Task…", args = {task = "string?"},
    description = "Explicitly abandon uncommitted or unmerged work after a typed confirmation."},
  {name = "gt_refresh_db", operation = "refresh-db", title = "Refresh Task Databases…", args = {task = "string?"},
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
      return launch(action.operation, action.title, ctx, args)
    end,
  }
end
