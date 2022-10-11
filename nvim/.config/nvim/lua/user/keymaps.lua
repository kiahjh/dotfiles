local opts = { noremap = true, silent = true }
local keymap = vim.api.nvim_set_keymap

-- space is leader key
keymap("", "<Space>", "<Nop>", opts)
vim.g.mapleader = " "
vim.g.maplocalleader = " "

-- window navigation
keymap("n", "<C-h>", "<C-w>h", opts)
keymap("n", "<C-j>", "<C-w>j", opts)
keymap("n", "<C-k>", "<C-w>k", opts)
keymap("n", "<C-l>", "<C-w>l", opts)

-- resize with arrows
keymap("n", "<C-Up>", ":resize +2<CR>", opts)
keymap("n", "<C-Down>", ":resize -2<CR>", opts)
keymap("n", "<C-Left>", ":vertical resize +2<CR>", opts)
keymap("n", "<C-Right>", ":vertical resize -2<CR>", opts)

-- keep selection when pasting in visual mode
keymap("v", "p", '"_dP', opts)

-- navigate buffers
keymap("n", "L", ":bnext<CR>", opts)
keymap("n", "H", ":bprevious<CR>", opts)

-- move text up and down (`x` is visual block mode)
keymap("v", "J", ":move .+1<CR>==", opts)
keymap("v", "K", ":move .-2<CR>==", opts)
keymap("x", "J", ":move '>+1<CR>gv-gv", opts)
keymap("x", "K", ":move '<-2<CR>gv-gv", opts)

-- copilot
vim.api.nvim_set_keymap("i", "<C-l>", 'copilot#Accept("<CR>")', { noremap = true, silent = false, expr = true })
vim.api.nvim_set_keymap("i", "<C-;>", 'copilot#Dismiss()', { noremap = true, silent = false, expr = true })
vim.api.nvim_set_keymap("i", "<C-j>", 'copilot#Next()', { noremap = true, silent = false, expr = true })

-- keymap("n", "<leader>e", "<cmd>lua vim.diagnostic.open_float()<CR>", opts)
-- keymap("n", "gd", "<cmd>lua vim.lsp.buf.definition()<CR>", opts)
-- keymap("n", "gD", "<cmd>lua vim.lsp.buf.declaration()<CR>", opts)
-- keymap("n", "gr", "<cmd>lua vim.lsp.buf.references()<CR>", opts)
-- keymap("n", "gi", "<cmd>lua vim.lsp.buf.implementation()<CR>", opts)
-- keymap("n", "gh", "<cmd>lua vim.lsp.buf.hover()<CR>", opts)
-- keymap("n", "<C-k>", "<cmd>lua vim.lsp.buf.signature_help()<CR>", opts)
