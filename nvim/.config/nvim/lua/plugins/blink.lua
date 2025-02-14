return {
  "saghen/blink.cmp",
  dependencies = {
    "rafamadriz/friendly-snippets"
  },
  version = "*",
  opts = {
    completion = {
      menu = { border = 'rounded' },
      documentation = {
        auto_show = true,
        auto_show_delay_ms = 0,
        window = { border = 'rounded' }
      }
    },
    signature = { enabled = true, window = { border = 'rounded' } },
  }
}
