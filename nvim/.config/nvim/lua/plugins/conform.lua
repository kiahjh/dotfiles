return {
	"stevearc/conform.nvim",
	event = { "BufWritePre", "BufWritePost" },
	cmd = { "ConformInfo" },
	opts = function()
		local util = require("conform.util")

		local eslint_config_files = {
			"eslint.config.js",
			"eslint.config.mjs",
			"eslint.config.cjs",
			"eslint.config.ts",
			"eslint.config.mts",
			"eslint.config.cts",
			".eslintrc",
			".eslintrc.js",
			".eslintrc.cjs",
			".eslintrc.json",
			".eslintrc.yaml",
			".eslintrc.yml",
		}
		local eslint_config_file = {}
		for _, file in ipairs(eslint_config_files) do
			eslint_config_file[file] = true
		end

		local function package_json_has_eslint_config(path)
			local package_json = vim.fs.joinpath(path, "package.json")
			local lines = vim.fn.readfile(package_json)
			local ok, package = pcall(vim.json.decode, table.concat(lines, "\n"))
			return ok and type(package) == "table" and package.eslintConfig ~= nil
		end

		local eslint_root = function(_, ctx)
			return vim.fs.root(ctx.dirname, function(name, path)
				if eslint_config_file[name] then
					return true
				end

				if name == "package.json" then
					return package_json_has_eslint_config(path)
				end

				return false
			end)
		end

		local lint_fix_filetypes = {
			javascript = true,
			javascriptreact = true,
			typescript = true,
			typescriptreact = true,
			astro = true,
		}

		local eslint_d_supports_root
		local function can_use_eslint_d()
			if eslint_d_supports_root ~= nil then
				return eslint_d_supports_root
			end

			if vim.fn.executable("eslint_d") == 0 then
				eslint_d_supports_root = false
				return eslint_d_supports_root
			end

			-- eslint_d v14+ supports ESLINT_D_ROOT and works with ESLint v9 flat config.
			local help = vim.fn.system({ "eslint_d", "--help" })
			eslint_d_supports_root = vim.v.shell_error == 0 and help:find("ESLINT_D_ROOT", 1, true) ~= nil
			return eslint_d_supports_root
		end

		local eslint_node_root = function(_, ctx)
			local eslint_dir = vim.fs.find("node_modules/eslint", {
				path = ctx.dirname,
				upward = true,
				type = "directory",
				limit = 1,
			})[1]

			if eslint_dir then
				return vim.fs.dirname(vim.fs.dirname(eslint_dir))
			end

			return eslint_root(_, ctx)
		end

		local javascript_formatters = function()
			if can_use_eslint_d() then
				return { "prettierd", "eslint_d" }
			end

			return { "prettierd", "eslint_fix" }
		end

		return {
			notify_on_error = false,
			format_on_save = function(bufnr)
				local filetype = vim.bo[bufnr].filetype

				if lint_fix_filetypes[filetype] then
					return {
						formatters = can_use_eslint_d() and { "prettierd", "eslint_d" } or { "prettierd" },
						timeout_ms = can_use_eslint_d() and 3000 or 1000,
						lsp_format = "never",
					}
				end

				-- Disable "format_on_save lsp_fallback" for languages that don't
				-- have a well standardized coding style. You can add additional
				-- languages here or re-enable it for the disabled ones.
				local disable_filetypes = { c = true, cpp = true }
				local lsp_format_opt
				if disable_filetypes[filetype] then
					lsp_format_opt = "never"
				else
					lsp_format_opt = "fallback"
				end
				return {
					timeout_ms = 1000,
					lsp_format = lsp_format_opt,
				}
			end,
			format_after_save = function(bufnr)
				if lint_fix_filetypes[vim.bo[bufnr].filetype] and not can_use_eslint_d() then
					return {
						formatters = { "eslint_fix" },
						timeout_ms = 5000,
						lsp_format = "never",
					}
				end
			end,
			formatters_by_ft = {
				lua = { "stylua" },
				typescript = javascript_formatters,
				javascript = javascript_formatters,
				typescriptreact = javascript_formatters,
				javascriptreact = javascript_formatters,
				astro = javascript_formatters,
				json = { "prettierd" },
				jsonc = { "prettierd" },
				css = { "prettierd" },
				scss = { "prettierd" },
				html = { "prettierd" },
				markdown = { "prettierd" },
				ocaml = { "ocamlformat" },
				swift = { "swiftformat" },
				c = { "clang-format" },
			},
			formatters = {
				-- Use the nearest project Prettier config rather than a global/default style.
				prettierd = {
					cwd = require("conform.formatters.prettierd").cwd,
					require_cwd = true,
				},

				-- Fast path: eslint_d keeps the project ESLint process warm. v14+ is needed
				-- for ESLint v9 flat config; ESLINT_D_ROOT points it at local node_modules.
				eslint_d = {
					command = "eslint_d",
					args = { "--fix-to-stdout", "--stdin", "--stdin-filename", "$FILENAME" },
					cwd = eslint_root,
					require_cwd = true,
					condition = function()
						return can_use_eslint_d()
					end,
					env = function(self, ctx)
						return {
							ESLINT_D_ROOT = eslint_node_root(self, ctx) or "",
							ESLINT_D_MISS = "fail",
						}
					end,
					exit_codes = { 0, 1 },
				},

				-- Fallback for old/missing eslint_d. ESLint v9 flat config removed
				-- --fix-to-stdout, so use a temp file next to the buffer. This still
				-- runs the project-local node_modules/.bin/eslint, but is slower.
				eslint_fix = {
					command = util.find_executable({ "node_modules/.bin/eslint" }, "eslint"),
					args = { "--fix", "$FILENAME" },
					cwd = eslint_root,
					require_cwd = true,
					stdin = false,
					tmpfile_format = "$RANDOM.$FILENAME",
					exit_codes = { 0, 1 },
				},
			},
		}
	end,
}
