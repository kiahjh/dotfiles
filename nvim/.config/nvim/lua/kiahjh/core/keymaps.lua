-- set leader key to space
vim.g.mapleader = " "

local map = vim.keymap.set -- for conciseness

-- clear search highlights
map("n", "ff", ":nohl<CR>", { desc = "Clear search highlights" })

map("n", "<leader>;", ":", { desc = "Command mode" })

-- window management
map("n", "<leader>sv", "<C-w>v", { desc = "Split window vertically" }) -- split window vertically
map("n", "<leader>sh", "<C-w>s", { desc = "Split window horizontally" }) -- split window horizontally
map("n", "<leader>se", "<C-w>=", { desc = "Make splits equal size" }) -- make split windows equal width & height
map("n", "<leader>sx", "<cmd>close<CR>", { desc = "Close current split" }) -- close current split window

-- close buffer
map("n", "<leader>bd", ":bd<cr>:BufferLineGoToBuffer 1<cr>", { desc = "Close buffer" })

-- close all other buffers
map("n", "<leader>bo", ":BufferLineCloseOthers<CR>", { desc = "Close all other buffers" })

-- cycle bufferline
map("n", "H", ":BufferLineCyclePrev<cr>", { desc = "Go to previous tab" })
map("n", "L", ":BufferLineCycleNext<cr>", { desc = "Go to next tab" })

-- resize split
map("n", "_", ":resize +2<CR>", { desc = "Increase horizontal split size" })
map("n", "|", ":resize -2<CR>", { desc = "Decrease horizontal split size" })
map("n", "(", ":vertical resize -2<CR>", { desc = "Decrease vertical split size" })
map("n", ")", ":vertical resize +2<CR>", { desc = "Increase vertical split size" })

-- minimap
map("n", "<leader>mm", ":MinimapToggle<CR>", { desc = "Toggle minimap" })

-- noice
map("n", "<leader>'", ":Noice dismiss<CR>", { desc = "Dismiss messages" })

-- gitsigns
map("n", "<leader>gb", ":Gitsigns blame_line<CR>", { desc = "Blame line" })
map("n", "<leader>gD", ":Gitsigns diffthis<CR>", { desc = "Diff this" })
map("n", "<leader>gR", ":Gitsigns reset_hunk<CR>", { desc = "Reset hunk" })
map("n", "<leader>gp", ":Gitsigns preview_hunk_inline<CR>", { desc = "Preview hunk inline" })
map("n", "<leader>gP", ":Gitsigns preview_hunk<CR>", { desc = "Preview hunk" })
map("n", "<leader>gn", ":Gitsigns next_hunk<CR>", { desc = "Next hunk" })
map("n", "<leader>gN", ":Gitsigns prev_hunk<CR>", { desc = "Previous hunk" })

-- Quickfix
map("n", "<leader>co", ":copen<CR>", { desc = "Open quickfix" })
map("n", "<leader>cc", ":cclose<CR>", { desc = "Close quickfix" })
map("n", "<leader>cn", ":cnext<CR>", { desc = "Next quickfix" })

-- utilities/snippets
map("n", "<leader>ac", '?><CR>:nohl<CR>i className=""<ESC>i', { desc = "Add className attribute to element" })
map(
	"n",
	"<leader>ax",
	'?><CR>:nohl<CR>i className={cx("")}<ESC>hhi',
	{ desc = "Add className attribute with cx() to element" }
)

-- cellular-automaton
map("n", "<leader>mr", ':CellularAutomaton make_it_rain<CR>', { desc = "Make it rain" })
