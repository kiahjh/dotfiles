return {
  "folke/snacks.nvim",
  dependencies = {
    "nvim-tree/nvim-web-devicons",
  },
  priority = 1000,
  lazy = false,
  ---@type snacks.Config
  opts = {
    dim = { enabled = true },
    bigfile = { enabled = true },
    explorer = { enabled = false },
    input = { enabled = true },
    zen = { enabled = true },
    notifier = {
      enabled = true,
      timeout = 3000,
      style = "fancy",
      top_down = false,
    },
    picker = { enabled = true },
    quickfile = { enabled = true },
    scope = { enabled = true },
    scroll = { enabled = false },
    statuscolumn = { enabled = true },
    words = { enabled = true },
    indent = {
      enabled = true,
      indent = {
        char = "│",
        hl = "IblIndent",
      },
      scope = {
        char = "│",
        hl = "IblScope",
      },
      animate = {
        enabled = true,
        style = "out",
        easing = "linear",
        duration = {
          step = 20,
          total = 200,
        },
      },
    },
    dashboard = {
      enabled = true,
      width = 60,
      preset = {
        keys = {
          { icon = "󰈞 ", key = "f", desc = "Find File", action = ":lua Snacks.picker.files()" },
          { icon = "󰈔 ", key = "n", desc = "New File", action = ":ene | startinsert" },
          { icon = "󰊄 ", key = "g", desc = "Find Text", action = ":lua Snacks.picker.grep()" },
          { icon = "󰋚 ", key = "r", desc = "Recent Files", action = ":lua Snacks.picker.recent()" },
          { icon = "󰒓 ", key = "c", desc = "Config", action = ":lua Snacks.picker.files({ cwd = vim.fn.stdpath('config') })" },
          { icon = "󰦛 ", key = "s", desc = "Restore Session", section = "session" },
          { icon = "󰒲 ", key = "l", desc = "Lazy", action = ":Lazy" },
          { icon = "󰩈 ", key = "q", desc = "Quit", action = ":qa" },
        },
        header = [[
                                                                        
         ███╗   ██╗███████╗ ██████╗ ██╗   ██╗██╗███╗   ███╗         
         ████╗  ██║██╔════╝██╔═══██╗██║   ██║██║████╗ ████║         
         ██╔██╗ ██║█████╗  ██║   ██║██║   ██║██║██╔████╔██║         
         ██║╚██╗██║██╔══╝  ██║   ██║╚██╗ ██╔╝██║██║╚██╔╝██║         
         ██║ ╚████║███████╗╚██████╔╝ ╚████╔╝ ██║██║ ╚═╝ ██║         
         ╚═╝  ╚═══╝╚══════╝ ╚═════╝   ╚═══╝  ╚═╝╚═╝     ╚═╝         
                                                                        ]],
      },
      sections = {
        { section = "header" },
        { section = "keys", gap = 1, padding = 1 },
        { section = "startup" },
      },
    },
    styles = {
      notification = {
        wo = { wrap = true },
      },
    },
  },
}
