return {
	"nvim-lualine/lualine.nvim",
	dependencies = { "nvim-tree/nvim-web-devicons" },
	config = function()
		local lualine = require("lualine")
		local lazy_status = require("lazy.status")

		lualine.setup({
			options = {
				theme = "rose-pine",
				globalstatus = true,
				component_separators = { left = "", right = "" },
				section_separators = { left = "", right = "" },
				disabled_filetypes = {
					statusline = { "dashboard", "alpha", "starter" },
				},
			},
			sections = {
				lualine_a = {
					{ "mode", padding = { left = 1, right = 1 } },
				},
				lualine_b = {
					{ "branch", icon = "", padding = { left = 1, right = 1 } },
					{ "diff", symbols = { added = " ", modified = " ", removed = " " } },
					{ "diagnostics", symbols = { error = "󰅚 ", warn = "󰀪 ", info = " ", hint = "󰌶 " } },
				},
				lualine_c = {
					{ "filename", path = 0, symbols = { modified = " ●", readonly = " 󰌾", unnamed = "[No Name]", newfile = " 󰎔" } },
				},
				lualine_x = {
					{ lazy_status.updates, cond = lazy_status.has_updates, color = { fg = "#f6c177" } },
					{ "'󰙨 ' .. vim.g.xcodebuild_test_plan" },
					{ "vim.g.xcodebuild_platform == 'macOS' and '  macOS' or ' ' .. vim.g.xcodebuild_device_name" },
					{ "' ' .. vim.g.xcodebuild_os" },
					{ "filetype" },
				},
				lualine_y = { "progress" },
				lualine_z = { "location" },
			},
			inactive_sections = {
				lualine_a = {},
				lualine_b = {},
				lualine_c = { { "filename", path = 1 } },
				lualine_x = { "location" },
				lualine_y = {},
				lualine_z = {},
			},
		})
	end,
}
