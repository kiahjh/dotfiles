return {
	"Bekaboo/dropbar.nvim",
	event = "BufReadPost",
	opts = {
		bar = {
			sources = function(buf, _)
				local sources = require("dropbar.sources")
				local utils = require("dropbar.utils")
				if vim.bo[buf].ft == "markdown" then
					return { sources.markdown }
				end
				if vim.bo[buf].buftype == "terminal" then
					return { sources.terminal }
				end
				return {
					sources.path,
					utils.source.fallback({
						-- Prefer treesitter for breadcrumbs; asking LSP for document
						-- symbols on every TSX edit/cursor refresh is noticeably heavier.
						sources.treesitter,
						sources.lsp,
					}),
				}
			end,
			padding = { left = 1, right = 1 },
			pick = { pivots = "asdfghjklqwertyuiopzxcvbnm" },
		},
		icons = {
			ui = { bar = { separator = "  " } },
			kinds = {
				symbols = {
					Array = "󰅪 ",
					Boolean = " ",
					Class = " ",
					Color = "󰏘 ",
					Constant = "󰏿 ",
					Constructor = " ",
					Enum = " ",
					EnumMember = " ",
					Event = " ",
					Field = " ",
					File = "󰈙 ",
					Folder = " ",
					Function = "󰊕 ",
					Interface = " ",
					Keyword = "󰌋 ",
					Method = "󰊕 ",
					Module = "󰏗 ",
					Number = "󰎠 ",
					Object = "󰅩 ",
					Operator = "󰆕 ",
					Package = "󰏗 ",
					Property = " ",
					Reference = " ",
					Snippet = " ",
					String = " ",
					Struct = " ",
					Text = "󰉿 ",
					TypeParameter = " ",
					Unit = " ",
					Value = "󰎠 ",
					Variable = "󰀫 ",
				},
			},
		},
	},
}
