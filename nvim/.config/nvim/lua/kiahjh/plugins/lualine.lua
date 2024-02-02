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
			},
			sections = {
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
					{ "encoding" },
					{ "fileformat" },
					{ "filetype", icon_only = true },
				},
			},
		})
	end,
}
