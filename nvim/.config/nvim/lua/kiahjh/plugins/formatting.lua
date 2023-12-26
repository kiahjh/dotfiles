local cachedConfig = nil
local searchedForConfig = false

local function find_config()
	if searchedForConfig then
		return cachedConfig
	end

	-- find .swiftformat config file in the working directory
	-- could be simplified if you keep it always in the root directory
	local swiftFormatConfigs = vim.fn.systemlist({
		"find",
		vim.fn.getcwd(),
		"-maxdepth",
		"2", -- if you need you can set higher number
		"-iname",
		".swiftformat",
		"-not",
		"-path",
		"*/.*/*",
	})
	searchedForConfig = true

	if vim.v.shell_error ~= 0 then
		return nil
	end

	table.sort(swiftFormatConfigs, function(a, b)
		return a ~= "" and #a < #b
	end)

	if swiftFormatConfigs[1] then
		cachedConfig = string.match(swiftFormatConfigs[1], "^%s*(.-)%s*$")
	end

	return cachedConfig
end

return {
	"stevearc/conform.nvim",
	lazy = true,
	event = { "BufReadPre", "BufNewFile" }, -- to disable, comment this out
	config = function()
		local conform = require("conform")

		conform.setup({
			formatters_by_ft = {
				javascript = { "prettier" },
				typescript = { "prettier" },
				javascriptreact = { "prettier" },
				typescriptreact = { "prettier" },
				svelte = { "prettier" },
				css = { "prettier" },
				html = { "prettier" },
				json = { "prettier" },
				yaml = { "prettier" },
				markdown = { "prettier" },
				graphql = { "prettier" },
				lua = { "stylua" },
				python = { "isort", "black" },
				swift = { "swiftformat_ext" },
			},
			format_on_save = {
				lsp_fallback = true,
				async = false,
				timeout_ms = 500,
			},
			log_level = vim.log.levels.ERROR,
			formatters = {
				swiftformat_ext = {
					command = "swiftformat",
					args = function()
						return {
							"--config",
							find_config() or "~/.config/nvim/.swiftformat", -- update fallback path if needed
							"--stdinpath",
							"$FILENAME",
						}
					end,
					range_args = function(ctx)
						return {
							"--config",
							find_config() or "~/.config/nvim/.swiftformat", -- update fallback path if needed
							"--linerange",
							ctx.range.start[1] .. "," .. ctx.range["end"][1],
						}
					end,
					stdin = true,
					condition = function(ctx)
						return vim.fs.basename(ctx.filename) ~= "README.md"
					end,
				},
			},
		})

		vim.keymap.set({ "n", "v" }, "<leader>mp", function()
			conform.format({
				lsp_fallback = true,
				async = false,
				timeout_ms = 500,
			})
		end, { desc = "Format file or range (in visual mode)" })
	end,
}
