local status_ok, telescope = pcall(require, "telescope")
if not status_ok then
	return
end

telescope.setup({
	require("telescope").setup({
		pickers = {
			live_grep = {
				additional_args = function()
					-- https://github.com/BurntSushi/ripgrep/issues/340#issuecomment-280868301
					return { "--hidden", "-g", "!.git/", "-g", "!node_modules/", "-g", "!.oh-my-zsh/" }
				end,
			},
		},
	}),
	defaults = {
		selection_caret = " ",
		path_display = { "smart" },
		file_ignore_patterns = { ".git/", "node_modules", "dist/", ".build/" },
		mappings = {},
	},
	extensions = {
		["ui-select"] = {
			require("telescope.themes").get_dropdown({}),
		},
	},
})

telescope.load_extension("ui-select")
