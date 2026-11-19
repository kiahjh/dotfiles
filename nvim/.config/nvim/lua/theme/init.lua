-- Applies the theme chosen with `theme set` (see ~/.dotfiles/themes) on top of
-- Kanagawa.nvim, and follows later switches while Neovim is running.
local M = {}
local options = { transparent = false, dim_inactive = false }
local data = ((vim.env.XDG_DATA_HOME or "") ~= "" and vim.env.XDG_DATA_HOME or vim.env.HOME .. "/.local/share") .. "/themes"
local loaded, watcher

function M.palette()
  local ok, lines = pcall(vim.fn.readfile, data .. "/current/palette.json")
  if not ok or #lines == 0 then
    return nil
  end
  return vim.json.decode(table.concat(lines, "\n"))
end

-- The palette in use, without reading the disk again.
function M.colors()
  return loaded or M.palette()
end

local function refresh_lualine()
  package.loaded["lualine.themes.current"] = nil
  local ok, lualine = pcall(require, "lualine")
  if ok then
    lualine.setup(lualine.get_config())
  end
end

function M.load()
  local p = M.palette()
  loaded = vim.deepcopy(p)
  if not p then
    vim.cmd.colorscheme("kanagawa-dragon")
    return
  end
  local kanagawa = require("kanagawa")
  -- Kanagawa's darkest surface draws window separators; in a light theme
  -- that would be a heavy black line.
  local recessed = p.mode == "light" and p.border or p.black
  -- Setting 'background' reloads g:colors_name, so clear it first.
  vim.g.colors_name = nil
  vim.o.background = p.mode
  kanagawa.setup({
    theme = "dragon",
    background = { dark = "dragon", light = "dragon" },
    compile = false,
    transparent = options.transparent,
    dimInactive = options.dim_inactive,
    commentStyle = { italic = true },
    functionStyle = { italic = true },
    keywordStyle = { italic = false },
    colors = {
      palette = {
        dragonBlack0 = recessed, dragonBlack1 = p.inset, dragonBlack2 = p.panel,
        dragonBlack3 = p.background, dragonBlack4 = p.raised, dragonBlack5 = p.selection,
        dragonBlack6 = p.disabled, dragonWhite = p.foreground, dragonAsh = p.muted,
        dragonGray = p.subtle, dragonGray2 = p.subtle, dragonGray3 = p.muted,
        dragonBlue2 = p.blue, dragonBlue = p.blue, dragonViolet = p.purple,
        dragonRed = p.red, dragonGreen = p.brightGreen, dragonGreen2 = p.green,
        dragonAqua = p.cyan, dragonPink = p.purple, dragonYellow = p.yellow,
        dragonOrange = p.orange, dragonOrange2 = p.orange, dragonTeal = p.brightBlue,
        samuraiRed = p.error, roninYellow = p.warning,
      },
      theme = {
        dragon = {
          syn = {
            string = p.string, variable = p.foreground, number = p.number,
            constant = p.constant, identifier = p.property, parameter = p.parameter,
            fun = p["function"], statement = p.keyword, keyword = p.keyword,
            operator = p.operator, preproc = p.red, type = p.type, regex = p.constant,
            deprecated = p.disabled, comment = p.muted, punct = p.punctuation,
            special1 = p.brightBlue, special2 = p.keyword, special3 = p.brightRed,
          },
          vcs = { added = p.green, removed = p.red, changed = p.yellow },
          diag = { ok = p.green, error = p.error, warning = p.warning, info = p.blue, hint = p.cyan },
          diff = { add = p.diffAdded, delete = p.diffRemoved, change = p.panel, text = p.raised },
          ui = {
            fg = p.foreground, fg_dim = p.muted, fg_reverse = p.background,
            bg = p.background, bg_dim = p.inset, bg_m3 = recessed,
            bg_m2 = p.inset, bg_m1 = p.panel, bg_p1 = p.raised, bg_p2 = p.selection,
            bg_gutter = p.background, special = p.yellow, nontext = p.disabled,
            whitespace = p.disabled, bg_visual = p.selection, bg_search = p.search,
            float = { fg = p.foreground, bg = p.inset, fg_border = p.border, bg_border = p.inset },
            pmenu = {
              fg = p.foreground, fg_sel = p.brightForeground, bg = p.panel,
              bg_sel = p.selection, bg_sbar = p.panel, bg_thumb = p.scrollbar,
            },
          },
          term = p.ansi,
        },
      },
    },
    overrides = function()
      return {
        Boolean = { fg = p.warning, bold = true },
        CursorLine = { bg = p.panel },
        CursorLineNr = { fg = p.accent, bold = true },
        FloatTitle = { fg = p.accent, bg = p.inset, bold = true },
        TelescopeBorder = { fg = p.border, bg = p.background },
        TelescopeNormal = { fg = p.foreground, bg = p.background },
        TelescopePromptNormal = { fg = p.foreground, bg = p.panel },
        TelescopeResultsNormal = { fg = p.foreground, bg = p.background },
        TelescopeSelection = { fg = p.brightForeground, bg = p.selection },
        TelescopeSelectionCaret = { fg = p.accent, bg = p.selection },
        StatusLine = { fg = p.foreground, bg = p.inset },
        StatusLineNC = { fg = p.muted, bg = p.background },
        Visual = { fg = p.brightForeground, bg = p.selection },
        VisualNOS = { fg = p.brightForeground, bg = p.selection },
        IblIndent = { fg = p.selection },
        IblScope = { fg = p.border },
        WhichKeyFloat = { bg = p.inset },
        WhichKeyBorder = { fg = p.border, bg = p.inset },
        NeoTreeNormal = { fg = p.foreground, bg = p.panel },
        NeoTreeNormalNC = { fg = p.muted, bg = p.panel },
        NeoTreeFloatBorder = { fg = p.border, bg = p.inset },
        NeoTreeTitleBar = { fg = p.background, bg = p.accent, bold = true },
        BufferCurrent = { fg = p.foreground, bg = p.background, bold = true },
        BufferCurrentIndex = { fg = p.accent, bg = p.background },
        BufferCurrentMod = { fg = p.accent, bg = p.background },
        BufferCurrentSign = { fg = p.accent, bg = p.background },
        BufferInactive = { fg = p.muted, bg = p.inset },
        BufferVisible = { fg = p.subtle, bg = p.inset },
        NoiceCmdlinePopup = { fg = p.foreground, bg = p.inset },
        NoiceCmdlinePopupBorder = { fg = p.accent, bg = p.inset },
        NoiceCmdlineIcon = { fg = p.accent },
      }
    end,
  })
  kanagawa.load("dragon")
  -- colors/theme.lua, so a later 'background' change reloads this.
  vim.g.colors_name = "theme"
end

-- `theme set` relinks `current`, and rebuilding replaces its files; either
-- way, reload when the palette on disk differs from the one in use.
local function watch()
  vim.fn.mkdir(data, "p")
  watcher = vim.uv.new_fs_event()
  watcher:start(data, { recursive = true }, vim.schedule_wrap(function()
    if not vim.deep_equal(M.palette(), loaded) then
      vim.cmd.colorscheme("theme")
      refresh_lualine()
    end
  end))
end

function M.setup(opts)
  options = vim.tbl_deep_extend("force", options, opts or {})
  vim.cmd.colorscheme("theme")
  if not watcher then
    watch()
  end
end

return M
