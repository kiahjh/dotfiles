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

  -- lsp and completion
  use "neovim/nvim-lspconfig"
  use "hrsh7th/nvim-compe"

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
  use "vim-scripts/scrollfix"

  -- nerdtree
  use "preservim/nerdtree"

  -- syntax highlighting for gql fragments in .tsx
  use "jparise/vim-graphql"

  -- highlights/trims trailing whitespace
  use "ntpeters/vim-better-whitespace"

  -- automatically make sessions
  use "tpope/vim-obsession"

  -- automatically set up configuration after cloning packer.nvim
  if PACKER_BOOTSTRAP then
    require("packer").sync()
  end
end)
