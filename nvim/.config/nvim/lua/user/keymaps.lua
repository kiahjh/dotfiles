local opts = { noremap = true, silent = true }

local term_opts = { silent = true }

-- Shorten function name
local keymap = vim.api.nvim_set_keymap

--Remap space as leader key
keymap("", "<Space>", "<Nop>", opts)
vim.g.mapleader = " "
vim.g.maplocalleader = " "
-- Modes
--   normal_mode = "n",
--   insert_mode = "i",
--   visual_mode = "v",
--   visual_block_mode = "x",
--   term_mode = "t",
--   command_mode = "c",

-- Normal --
-- Better window navigation
keymap("n", "<C-h>", "<C-w>h", opts)
keymap("n", "<C-j>", "<C-w>j", opts)
keymap("n", "<C-k>", "<C-w>k", opts)
keymap("n", "<C-l>", "<C-w>l", opts)
keymap("n", "<leader>e", ":Lex 30<cr>", opts)

-- Resize with arrows
keymap("n", "+", ":resize +2<CR>", opts)
keymap("n", "_", ":resize -2<CR>", opts)
keymap("n", "(", ":vertical resize -2<CR>", opts)
keymap("n", ")", ":vertical resize +2<CR>", opts)

-- Remap ; to : for entering command mode
keymap("n", ";", ":", opts)

-- Navigate buffers
keymap("n", "<S-l>", ":bnext<CR>", opts)
keymap("n", "<S-h>", ":bprevious<CR>", opts)

-- Insert --

-- Visual --
-- Stay in indent mode
keymap("v", "<", "<gv", opts)
keymap("v", ">", ">gv", opts)

-- move text up and down (`x` is visual block mode)
keymap("v", "J", ":move .+1<CR>==", opts)
keymap("v", "K", ":move .-2<CR>==", opts)
keymap("x", "J", ":move '>+1<CR>gv-gv", opts)
keymap("x", "K", ":move '<-2<CR>gv-gv", opts)

-- don't override what I yanked
keymap("v", "p", '"_dP', opts)

-- Terminal --
-- Better terminal navigation
keymap("t", "<C-h>", "<C-\\><C-N><C-w>h", term_opts)
keymap("t", "<C-j>", "<C-\\><C-N><C-w>j", term_opts)
keymap("t", "<C-k>", "<C-\\><C-N><C-w>k", term_opts)
keymap("t", "<C-l>", "<C-\\><C-N><C-w>l", term_opts)

-- Telescope --
-- keymap("n", "<leader>f", "<cmd>Telescope find_files<cr>", opts)
keymap(
	"n",
	"<leader>f",
	"<cmd>lua require'telescope.builtin'.find_files(require('telescope.themes').get_dropdown({ previewer = false }))<cr>",
	opts
)
keymap("n", "<C-f>", "<cmd>Telescope live_grep<cr>", opts)

-- Gitsigns shortcuts
keymap("n", "<leader>d", "<cmd>Gitsigns preview_hunk<cr>", opts)
keymap("n", "<leader>b", "<cmd>Gitsigns blame_line<cr>", opts)

-- Nvimtree
keymap("n", "<leader>e", ":NvimTreeToggle<cr>", opts) -- toggle nvimtree
keymap("n", "<leader>s", ":NvimTreeFindFile<cr>", opts) -- find file in nvimtree

-- close buffer
keymap("n", "<C-x>", ":Bdelete<cr>", opts)
keymap("n", "<leader><C-x>", ":BufferLineCloseOthers<cr>", opts)

-- split window
keymap("n", "|", ":vsplit<cr>", opts)
keymap("n", '"', ":split<cr>", opts)

-- create/delete tabs
keymap("n", "<leader>t", ":tabnew %<cr>", opts)
keymap("n", "<leader>\\", ":tabclose<cr>", opts)

-- toggleterm
keymap("n", "<C-t>", ":ToggleTerm<cr>", opts)

-- code actions
keymap("n", "<leader><leader>", ":lua vim.lsp.buf.code_action()<CR>", opts)

-- jump to next diagnostic
keymap("n", "<C-e>", ":lua vim.diagnostic.goto_next()<CR>", opts)

-- open command palette
keymap("n", "<C-p>", ":CommandPalette<cr>", opts)

-- remove highlights
keymap("n", "ff", ":noh<cr>", opts)

-- rename variable
keymap("n", "<leader>r", ":lua vim.lsp.buf.rename()<CR>", opts)
