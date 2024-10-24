return {
	"neovim/nvim-lspconfig",
	event = { "BufReadPre", "BufNewFile" },
	dependencies = {
		"hrsh7th/cmp-nvim-lsp",
		{ "antosha417/nvim-lsp-file-operations", config = true },
	},
	config = function()
		-- import lspconfig plugin
		local lspconfig = require("lspconfig")

		-- import cmp-nvim-lsp plugin
		local cmp_nvim_lsp = require("cmp_nvim_lsp")

		local handlers = {
			["textDocument/hover"] = vim.lsp.with(vim.lsp.handlers.hover, { border = "rounded" }),
			["textDocument/signatureHelp"] = vim.lsp.with(vim.lsp.handlers.signature_help, { border = "rounded" }),
		}

		local on_attach = function()
			vim.diagnostic.config({
				float = {
					border = "rounded",
				},
			})
		end

		-- used to enable autocompletion (assign to every lsp server config)
		local capabilities = cmp_nvim_lsp.default_capabilities()

		-- Change the Diagnostic symbols in the sign column (gutter)
		-- (not in youtube nvim video)
		local signs = { Error = " ", Warn = " ", Hint = "󰠠 ", Info = " " }
		for type, icon in pairs(signs) do
			local hl = "DiagnosticSign" .. type
			vim.fn.sign_define(hl, { text = icon, texthl = hl, numhl = "" })
		end

		-- configure html server
		lspconfig.html.setup({
			capabilities = capabilities,
			on_attach = on_attach,
			handlers = handlers,
		})

		-- configure typescript server with plugin
		lspconfig.ts_ls.setup({
			capabilities = capabilities,
			on_attach = on_attach,
			handlers = handlers,
			settings = {
				typescript = {
					inlayHints = {
						includeInlayParameterNameHints = "all", -- 'none' | 'literals' | 'all'
						includeInlayParameterNameHintsWhenArgumentMatchesName = true,
						includeInlayVariableTypeHints = true,
						includeInlayFunctionParameterTypeHints = true,
						includeInlayVariableTypeHintsWhenTypeMatchesName = true,
						includeInlayPropertyDeclarationTypeHints = true,
						includeInlayFunctionLikeReturnTypeHints = true,
						includeInlayEnumMemberValueHints = true,
					},
				},
				javascript = {
					inlayHints = {
						includeInlayParameterNameHints = "all", -- 'none' | 'literals' | 'all'
						includeInlayParameterNameHintsWhenArgumentMatchesName = true,
						includeInlayVariableTypeHints = true,
						includeInlayFunctionParameterTypeHints = true,
						includeInlayVariableTypeHintsWhenTypeMatchesName = true,
						includeInlayPropertyDeclarationTypeHints = true,
						includeInlayFunctionLikeReturnTypeHints = true,
						includeInlayEnumMemberValueHints = true,
					},
				},
			},
		})

		-- configure css server
		lspconfig.cssls.setup({
			capabilities = capabilities,
			on_attach = on_attach,
			handlers = handlers,
		})

		-- configure tailwindcss server
		lspconfig.tailwindcss.setup({
			capabilities = capabilities,
			on_attach = on_attach,
			handlers = handlers,
		})

		-- configure prisma orm server
		lspconfig.prismals.setup({
			capabilities = capabilities,
			on_attach = on_attach,
			handlers = handlers,
		})

		-- configure lua server (with special settings)
		lspconfig.lua_ls.setup({
			capabilities = capabilities,
			on_attach = on_attach,
			handlers = handlers,
			settings = { -- custom settings for lua
				Lua = {
					-- make the language server recognize "vim" global
					diagnostics = {
						globals = { "vim" },
					},
					workspace = {
						-- make language server aware of runtime files
						library = {
							[vim.fn.expand("$VIMRUNTIME/lua")] = true,
							[vim.fn.stdpath("config") .. "/lua"] = true,
						},
					},
				},
			},
		})

		-- configure swift server
		lspconfig.sourcekit.setup({
			capabilities = capabilities,
			on_attach = on_attach,
			handlers = handlers,
			cmd = {
				"/usr/bin/sourcekit-lsp",
			},
			single_file_support = false, -- don't want this, because it falls back to the cwd if it can't find an xcode proj or spm package

			-- if it's an spm package (it has a Package.swift), then root_dir should be the root of the package; if it's an xcode project, then root_dir should be wherever buildServer.json is:
			root_dir = function(fname)
				return lspconfig.util.root_pattern("Package.swift", "buildServer.json")(fname)
					-- some reasonable falbacks:
					or lspconfig.util.find_git_ancestor(fname)
					or vim.fn.getcwd()
			end,
		})

		-- configure rust server
		lspconfig.rust_analyzer.setup({
			capabilities = capabilities,
			on_attach = on_attach,
			handlers = handlers,
			settings = {
				["rust-analyzer"] = {
					hint = { enable = true },
					checkOnSave = {
						command = "clippy",
					},
				},
			},
		})

		lspconfig.ocamllsp.setup({
			capabilities = capabilities,
			on_attach = on_attach,
			handlers = handlers,
		})

		-- configure astro server
		lspconfig.astro.setup({
			capabilities = capabilities,
			on_attach = on_attach,
			handlers = handlers,
			init_options = {
				typescript = {
					tsdk = vim.fs.normalize("~/Library/pnpm/global/5/node_modules/typescript/lib"),
				},
			},
		})
	end,
}
