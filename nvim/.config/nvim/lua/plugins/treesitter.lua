local snug_grammar = vim.env.SNUG_GRAMMAR
  or vim.fn.expand("~/active-projects/language/tree-sitter-snug")

return {
  'nvim-treesitter/nvim-treesitter',
  build = ':TSUpdate',
  main = 'nvim-treesitter.configs',
  config = function(_, opts)
    vim.filetype.add({
      extension = {
        snug = "snug",
      },
    })
    vim.opt.runtimepath:append(snug_grammar)

    local parser_config = require("nvim-treesitter.parsers").get_parser_configs()
    parser_config.snug = {
      install_info = {
        url = snug_grammar,
        files = { "src/parser.c" },
        generate_requires_npm = false,
        requires_generate_from_grammar = false,
      },
    }

    require("nvim-treesitter.configs").setup(opts)
  end,
  opts = {
    ensure_installed = {
      "json",
      "javascript",
      "typescript",
      "tsx",
      "yaml",
      "html",
      "css",
      "prisma",
      "markdown",
      "markdown_inline",
      "svelte",
      "graphql",
      "bash",
      "lua",
      "vim",
      "dockerfile",
      "gitignore",
      "query",
      "swift",
      "rust",
      "ocaml",
      "zig",
      "snug",
    },
    auto_install = true,
    highlight = {
      enable = true,
      -- Some languages depend on vim's regex highlighting system (such as Ruby) for indent rules.
      --  If you are experiencing weird indenting issues, add the language to
      --  the list of additional_vim_regex_highlighting and disabled languages for indent.
      additional_vim_regex_highlighting = { 'ruby' },
    },
    indent = { enable = true, disable = { 'ruby' } },
  },
}
