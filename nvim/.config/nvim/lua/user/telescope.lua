local status_ok, telescope = pcall(require, "telescope")
if not status_ok then
  return
end

local actions = require("telescope.actions")
telescope.setup({
  require("telescope").setup({
    pickers = {
      live_grep = {
        additional_args = function()
          -- https://github.com/BurntSushi/ripgrep/issues/340#issuecomment-280868301
          return {
            "--hidden",
            "-g",
            "!.git/",
            "-g",
            "!node_modules/",
            "-g",
            "!.oh-my-zsh/",
            "-g",
            "!automatic_backups/",
          }
        end,
      },
    },
  }),
  defaults = {
    selection_caret = " ",
    path_display = { "smart" },
    file_ignore_patterns = { ".git/", "node_modules", "dist/", ".build/" },

    -- https://github.com/nvim-telescope/telescope.nvim/blob/master/lua/telescope/mappings.lua
    mappings = {
      -- send FILTERED selections to quickfixlist (select with TAB in normal mode)
      i = { ["<C-f>"] = actions.send_selected_to_qflist + actions.open_qflist },
      n = { ["<C-f>"] = actions.send_selected_to_qflist + actions.open_qflist },
    },
  },
  extensions = {
    ["ui-select"] = {
      require("telescope.themes").get_dropdown({}),
    },
  },
})

telescope.load_extension("ui-select")
