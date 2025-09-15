-- kiahjh's nvim config :)

-- [[ Basic Options ]]
--
-- set leader to <space>
-- this should be done prior to plugins being loaded
vim.g.mapleader = " "
vim.g.maplocalleader = " "

-- add line numbers
vim.opt.number = true

-- enable mouse mode, nice for resizing splits sometimes
vim.opt.mouse = "a"

-- don't show the mode
vim.opt.showmode = false
-- sync the clipboard between OS and nvim
vim.schedule(function()
	vim.opt.clipboard = "unnamedplus"
end)

-- enable break indent (indentation for wrapped lines)
vim.opt.breakindent = true

-- save undo history
vim.opt.undofile = true

-- case-insensitive searching unless capital letters in search
vim.opt.ignorecase = true
vim.opt.smartcase = true

-- keep signcolumn on by default
vim.opt.signcolumn = "yes"

-- decrease update time
vim.opt.updatetime = 250

-- decrease mapped sequence wait time
vim.opt.timeoutlen = 300

-- configures how new splits are opened
vim.opt.splitright = true
vim.opt.splitbelow = true

-- show some whitespace chars
vim.opt.list = true
vim.opt.listchars = { tab = "  ", trail = "·", nbsp = "␣" }

-- preview substitutions live while typing
vim.opt.inccommand = "split"

-- highlight line with cursor
vim.opt.cursorline = true

-- the bees knees
vim.opt.scrolloff = 10

-- turn on termguicolors
vim.opt.termguicolors = true

vim.opt.tabstop = 4

-- [[ Basic Autocommands ]]
--
-- highlight when yanking
vim.api.nvim_create_autocmd("TextYankPost", {
	desc = "Highlight when yanking (copying) text",
	group = vim.api.nvim_create_augroup("highlight-yank", { clear = true }),
	callback = function()
		vim.highlight.on_yank()
	end,
})

-- [[ Install lazy.nvim ]]

local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
	local lazyrepo = "https://github.com/folke/lazy.nvim.git"
	local out = vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
	if vim.v.shell_error ~= 0 then
		error("Error cloning lazy.nvim:\n" .. out)
	end
end ---@diagnostic disable-next-line: undefined-field
vim.opt.rtp:prepend(lazypath)

-- [[ Configure and install plugins ]]

require("lazy").setup({
	-- one-liners
	"tpope/vim-sleuth", -- Detect tabstop and shiftwidth automatically
	"lewis6991/gitsigns.nvim",
	"rktjmp/lush.nvim",

	require("plugins.autopairs"),
	require("plugins.barbar"),
	require("plugins.blink"),
	require("plugins.conform"),
	require("plugins.supermaven"),
	require("plugins.highlight-colors"),
	require("plugins.lazydev"),
	require("plugins.lspconfig"),
	require("plugins.lualine"),
	require("plugins.multicursor"),
	require("plugins.neo-tree"),
	require("plugins.noice"),
	require("plugins.snacks"),
	require("plugins.tiny-inline-diagnostic"),
	require("plugins.treesitter"),
	require("plugins.rose-pine"),
	require("plugins.which-key"),
	require("plugins.xcodebuild"),
})

-- [[ Set up stuff for Lovely ]]

vim.filetype.add({
	extension = {
		lv = "lovely"
	}
})

local parser_config = require("nvim-treesitter.parsers").get_parser_configs()

parser_config.lovely = {
	install_info = {
		url = "https://github.com/kiahjh/tree-sitter-lovely",
		files = { "src/parser.c" },
		requires_generate_from_grammar = false,
		-- revision = "3b933c7d500bffcbf1a39d815d790b9fd0741ca7",
	},
	filetype = "lovely",
}

vim.treesitter.language.register("lovely", "lovely")

require("keymaps")
require("gitsigns").setup()
