return {
	"folke/noice.nvim",
	event = "VeryLazy",
	dependencies = {
		"MunifTanjim/nui.nvim",
	},
	config = function()
		require("noice").setup({
			cmdline = {
				enabled = true,
				view = "cmdline_popup",
				format = {
					cmdline = { pattern = "^:", icon = " ", lang = "vim" },
					search_down = { kind = "search", pattern = "^/", icon = " ", lang = "regex" },
					search_up = { kind = "search", pattern = "^%?", icon = " ", lang = "regex" },
					filter = { pattern = "^:%s*!", icon = " ", lang = "bash" },
					lua = { pattern = { "^:%s*lua%s+", "^:%s*lua%s*=%s*", "^:%s*=%s*" }, icon = " ", lang = "lua" },
					help = { pattern = "^:%s*he?l?p?%s+", icon = "󰋖 " },
					input = { view = "cmdline_input", icon = "󰥻 " },
				},
			},
			messages = {
				enabled = true,
				view = "notify",
				view_error = "notify",
				view_warn = "notify",
				view_history = "messages",
				view_search = "virtualtext",
			},
			popupmenu = {
				enabled = true,
				backend = "nui",
				kind_icons = {},
			},
			lsp = {
				progress = {
					enabled = true,
					format = "lsp_progress",
					format_done = "lsp_progress_done",
					view = "mini",
				},
				override = {
					["vim.lsp.util.convert_input_to_markdown_lines"] = true,
					["vim.lsp.util.stylize_markdown"] = true,
					["cmp.entry.get_documentation"] = true,
				},
				hover = { enabled = true, silent = true },
				signature = { enabled = true },
			},
			presets = {
				bottom_search = false,
				command_palette = true,
				long_message_to_split = true,
				lsp_doc_border = true,
				inc_rename = false,
			},
			views = {
				mini = {
					win_options = { winblend = 0 },
				},
			},
			routes = {
				-- Hide "written" messages
				{
					filter = {
						event = "msg_show",
						kind = "",
						find = "written",
					},
					opts = { skip = true },
				},
				-- Hide search virtual text for short searches
				{
					filter = {
						event = "msg_show",
						kind = "search_count",
					},
					opts = { skip = true },
				},
			},
		})
	end,
}
