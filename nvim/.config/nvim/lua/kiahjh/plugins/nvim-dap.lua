return {
	"mfussenegger/nvim-dap",
	dependencies = {
		"wojciech-kulik/xcodebuild.nvim",
	},
	config = function()
		local dap = require("dap")
		local xcodebuild = require("xcodebuild.dap")

		dap.configurations.swift = {
			{
				name = "iOS App Debugger",
				type = "codelldb",
				request = "attach",
				program = xcodebuild.get_program_path,
				cwd = "${workspaceFolder}",
				stopOnEntry = false,
				waitFor = true,
			},
		}

		dap.adapters.codelldb = {
			type = "server",
			port = "13000",
			executable = {
				command = os.getenv("HOME") .. "/.local/codelldb-aarch64-darwin/extension/adapter/codelldb",
				args = {
					"--port",
					"13000",
					"--liblldb",
					"/Applications/Xcode.app/Contents/SharedFrameworks/LLDB.framework/Versions/A/LLDB",
				},
			},
		}

		-- nice breakpoint icons
		local define = vim.fn.sign_define
		define("DapBreakpoint", { text = "", texthl = "DiagnosticError", linehl = "", numhl = "" })
		define("DapBreakpointRejected", { text = "", texthl = "DiagnosticError", linehl = "", numhl = "" })
		define("DapStopped", { text = "", texthl = "DiagnosticOk", linehl = "", numhl = "" })
		define("DapLogPoint", { text = "", texthl = "DiagnosticInfo", linehl = "", numhl = "" })
		define("DapLogPoint", { text = "", texthl = "DiagnosticInfo", linehl = "", numhl = "" })

		-- integration with xcodebuild.nvim
		vim.keymap.set("n", "<leader>dd", xcodebuild.build_and_debug, { desc = "Build & Debug" })
		vim.keymap.set("n", "<leader>dr", xcodebuild.debug_without_build, { desc = "Debug Without Building" })

		vim.keymap.set("n", "<leader>dc", dap.continue, { desc = "Continue" })
		vim.keymap.set("n", "<leader>ds", dap.step_over, { desc = "Step Over" })
		vim.keymap.set("n", "<leader>di", dap.step_into, { desc = "Step Into" })
		vim.keymap.set("n", "<leader>do", dap.step_out, { desc = "Step Out" })
		vim.keymap.set("n", "<leader>db", dap.toggle_breakpoint, { desc = "Toggle Breakpoint" })
		vim.keymap.set("n", "<leader>dB", function()
			dap.set_breakpoint(nil, nil, vim.fn.input("Log point message: "))
		end, { desc = "Log Point" })
		vim.keymap.set("n", "<leader>dx", function()
			dap.terminate()
			require("xcodebuild.actions").cancel()

			local success, dapui = pcall(require, "dapui")
			if success then
				dapui.close()
			end
		end, { desc = "Stop Debugging" })
	end,
}
