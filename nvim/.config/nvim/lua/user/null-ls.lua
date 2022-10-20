local status_ok, null_ls = pcall(require, "null-ls")
if not status_ok then
	return
end

null_ls.setup({
	debug = true,
	sources = {
		null_ls.builtins.formatting.eslint_d,
		null_ls.builtins.formatting.prettier,
		null_ls.builtins.formatting.stylua,
		null_ls.builtins.formatting.swiftformat,
		null_ls.builtins.diagnostics.eslint_d.with({
			extra_args = {
				"--rule",
				"@typescript-eslint/no-unused-vars: off",
				"--rule",
				"@typescript-eslint/quotes",
			},
		}),
	},
})
