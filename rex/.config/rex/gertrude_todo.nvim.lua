-- Loaded only by Toggle Todo's floating pane (nvim -S this-file todo.md).
-- Keeps the pane's label at "Todos (N)", N = lines starting with "- [ ]",
-- while typing and when another program (such as an agent) edits the file.
local session, block = vim.env.REX_SESSION, vim.env.REX_BLOCK
if not session or not block then return end

local rex = vim.env.REX_BIN_DIR and (vim.env.REX_BIN_DIR .. "/rex") or vim.fn.exepath("rex")
if rex == "" or vim.fn.executable(rex) ~= 1 then return end

local buf = vim.fn.bufnr(vim.fn.argv(0))
if buf < 0 then return end
local path = vim.api.nvim_buf_get_name(buf)
local shown

local function open_count()
  local count = 0
  for _, line in ipairs(vim.api.nvim_buf_get_lines(buf, 0, -1, false)) do
    if line:match("^%s*%- %[ %]") then count = count + 1 end
  end
  return count
end

local function update()
  if not vim.api.nvim_buf_is_valid(buf) then return end
  local label = ("Todos (%d)"):format(open_count())
  if label == shown then return end
  shown = label
  vim.system({rex, "block", "rename", "-s", session, block, label}, {text = true}, function(result)
    -- Retry on the next change if Rex was briefly unavailable.
    if result.code ~= 0 then vim.schedule(function() shown = nil end) end
  end)
end

local timer = assert(vim.uv.new_timer())
local function update_soon()
  timer:stop()
  timer:start(250, 0, vim.schedule_wrap(update))
end

-- Reload silently when the file changes on disk and has no unsaved edits here.
vim.bo[buf].autoread = true
local watcher = assert(vim.uv.new_fs_event())
local function watch()
  watcher:stop()
  -- Watch the folder: editors and agents often replace the file instead of writing in place.
  watcher:start(vim.fs.dirname(path), {}, vim.schedule_wrap(function(err, name)
    if err then return end
    if name == nil or name == vim.fs.basename(path) then
      if vim.api.nvim_buf_is_valid(buf) then vim.cmd.checktime(buf) end
      update_soon()
    end
  end))
end
watch()

local group = vim.api.nvim_create_augroup("GertrudeTodoLabel", {clear = true})
vim.api.nvim_create_autocmd({"TextChanged", "TextChangedI", "BufWritePost", "FileChangedShellPost"},
  {group = group, buffer = buf, callback = update_soon})
vim.api.nvim_create_autocmd("VimLeavePre", {group = group, callback = function()
  timer:stop()
  watcher:stop()
end})

update()
