-- Gertrude task actions: Toggle Todo (a floating pane) and Fire It Up (a tab).
-- Toggle Todo toggles one floating layer in the session:
--   focused → minimize; minimized, unfocused or in another tab → show and focus;
--   missing → create it in the current tab.
-- gt resolves the task from the Rex session, never from a pane's cwd.
local home = assert(os.getenv("HOME"), "HOME is not set")
local gt = home .. "/.local/scripts/gt"
local shell = "com.superlogical.terminal.shell"
-- Rex.app's server PATH is only the system directories; gt needs bun.
local gt_path = home .. "/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

local function call(method, args)
  local result, err = rex.call(method, args)
  if result == nil then error(err, 0) end
  return result
end

local function task_info(command, session_id)
  local result, exec_error = rex.exec({gt, command, session_id}, {cwd = home, timeout = 10, env = {PATH = gt_path}})
  if result == nil then error(exec_error, 0) end
  if not result.ok then
    local message = result.stderr:gsub("^gt: ", ""):gsub("%s+$", "")
    error(message ~= "" and message or "Could not find this session's Gertrude task.", 0)
  end
  local task, decode_error = rex.json.decode(result.stdout)
  if task == nil then error(decode_error, 0) end
  return task
end

local function find_panel(view, owns)
  for _, window in ipairs(view.windows or {}) do
    for _, layer in ipairs(window.layers or {}) do
      if layer.kind == "floating" then
        for _, block in ipairs(layer.blocks or {}) do
          if owns(block.label or "") then return window, layer end
        end
      end
    end
  end
end

local function panel_action(definition)
  rex.action{
    name = definition.name,
    title = definition.title,
    category = "Gertrude",
    description = definition.description,
    keywords = definition.keywords,
    args = {},
    run = function(ctx)
      local session_id = ctx.session_id
      if not session_id then error("Run " .. definition.title .. " from a Gertrude task session.", 0) end

      local view = call("session.view", {session_id = session_id})
      local window, layer = find_panel(view, definition.owns)
      if layer then
        local focused = false
        if layer.state ~= "minimized" and window.window_id == view.active_window_id then
          for _, block in ipairs(layer.blocks or {}) do
            if block.block_id == window.focused_block_id then focused = true end
          end
        end
        if focused then
          call("session.set_layer_state", {session_id = session_id, layer_id = layer.layer_id, state = "minimized"})
          return {state = "minimized"}
        end
        call("session.set_layer_state", {session_id = session_id, layer_id = layer.layer_id, state = "normal", focus = true})
        return {state = "focused"}
      end

      local task = task_info(definition.gt_command, session_id)
      call("session.new_layer", {
        session_id = session_id,
        window_id = view.active_window_id,
        bounds = definition.bounds,
        focus = true,
        layout = definition.layout(task),
      })
      return {state = "opened"}
    end,
  }
end

-- Toggle Todo: scratch/todo.md in Neovim. The helper renames the pane to
-- "Todos (N)"; singular forms are from panes opened before that rename.
local todo_helper = home .. "/.config/rex/gertrude_todo.nvim.lua"
panel_action{
  name = "gt_todo",
  title = "Toggle Todo",
  description = "Show, focus, or minimize this task's scratch/todo.md in a floating Neovim pane.",
  keywords = "gt gertrude task todo todos notes scratch float floating nvim neovim",
  gt_command = "rex-todo",
  bounds = {0.15, 0.1, 0.7, 0.8},
  owns = function(label)
    return label:match("^Todos?$") ~= nil or label:match("^Todos? %(%d+%)$") ~= nil
  end,
  layout = function(task)
    return rex.layout.block{
      flavor = shell,
      label = "Todos",
      options = {cwd = task.directory, command = {"nvim", "-S", todo_helper, task.todo}},
    }
  end,
}

-- Fire It Up: the task's dev servers and an ngrok tunnel to its API in a
-- "Servers" tab: the three web servers across the top row, the API and ngrok
-- across the bottom. Running it again switches to that tab.
-- The tunnel lets a phone on another network (such as coffee shop Wi-Fi) reach
-- the local API. Ctrl+C stops one server and leaves a shell in the task, so it
-- can be rerun there. The ngrok pane shows the public URL first; ngrok's own
-- screen puts it below what a short pane can show.
local ngrok_view = home .. "/.config/rex/gertrude_ngrok.sh"
local servers_tab = "Servers"
-- Gertrude's pinned Swift toolchain can't build against the default Xcode 27 SDK;
-- Xcode 26.6's command-line tools work (see the repo's AGENTS.kiah.md).
local api_developer_dir = "DEVELOPER_DIR=/Applications/Xcode 26.6.app/Contents/Developer"
local web_row = {
  {label = "Dash", command = function() return {"just", "web", "dash"} end},
  {label = "Account", command = function() return {"just", "web", "account"} end},
  {label = "Storybook V2", command = function() return {"just", "web", "storybook-v2"} end},
}
local api_row = {
  {label = "API", command = function() return {"env", api_developer_dir, "just", "watch-api"} end},
  {label = "ngrok", command = function(task)
    if type(task.apiPort) ~= "number" then
      error("This task has no API port yet; run Resume Task Setup first.", 0)
    end
    return {"/bin/bash", ngrok_view, tostring(task.apiPort)}
  end},
}

local function server_pane(server, task)
  local command = {"/bin/zsh", "-c", 'trap : INT; "$@"; print; exec zsh -l', "fire-it-up"}
  for _, word in ipairs(server.command(task)) do table.insert(command, word) end
  return rex.layout.block{flavor = shell, label = server.label, options = {cwd = task.directory, command = command}}
end

-- Equal columns: the first takes 1/n, then 1/(n-1) of the rest, and so on.
local function row(servers, task, first)
  first = first or 1
  if first == #servers then return server_pane(servers[first], task) end
  return rex.layout.horizontal(1 / (#servers - first + 1), server_pane(servers[first], task), row(servers, task, first + 1))
end

rex.action{
  name = "gt_fire_it_up",
  title = "Fire It Up",
  category = "Gertrude",
  description = "Run the Dash, Account, and Storybook V2 dev servers, the API, and an ngrok tunnel to the API in a Servers tab. Run again to switch to it.",
  keywords = "gt gertrude task dev servers start run watch api web account dash storybook ngrok tunnel phone tab",
  args = {},
  run = function(ctx)
    local session_id = ctx.session_id
    if not session_id then error("Run Fire It Up from a Gertrude task session.", 0) end

    local view = call("session.view", {session_id = session_id})
    for _, window in ipairs(view.windows or {}) do
      if window.label == servers_tab then
        call("session.focus_window", {session_id = session_id, window_id = window.window_id})
        return {state = "focused"}
      end
    end

    local task = task_info("rex-task", session_id)
    call("session.new_window", {
      session_id = session_id,
      window_label = servers_tab,
      focus = true,
      layout = rex.layout.vertical(0.5, row(web_row, task), row(api_row, task)),
    })
    return {state = "opened"}
  end,
}
