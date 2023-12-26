-- set leader key to space
vim.g.mapleader = " "

local keymap = vim.keymap -- for conciseness

---------------------
-- General Keymaps -------------------

-- use jk to exit insert mode
keymap.set("i", "jk", "<ESC>", { desc = "Exit insert mode with jk" })

-- clear search highlights
keymap.set("n", "ff", ":nohl<CR>", { desc = "Clear search highlights" })

-- delete single character without copying into register
keymap.set("n", "x", '"_x')

-- window management
keymap.set("n", "<leader>sv", "<C-w>v", { desc = "Split window vertically" }) -- split window vertically
keymap.set("n", "<leader>sh", "<C-w>s", { desc = "Split window horizontally" }) -- split window horizontally
keymap.set("n", "<leader>se", "<C-w>=", { desc = "Make splits equal size" }) -- make split windows equal width & height
keymap.set("n", "<leader>sx", "<cmd>close<CR>", { desc = "Close current split" }) -- close current split window

-- close buffer
keymap.set("n", "<leader>bd", ":bd<cr>:BufferLineGoToBuffer 1<cr>", { desc = "Close buffer" })

-- close all other buffers
keymap.set("n", "<leader>bo", "<cmd>BufferLineCloseOthers<CR>", { desc = "Close all other buffers" })

-- cycle bufferline
keymap.set("n", "H", ":BufferLineCyclePrev<cr>", { desc = "Go to previous tab" })
keymap.set("n", "L", ":BufferLineCycleNext<cr>", { desc = "Go to next tab" })

-- resize split
keymap.set("n", "+", ":resize +2<CR>", { desc = "Increase horizontal split size" })
keymap.set("n", "_", ":resize -2<CR>", { desc = "Decrease horizontal split size" })
keymap.set("n", "(", ":vertical resize -2<CR>", { desc = "Decrease vertical split size" })
keymap.set("n", ")", ":vertical resize +2<CR>", { desc = "Increase vertical split size" })
