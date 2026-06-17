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
        -- 0ms makes TS/React docs fetch on every completion-menu selection while
        -- typing. A short delay keeps docs available without turning completion
        -- into a constant LSP request/cancel loop.
        auto_show_delay_ms = 300,
        window = { border = 'rounded' }
      }
    },
    signature = { enabled = true, window = { border = 'rounded' } },
  }
}
