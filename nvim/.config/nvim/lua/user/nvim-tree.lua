vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1

require("nvim-tree").setup({
	view = {
		width = 36,
	},
	renderer = {
		group_empty = true,
		indent_width = 2,
		indent_markers = {
			enable = true,
			inline_arrows = true,
			icons = {
				corner = "└",
				edge = "│",
				item = "│",
				bottom = "─",
				none = " ",
			},
		},
		icons = {
			padding = "  ",
			show = {
				git = false, -- would be nice to set up eventually
			},
		},
	},
	diagnostics = {
		enable = true,
	},
	actions = {
		open_file = {
			window_picker = {
				enable = false,
			},
		},
	},
	filters = {
		custom = {
			-- never show these dirs
			"^.git$",
			"^node_modules$",
			"^dist$",
			"^.build$",
		},
	},
})
