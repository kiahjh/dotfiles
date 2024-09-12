return {
	"rose-pine/neovim",
	priority = 1000,
	config = function()
		require("rose-pine").setup({
			variant = "auto", -- auto, main, moon, or dawn
			dark_variant = "main", -- main, moon, or dawn
			dim_inactive_windows = false,
			extend_background_behind_borders = true,

			enable = {
				terminal = true,
				legacy_highlights = true, -- Improve compatibility for previous versions of Neovim
				migrations = true, -- Handle deprecated options automatically
			},

			styles = {
				bold = true,
				italic = true,
				transparency = false,
			},

			groups = {
				border = "muted",
				link = "iris",
				panel = "surface",

				error = "love",
				hint = "iris",
				info = "foam",
				note = "pine",
				todo = "rose",
				warn = "gold",

				git_add = "foam",
				git_change = "rose",
				git_delete = "love",
				git_dirty = "rose",
				git_ignore = "muted",
				git_merge = "iris",
				git_rename = "pine",
				git_stage = "iris",
				git_text = "rose",
				git_untracked = "subtle",

				h1 = "iris",
				h2 = "foam",
				h3 = "rose",
				h4 = "gold",
				h5 = "pine",
				h6 = "foam",
			},

			palette = {
				-- Override the builtin palette per variant
				-- moon = {
				--     base = '#18191a',
				--     overlay = '#363738',
				-- },
			},

			highlight_groups = {
				-- Comment = { fg = "foam" },
				-- VertSplit = { fg = "muted", bg = "muted" },
			},

			before_highlight = function(group, highlight, palette)
				-- Disable all undercurls
				-- if highlight.undercurl then
				--     highlight.undercurl = false
				-- end
				--
				-- Change palette colour
				-- if highlight.fg == palette.pine then
				--     highlight.fg = palette.foam
				-- end
			end,
		})

		vim.cmd("colorscheme rose-pine")
		-- vim.cmd("colorscheme rose-pine-main")
		-- vim.cmd("colorscheme rose-pine-moon")
		-- vim.cmd("colorscheme rose-pine-dawn")
	end,
}

-- return {
-- 	{
-- 		"catppuccin/nvim",
-- 		priority = 1000, -- make sure to load this before all the other start plugins
-- 		config = function()
-- 			require("catppuccin").setup({
-- 				flavour = "mocha", -- latte, frappe, macchiato, mocha
-- 				background = { -- :h background
-- 					light = "latte",
-- 					dark = "mocha",
-- 				},
-- 				transparent_background = false, -- disables setting the background color.
-- 				show_end_of_buffer = false, -- shows the '~' characters after the end of buffers
-- 				term_colors = false, -- sets terminal colors (e.g. `g:terminal_color_0`)
-- 				dim_inactive = {
-- 					enabled = true, -- dims the background color of inactive window
-- 					shade = "dark",
-- 					percentage = 0.15, -- percentage of the shade to apply to the inactive window
-- 				},
-- 				no_italic = false, -- Force no italic
-- 				no_bold = false, -- Force no bold
-- 				no_underline = false, -- Force no underline
-- 				styles = { -- Handles the styles of general hi groups (see `:h highlight-args`):
-- 					comments = { "italic" },
-- 					conditionals = { "italic" },
-- 					loops = { "italic" },
-- 					functions = {},
-- 					keywords = { "italic" },
-- 					strings = {},
-- 					variables = { "bold" },
-- 					numbers = {},
-- 					booleans = {},
-- 					properties = {},
-- 					types = {},
-- 					operators = {},
-- 				},
-- 				color_overrides = {},
-- 				custom_highlights = {},
-- 				integrations = {
-- 					cmp = true,
-- 					gitsigns = true,
-- 					nvimtree = true,
-- 					treesitter = true,
-- 					notify = true,
-- 					noice = true,
-- 					alpha = true,
-- 					harpoon = true,
-- 					mini = {
-- 						enabled = true,
-- 						indentscope_color = "",
-- 					},
-- 					-- For more plugins integrations please scroll down (https://github.com/catppuccin/nvim#integrations)
-- 				},
-- 			})
-- 			-- load the colorscheme here
-- 			vim.cmd([[colorscheme catppuccin]])
-- 		end,
-- 	},
-- }
