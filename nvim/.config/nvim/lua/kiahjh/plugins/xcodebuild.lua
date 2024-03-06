return {
	"wojciech-kulik/xcodebuild.nvim",
	dependencies = {
		"nvim-telescope/telescope.nvim",
		"MunifTanjim/nui.nvim",
	},
	config = function()
		require("xcodebuild").setup({
			restore_on_start = true, -- logs, diagnostics, and marks will be loaded on VimEnter (may affect performance)
			auto_save = true, -- save all buffers before running build or tests (command: silent wa!)
			show_build_progress_bar = true, -- shows [ ...    ] progress bar during build, based on the last duration
			prepare_snapshot_test_previews = true, -- prepares a list with failing snapshot tests
		})
	end,
}
