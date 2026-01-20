return {
	"romgrk/barbar.nvim",
	event = "BufReadPost",
	dependencies = {
		"lewis6991/gitsigns.nvim",
		"nvim-tree/nvim-web-devicons",
	},
	init = function()
		vim.g.barbar_auto_setup = false
	end,
	opts = {
		animation = true,
		auto_hide = 1, -- hide when only one buffer
		tabpages = true,
		clickable = true,
		focus_on_close = "previous",
		icons = {
			buffer_index = false,
			buffer_number = false,
			button = "󰅖",
			diagnostics = {
				[vim.diagnostic.severity.ERROR] = { enabled = true, icon = " " },
				[vim.diagnostic.severity.WARN] = { enabled = true, icon = " " },
				[vim.diagnostic.severity.INFO] = { enabled = false },
				[vim.diagnostic.severity.HINT] = { enabled = false },
			},
			gitsigns = {
				added = { enabled = true, icon = "+" },
				changed = { enabled = true, icon = "~" },
				deleted = { enabled = true, icon = "-" },
			},
			filetype = {
				custom_colors = false,
				enabled = true,
			},
			separator = { left = "▎", right = "" },
			separator_at_end = true,
			modified = { button = "●" },
			pinned = { button = "", filename = true },
			preset = "default",
			alternate = { filetype = { enabled = false } },
			current = { buffer_index = false },
			inactive = { button = "󰅖" },
			visible = { modified = { buffer_number = false } },
		},
		insert_at_end = true,
		maximum_padding = 2,
		minimum_padding = 1,
		maximum_length = 30,
		sidebar_filetypes = {
			["neo-tree"] = { event = "BufWipeout", text = "  Files", align = "center" },
		},
	},
}
