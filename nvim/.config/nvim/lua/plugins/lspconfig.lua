return {
	"neovim/nvim-lspconfig",
	dependencies = {
	  { 'j-hui/fidget.nvim', opts = {} },
	},
	config = function()
		vim.diagnostic.config({
			float = { border = "rounded",
			}
		})

		vim.api.nvim_create_autocmd('LspAttach', {
			group = vim.api.nvim_create_augroup('lsp-attach', { clear = true }),
			callback = function(event)
			   local map = function(keys, func, desc, mode)
					mode = mode or 'n'
					vim.keymap.set(mode, keys, func, { buffer = event.buf, desc = 'LSP: ' .. desc })
			    end

				-- The following two autocommands are used to highlight references of the
				-- word under your cursor when your cursor rests there for a little while.
				--    See `:help CursorHold` for information about when this is executed
				--
				-- When you move your cursor, the highlights will be cleared (the second autocommand).
				local client = vim.lsp.get_client_by_id(event.data.client_id)
				if client and client.supports_method(vim.lsp.protocol.Methods.textDocument_documentHighlight) then
				  local highlight_augroup = vim.api.nvim_create_augroup('kickstart-lsp-highlight', { clear = false })
				  vim.api.nvim_create_autocmd({ 'CursorHold', 'CursorHoldI' }, {
				    buffer = event.buf,
				    group = highlight_augroup,
				    callback = vim.lsp.buf.document_highlight,
				  })

				  vim.api.nvim_create_autocmd({ 'CursorMoved', 'CursorMovedI' }, {
				    buffer = event.buf,
				    group = highlight_augroup,
				    callback = vim.lsp.buf.clear_references,
				  })

				  vim.api.nvim_create_autocmd('LspDetach', {
				    group = vim.api.nvim_create_augroup('kickstart-lsp-detach', { clear = true }),
				    callback = function(event2)
				  	vim.lsp.buf.clear_references()
				  	vim.api.nvim_clear_autocmds { group = 'kickstart-lsp-highlight', buffer = event2.buf }
				    end,
				  })
				end

				-- The following code creates a keymap to toggle inlay hints in your
				-- code, if the language server you are using supports them
				--
				-- This may be unwanted, since they displace some of your code
				if client and client.supports_method(vim.lsp.protocol.Methods.textDocument_inlayHint) then
				  map('<leader>th', function()
				    vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled { bufnr = event.buf })
				  end, '[T]oggle Inlay [H]ints')
				end
			end,
		})

		local signs = { Error = "󰅚 ", Warn = "󰀪 ", Hint = "󰌶 ", Info = " " }
		for type, icon in pairs(signs) do
		  local hl = "DiagnosticSign" .. type
		  vim.fn.sign_define(hl, { text = icon, texthl = hl, numhl = hl })
		end

		-- [[ Server Configurations ]]

		local lspconfig = require 'lspconfig'
		local capabilities = require("blink.cmp").get_lsp_capabilities()

		-- Lua
		lspconfig['lua_ls'].setup {
		  capabilities = capabilities,
		}

		-- Rust
		lspconfig["rust_analyzer"].setup {
		  capabilities = capabilities,
		  settings = {
			["rust-analyzer"] = {
			  checkOnSave = {
				command = "clippy",
			  },
			},
		  }
		}

		-- Zig
		lspconfig["zls"].setup {
		  capabilities = capabilities,
		}

		-- OCaml
		lspconfig["ocamllsp"].setup {
		  capabilities = capabilities,
		}

		-- TypeScript
		lspconfig["ts_ls"].setup {
		  capabilities = capabilities,
		}

		-- CSS
		lspconfig["tailwindcss"].setup {
		  capabilities = capabilities,
		}

		-- TailwindCSS
		lspconfig["cssls"].setup {
		  capabilities = capabilities,
		}

		lspconfig.astro.setup {
		  capabilities = capabilities,
		  init_options = {
			typescript = {
			  tsdk = vim.fs.normalize('~/Library/pnpm/global/5/node_modules/typescript/lib')
			}
		  },
		}

		-- Swift
		lspconfig.sourcekit.setup({
		  capabilities = capabilities,
		  cmd = {
		  	"/usr/bin/sourcekit-lsp",
		  },
		  single_file_support = false, -- don't want this, because it falls back to the cwd if it can't find an xcode proj or spm package

		  -- if it's an spm package (it has a Package.swift), then root_dir should be the root of the package; if it's an xcode project, then root_dir should be wherever buildServer.json is:
		  root_dir = function(fname)
		  	return lspconfig.util.root_pattern("Package.swift", "buildServer.json")(fname)
		  		-- some reasonable falbacks:
		  		or vim.fs.dirname(vim.fs.find('.git', { path = fname, upward = true })[1])
		  		or vim.fn.getcwd()
		  end,
		})
	end,
}
