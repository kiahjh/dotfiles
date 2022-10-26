local status_ok, null_ls = pcall(require, "null-ls")
if not status_ok then
  print("null-ls not installed")
  return
end

local augroup = vim.api.nvim_create_augroup("LspFormatting", {})

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
        "@typescript-eslint/quotes: off",
        "--cache",
      },
    }),
  },
  on_attach = function(client, bufnr)
    if client.supports_method("textDocument/formatting") then
      vim.api.nvim_clear_autocmds({ group = augroup, buffer = bufnr })
      vim.api.nvim_create_autocmd("BufWritePre", {
        group = augroup,
        buffer = bufnr,
        callback = function()
          vim.lsp.buf.format({ bufnr = bufnr })
        end,
      })
    end
  end,
})
