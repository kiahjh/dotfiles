-- set leader key to space
vim.g.mapleader = " "

local keymap = vim.keymap -- for conciseness

---------------------
-- General Keymaps -------------------

-- clear search highlights
keymap.set("n", "ff", ":nohl<CR>", { desc = "Clear search highlights" })

keymap.set("n", "<leader>;", ":", { desc = "Command mode" })

-- window management
keymap.set("n", "<leader>sv", "<C-w>v", { desc = "Split window vertically" }) -- split window vertically
keymap.set("n", "<leader>sh", "<C-w>s", { desc = "Split window horizontally" }) -- split window horizontally
keymap.set("n", "<leader>se", "<C-w>=", { desc = "Make splits equal size" }) -- make split windows equal width & height
keymap.set("n", "<leader>sx", "<cmd>close<CR>", { desc = "Close current split" }) -- close current split window

-- close buffer
keymap.set("n", "<leader>bd", ":bd<cr>:BufferLineGoToBuffer 1<cr>", { desc = "Close buffer" })

-- close all other buffers
keymap.set("n", "<leader>bo", ":BufferLineCloseOthers<CR>", { desc = "Close all other buffers" })

-- cycle bufferline
keymap.set("n", "H", ":BufferLineCyclePrev<cr>", { desc = "Go to previous tab" })
keymap.set("n", "L", ":BufferLineCycleNext<cr>", { desc = "Go to next tab" })

-- resize split
keymap.set("n", "_", ":resize +2<CR>", { desc = "Increase horizontal split size" })
keymap.set("n", "|", ":resize -2<CR>", { desc = "Decrease horizontal split size" })
keymap.set("n", "(", ":vertical resize -2<CR>", { desc = "Decrease vertical split size" })
keymap.set("n", ")", ":vertical resize +2<CR>", { desc = "Increase vertical split size" })

-- minimap
keymap.set("n", "<leader>m", ":MinimapToggle<CR>", { desc = "Toggle minimap" })

-- noice
keymap.set("n", "<leader>'", ":Noice dismiss<CR>", { desc = "Dismiss messages" })

-- gitsigns
keymap.set("n", "<leader>gb", ":Gitsigns blame_line<CR>", { desc = "Blame line" })
keymap.set("n", "<leader>gD", ":Gitsigns diffthis<CR>", { desc = "Diff this" })
keymap.set("n", "<leader>gR", ":Gitsigns reset_hunk<CR>", { desc = "Reset hunk" })
keymap.set("n", "<leader>gp", ":Gitsigns preview_hunk_inline<CR>", { desc = "Preview hunk inline" })
keymap.set("n", "<leader>gP", ":Gitsigns preview_hunk<CR>", { desc = "Preview hunk" })
keymap.set("n", "<leader>gn", ":Gitsigns next_hunk<CR>", { desc = "Next hunk" })
keymap.set("n", "<leader>gN", ":Gitsigns prev_hunk<CR>", { desc = "Previous hunk" })

-- Quickfix
keymap.set("n", "<leader>co", ":copen<CR>", { desc = "Open quickfix" })
keymap.set("n", "<leader>cc", ":cclose<CR>", { desc = "Close quickfix" })
keymap.set("n", "<leader>cn", ":cnext<CR>", { desc = "Next quickfix" })

-- utilities/snippets
keymap.set("n", "<leader>ac", '?><CR>:nohl<CR>i className=""<ESC>i', { desc = "Add className attribute to element" })
keymap.set(
	"n",
	"<leader>ax",
	'?><CR>:nohl<CR>i className={cx("")}<ESC>hhi',
	{ desc = "Add className attribute with cx() to element" }
)
