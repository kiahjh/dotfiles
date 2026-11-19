local p = require("theme").colors()
if not p then
  return require("lualine.themes.auto")
end

return {
  normal = {
    a = { fg = p.background, bg = p.accent, gui = "bold" },
    b = { fg = p.accent, bg = p.raised },
    c = { fg = p.foreground, bg = p.inset },
  },
  insert = { a = { fg = p.background, bg = p.green, gui = "bold" }, b = { fg = p.green, bg = p.raised } },
  visual = { a = { fg = p.background, bg = p.purple, gui = "bold" }, b = { fg = p.purple, bg = p.raised } },
  replace = { a = { fg = p.background, bg = p.red, gui = "bold" }, b = { fg = p.red, bg = p.raised } },
  command = { a = { fg = p.background, bg = p.orange, gui = "bold" }, b = { fg = p.orange, bg = p.raised } },
  inactive = {
    a = { fg = p.muted, bg = p.inset },
    b = { fg = p.muted, bg = p.inset },
    c = { fg = p.muted, bg = p.inset },
  },
}
