-- nvim --headless -u NONE -i NONE -n -l themes/tests/neovim.lua
local root = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":p:h:h")
local config = vim.fn.fnamemodify(root .. "/../nvim/.config/nvim", ":p")
local dependency = vim.env.KANAGAWA_DIR or (vim.fn.stdpath("data") .. "/lazy/kanagawa.nvim")
assert(vim.fn.isdirectory(dependency) == 1, "Set KANAGAWA_DIR to a Kanagawa.nvim checkout")
vim.opt.rtp:prepend(config)
vim.opt.rtp:append(dependency)

-- Build into a temporary store, never the real ~/.local/share/themes.
local data = vim.fn.tempname()
vim.env.XDG_DATA_HOME = data
local store = data .. "/themes"
local result = vim.system({ "python3", "-B", root .. "/scripts/generate.py" }):wait()
assert(result.code == 0, result.stderr)
local function color(group, attr)
  local value = vim.api.nvim_get_hl(0, { name = group, link = false })[attr]
  assert(value, group .. "." .. attr .. " is missing")
  return string.format("#%06x", value)
end

local theme = require("theme")
local themes = vim.tbl_map(function(path) return vim.fn.fnamemodify(path, ":h:t") end,
  vim.fn.glob(root .. "/*/palette.json", false, true))
for i, name in ipairs(themes) do
  vim.uv.fs_unlink(store .. "/current")
  assert(vim.uv.fs_symlink(name, store .. "/current"))
  if i == 1 then theme.setup() else vim.cmd.colorscheme("theme") end
  local p = theme.palette()
  local oc = vim.json.decode(table.concat(vim.fn.readfile(store .. "/" .. name .. "/opencode.json"), "\n"))
  assert(p.name == name)
  assert(vim.g.colors_name == "theme")
  assert(vim.o.background == p.mode, name .. ": background")
  assert(color("Normal", "bg") == p.background)
  assert(color("Normal", "fg") == p.foreground)
  assert(color("Visual", "bg") == p.selection)
  assert(color("Visual", "fg") == p.brightForeground)
  assert(color("FloatBorder", "fg") == p.border)
  assert(color("CursorLineNr", "fg") == p.accent)
  for group, token in pairs({ Comment = "comment", Keyword = "keyword", Function = "function", String = "string", Number = "number", Type = "type", Operator = "operator", Delimiter = "punctuation" }) do
    assert(color(group, "fg") == oc.base.syntax[token], name .. ": " .. group .. " differs from OpenCode")
  end
  for j, value in ipairs(p.ansi) do
    assert(vim.g["terminal_color_" .. (j - 1)]:lower() == value, name .. ": ANSI mismatch " .. (j - 1))
  end
  -- Every part of a barbar tab sits on that tab's surface (no gray blocks).
  for _, part in ipairs({ "", "ADDED", "Sign", "SignRight", "Index", "Mod", "ERROR" }) do
    assert(color("BufferCurrent" .. part, "bg") == p.background, name .. ": BufferCurrent" .. part)
    assert(color("BufferInactive" .. part, "bg") == p.inset, name .. ": BufferInactive" .. part)
  end
  assert(color("BufferTabpageFill", "bg") == p.inset)
  package.loaded["lualine.themes.current"] = nil
  local lualine = require("lualine.themes.current")
  assert(lualine.normal.a.bg == p.accent)
  assert(lualine.normal.c.fg == p.foreground)
  assert(lualine.inactive.c.fg == p.muted)
end
local p = theme.palette()

-- Switching themes relinks `current`; a running Neovim follows.
local other = vim.deepcopy(p)
other.name, other.background = "other", "#202020"
vim.fn.mkdir(store .. "/other", "p")
vim.fn.writefile({ vim.json.encode(other) }, store .. "/other/palette.json")
assert(vim.uv.fs_symlink("other", store .. "/current.new"))
assert(vim.uv.fs_rename(store .. "/current.new", store .. "/current"))
assert(vim.wait(5000, function() return color("Normal", "bg") == "#202020" end, 20), "Neovim didn't follow the switch")
assert(theme.colors().name == "other")
vim.fn.delete(data, "rf")
print(("Neovim, lualine, OpenCode syntax, and all 16 terminal colors match for %d themes; live switching works."):format(#themes))
