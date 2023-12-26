local cachedConfig = nil
local searchedForConfig = false

local function find_config()
	if searchedForConfig then
		return cachedConfig
	end

	-- find .swiftlint.yml config file in the working directory
	-- could be simplified if you keep it always in the root directory
	local swiftlintConfigs = vim.fn.systemlist({
		"find",
		vim.fn.getcwd(),
		"-maxdepth",
		"2", -- if you need you can set higher number
		"-iname",
		".swiftlint.yml",
		"-not",
		"-path",
		"*/.*/*",
	})
	searchedForConfig = true

	if vim.v.shell_error ~= 0 then
		return nil
	end

	table.sort(swiftlintConfigs, function(a, b)
		return a ~= "" and #a < #b
	end)

	if swiftlintConfigs[1] then
		cachedConfig = string.match(swiftlintConfigs[1], "^%s*(.-)%s*$")
	end

	return cachedConfig
end

local function setup_swiftlint()
	local lint = require("lint")
	local pattern = "[^:]+:(%d+):(%d+): (%w+): (.+)"
	local groups = { "lnum", "col", "severity", "message" }
	local defaults = { ["source"] = "swiftlint" }
	local severity_map = {
		["error"] = vim.diagnostic.severity.ERROR,
		["warning"] = vim.diagnostic.severity.WARN,
	}

	lint.linters.swiftlint = {
		cmd = "swiftlint",
		stdin = false,
		args = {
			"lint",
			"--force-exclude",
			"--use-alternative-excluding",
			"--config",
			function()
				return find_config() or os.getenv("HOME") .. "/.config/nvim/.swiftlint.yml"
			end,
		},
		stream = "stdout",
		ignore_exitcode = true,
		parser = require("lint.parser").from_pattern(pattern, groups, severity_map, defaults),
	}
end

return {
	"mfussenegger/nvim-lint",
	lazy = true,
	event = { "BufReadPre", "BufNewFile" }, -- to disable, comment this out
	config = function()
		local lint = require("lint")

		setup_swiftlint()

		lint.linters_by_ft = {
			javascript = { "eslint_d" },
			typescript = { "eslint_d" },
			javascriptreact = { "eslint_d" },
			typescriptreact = { "eslint_d" },
			svelte = { "eslint_d" },
			python = { "pylint" },
			swift = { "swiftlint" },
		}

		local lint_augroup = vim.api.nvim_create_augroup("lint", { clear = true })

		vim.api.nvim_create_autocmd({ "BufEnter", "BufWritePost", "InsertLeave" }, {
			group = lint_augroup,
			callback = function()
				lint.try_lint()
			end,
		})

		vim.keymap.set("n", "<leader>l", function()
			lint.try_lint()
		end, { desc = "Trigger linting for current file" })
	end,
}
