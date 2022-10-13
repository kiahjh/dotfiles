local fn = vim.fn

-- Automatically install packer
local install_path = fn.stdpath "data" .. "/site/pack/packer/start/packer.nvim"
if fn.empty(fn.glob(install_path)) > 0 then
  PACKER_BOOTSTRAP = fn.system {
    "git",
    "clone",
    "--depth",
    "1",
    "https://github.com/wbthomason/packer.nvim",
    install_path,
  }
  print "Installing packer close and reopen Neovim..."
  vim.cmd [[packadd packer.nvim]]
end

-- Autocommand that reloads neovim whenever you save the plugins.lua file
vim.cmd [[
  augroup packer_user_config
    autocmd!
    autocmd BufWritePost plugins.lua source <afile> | PackerSync
  augroup end
]]

-- Use a protected call so we don't error out on first use
local status_ok, packer = pcall(require, "packer")
if not status_ok then
  print "couldn't require packer"
  return
end

-- Have packer use a popup window
packer.init {
  display = {
    open_fn = function()
      return require("packer.util").float { border = "rounded" }
    end,
  },
}

return packer.startup(function(use)

  -- lets packer manage itself
  use "wbthomason/packer.nvim"

  -- lots of plugins rely on these two (i think)
  use "nvim-lua/popup.nvim"
  use "nvim-lua/plenary.nvim"

  -- fuzzy finder
  use { "junegunn/fzf", run = ":call fzf#install()" }
  use "junegunn/fzf.vim"

  -- vscode dark colorscheme
  -- use "tomasiser/vim-code-dark"

  -- some really nice ones from this repo
  -- use "lunarvim/colorschemes"

  -- current colorscheme
  use 'folke/tokyonight.nvim'

  -- completion
  use "hrsh7th/nvim-cmp"  -- The completion plugin
  use "hrsh7th/cmp-buffer"  -- buffer completions
  use "hrsh7th/cmp-path"  -- path completions
  use "hrsh7th/cmp-cmdline"  -- path completions
  use "saadparwaiz1/cmp_luasnip"  -- snippet completions
  use "hrsh7th/cmp-nvim-lsp"
  use "hrsh7th/cmp-nvim-lua"

  -- LSP
  use "neovim/nvim-lspconfig"
  use "williamboman/nvim-lsp-installer"

  -- snippets
  use { "L3MON4D3/LuaSnip" } -- engine
  use { "rafamadriz/friendly-snippets" } -- bunch of snippets

  -- prettier
  use "prettier/vim-prettier"

  -- swift
  use "vim-syntastic/syntastic"
  use "keith/swift"

  -- copilot
  use "github/copilot.vim"

  -- commenting out lines/chunks
  use "tpope/vim-commentary"

  -- gives me extra space at the bottom of a file like vscode
  -- use "vim-scripts/scrollfix"

  -- nerdtree
  use "preservim/nerdtree"

  -- syntax highlighting for gql fragments in .tsx
  use "jparise/vim-graphql"

  -- highlights/trims trailing whitespace
  use "ntpeters/vim-better-whitespace"

  -- automatically make sessions
  use "tpope/vim-obsession"

  -- git indicators in gutter, and more git stuff
  use "lewis6991/gitsigns.nvim"

  -- treesiter
  use { "nvim-treesitter/nvim-treesitter", run = ":TSUpdate" }

  -- automatically set up configuration after cloning packer.nvim
  if PACKER_BOOTSTRAP then
    require("packer").sync()
  end
end)
