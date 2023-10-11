-- install lazy.nvim if not installed
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
	vim.fn.system({
		"git",
		"clone",
		"--filter=blob:none",
		"https://github.com/folke/lazy.nvim.git",
		"--branch=stable", -- latest stable release
		lazypath,
	})
end
vim.opt.rtp:prepend(lazypath)

-- set space as leader
-- need to set leader before loading plugins, per lazy docs
vim.g.mapleader = " "
vim.g.maplocalleader = " "

require("lazy").setup({

	-- lots of plugins rely on these two (probably)
	"nvim-lua/popup.nvim",
	"nvim-lua/plenary.nvim",

	-- themes
	"LunarVim/Colorschemes",
	"folke/tokyonight.nvim",

	-- cmp plugins
	"hrsh7th/nvim-cmp", -- The completion plugin
	"hrsh7th/cmp-buffer", -- buffer completions
	"hrsh7th/cmp-path", -- path completions
	"hrsh7th/cmp-cmdline", -- cmdline completions
	"saadparwaiz1/cmp_luasnip", -- snippet completions
	"hrsh7th/cmp-nvim-lsp", -- snippet completions
	"hrsh7th/cmp-nvim-lua",

	-- snippets
	"L3MON4D3/LuaSnip", --snippet engine
	"rafamadriz/friendly-snippets", -- a bunch of snippets to use

	-- LSP
	"neovim/nvim-lspconfig", -- enable LSP
	"williamboman/mason.nvim", -- simple to use language server installer
	"williamboman/mason-lspconfig.nvim", -- simple to use language server installer
	"jose-elias-alvarez/null-ls.nvim", -- LSP diagnostics and code actions

	-- Telescope
	"nvim-telescope/telescope.nvim",
	"nvim-telescope/telescope-media-files.nvim",

	-- Treesitter
	{ "nvim-treesitter/nvim-treesitter", build = ":TSUpdate" },

	-- auto bracket/parens/squirrelly/etc. completion
	"windwp/nvim-autopairs",

	-- comments
	"JoosepAlviste/nvim-ts-context-commentstring",
	"numToStr/Comment.nvim",

	-- git
	"lewis6991/gitsigns.nvim",

	-- nvim-tree
	{
		"nvim-tree/nvim-tree.lua",
		dependencies = { "nvim-tree/nvim-web-devicons" }, -- for file icons
	},

	-- bufferline
	"akinsho/bufferline.nvim",
	"moll/vim-bbye",

	-- toggleterm
	"akinsho/toggleterm.nvim",

	-- copilot
	"github/copilot.vim",

	-- lualine
	"nvim-lualine/lualine.nvim",

	-- multi-cursor
	"mg979/vim-visual-multi",
})
