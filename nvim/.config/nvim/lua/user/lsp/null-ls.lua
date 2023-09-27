local status_ok, null_ls = pcall(require, "null-ls")
if not status_ok then
	print("null-ls not installed")
	return
end

local lsp_formatting = function(bufnr)
	vim.lsp.buf.format({
		timeout_ms = 6000,
		filter = function(client)
			return client.name == "null-ls"
		end,
		bufnr = bufnr,
	})
end

local augroup = vim.api.nvim_create_augroup("LspFormatting", {})

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
