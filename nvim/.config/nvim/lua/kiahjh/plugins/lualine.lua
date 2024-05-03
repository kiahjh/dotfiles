return {
	"nvim-lualine/lualine.nvim",
	dependencies = { "nvim-tree/nvim-web-devicons" },
	config = function()
		local lualine = require("lualine")

		local lazy_status = require("lazy.status") -- to configure lazy pending updates count

		-- configure lualine with modified theme
		lualine.setup({
			options = {
				theme = "catppuccin",
				section_separators = { left = "", right = "" },
				component_separators = { left = "", right = "" },
			},
			sections = {
				lualine_a = {
					{ "mode", separator = { left = "" }, padding = { left = 1, right = 1 } },
				},
				lualine_b = { "branch", "diff", "diagnostics" },
				lualine_c = { "filename" },
				lualine_x = {
					{
						lazy_status.updates,
						cond = lazy_status.has_updates,
						color = { fg = "#ff9e64" },
					},
					{ "'󰙨 ' .. vim.g.xcodebuild_test_plan" },
					{
						"vim.g.xcodebuild_platform == 'macOS' and '  macOS' or ' ' .. vim.g.xcodebuild_device_name",
					},
					{ "' ' .. vim.g.xcodebuild_os" },
					{ "filetype" },
				},
				lualine_y = { "progress" },
				lualine_z = {
					{ "location", separator = { right = "" }, padding = { left = 1, right = 1 } },
				},
			},
		})
	end,
}
