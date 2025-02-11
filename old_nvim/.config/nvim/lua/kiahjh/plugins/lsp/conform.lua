return {
	"stevearc/conform.nvim",
	config = function()
		require("conform").setup({
			formatters_by_ft = {
				lua = { "stylua" },
				javascript = { "prettier", "eslint_d" },
				javascriptreact = { "prettier", "eslint_d" },
				typescript = { "prettier", "eslint_d" },
				typescriptreact = { "prettier", "eslint_d" },
				html = { "prettier" },
				css = { "prettier" },
				astro = { "prettier", "eslint_d" },
				rust = { "rustfmt" },
				swift = { "swiftformat" },
				ocaml = { "ocamlformat" },
				zig = { "zigfmt" },
			},
		})

		vim.api.nvim_create_autocmd("BufWritePre", {
			pattern = "*",
			callback = function(args)
				require("conform").format({ bufnr = args.bufnr })
			end,
		})
	end,
}
