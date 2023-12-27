return {
	"nvimtools/none-ls.nvim", -- configure formatters & linters
	lazy = true,
	event = { "BufReadPre", "BufNewFile" }, -- to enable uncomment this
	dependencies = {
		"jay-babu/mason-null-ls.nvim",
	},
	config = function()
		local mason_null_ls = require("mason-null-ls")

		local null_ls = require("null-ls")

		mason_null_ls.setup({
			ensure_installed = {
				"prettier", -- prettier formatter
				"stylua", -- lua formatter
				"black", -- python formatter
				"pylint", -- python linter
				"eslint_d", -- js linter
			},
		})

		-- to setup format on save
		local augroup = vim.api.nvim_create_augroup("LspFormatting", {})

		local lsp_formatting = function(bufnr)
			vim.lsp.buf.format({
				timeout_ms = 6000,
				filter = function(client)
					return client.name == "null-ls"
				end,
				bufnr = bufnr,
			})
		end

		-- configure null_ls
		null_ls.setup({
			debug = true,
			sources = {
				null_ls.builtins.formatting.prettier,
				null_ls.builtins.formatting.eslint_d,
				null_ls.builtins.formatting.stylua,
				null_ls.builtins.diagnostics.eslint_d.with({
					extra_args = {
						"--rule",
						"@typescript-eslint/no-unused-vars: warn",
						"--rule",
						"@typescript-eslint/quotes: off",
						"--rule",
						"no-only-tests/no-only-tests: off",
						"--ignore-pattern",
						"'!**/.storybook/**/*'",
						"--cache",
					},
				}),
			},
			on_attach = function(client, bufnr)
				if client.name == "tsserver" then
					client.server_capabilities.documentFormattingProvider = false
				end
				if client.supports_method("textDocument/formatting") then
					vim.api.nvim_clear_autocmds({ group = augroup, buffer = bufnr })
					vim.api.nvim_create_autocmd("BufWritePre", {
						group = augroup,
						buffer = bufnr,
						callback = function()
							lsp_formatting(bufnr)
						end,
					})
				end
			end,
		})
	end,
}
