return {
	"folke/which-key.nvim",
	event = "VimEnter", -- Sets the loading event to 'VimEnter'
	opts = {
		win = {
			border = "rounded",
		},
		-- delay between pressing a key and opening which-key (milliseconds)
		-- this setting is independent of vim.opt.timeoutlen
		delay = 100,
		icons = {
			mappings = false,
			keys = {},
		},
	},
}
