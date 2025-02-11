return {
	"wojciech-kulik/xcodebuild.nvim",
	dependencies = {
		"nvim-telescope/telescope.nvim",
		"MunifTanjim/nui.nvim",
		"nvim-tree/nvim-tree.lua", -- (optional) to manage project files
		"nvim-treesitter/nvim-treesitter", -- (optional) for Quick tests support (required Swift parser)
	},
	config = function()
		require("xcodebuild").setup({
			code_coverage = {
				enabled = true,
			},
		})
	end,
}
