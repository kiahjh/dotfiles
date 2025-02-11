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
    dashboard = { enabled = true },
    explorer = { enabled = false },
    indent = { enabled = true },
    input = { enabled = true },
    zen = { enabled = true },
    -- notifier = { enabled = true, timeout = 3000, style = "compact" },
    notifier = { enabled = false },
    picker = { enabled = true },
    quickfile = { enabled = true },
    scope = { enabled = true },
    scroll = { enabled = true },
    statuscolumn = { enabled = true },
    words = { enabled = true },
    -- styles = {
    --   notification = {
    --     style = "compact"
    --   }
    -- }
  },
}
