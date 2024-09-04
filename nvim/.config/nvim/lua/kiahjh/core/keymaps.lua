-- set leader key to space
vim.g.mapleader = " "

local wk = require("which-key")
local map = vim.keymap.set -- for conciseness

--
-- CORE --
--  v

-- clear search highlights
map("n", "ff", ":nohl<CR>", { desc = "Clear search highlights" })

-- use <leader>; for command mode
map("n", "<leader>;", ":", { desc = "Command mode" })

-- resize split
map("n", "_", ":resize +2<CR>", { desc = "Increase horizontal split size" })
map("n", "|", ":resize -2<CR>", { desc = "Decrease horizontal split size" })
map("n", "(", ":vertical resize -2<CR>", { desc = "Decrease vertical split size" })
map("n", ")", ":vertical resize +2<CR>", { desc = "Increase vertical split size" })

-- quit neovim
map("n", "<leader>q", ":wqa<CR>", { desc = "Quit" })

-- dismiss notifications
map("n", "<leader>'", ":Noice dismiss<CR>", { desc = "Dismiss notifications" })

-- switch buffer
map("n", "L", ":bnext<CR>", { desc = "Next buffer" })
map("n", "H", ":bprevious<CR>", { desc = "Previous buffer" })

-- core lsp things
map("n", "K", "<cmd>lua vim.lsp.buf.hover()<CR>", { desc = "Show documentation for what is under cursor" })
map("n", "gd", "<cmd>Telescope lsp_definitions<CR>", { desc = "Show definitions" })
map("n", "gi", "<cmd>Telescope lsp_implementations<CR>", { desc = "Show implementations" })
map("n", "gt", "<cmd>Telescope lsp_type_definitions<CR>", { desc = "Show type definitions" })

-- lazy
map("n", "<leader>L", ":Lazy<CR>", { desc = "Lazy" })

--
-- MODULAR --
--   v
--

wk.add({
	{ "<leader>l", group = "LSP" },
	{ "<leader>lR", "<cmd>Telescope lsp_references<CR>", desc = "Show references" },
	{ "<leader>lr", vim.lsp.buf.rename, desc = "Smart rename" },
	{ "<leader>lD", vim.lsp.buf.declaration, desc = "Go to declaration" },
	{ "<leader>la", vim.lsp.buf.code_action, desc = "See available code actions" },
	{ "<leader>lx", ":LspRestart<CR>", desc = "Restart LSP" },
	{ "<leader>li", ":LspInfo<CR>", desc = "LSP info" },
	{ "<leader>ld", group = "Diagnostics" },
	{ "<leader>ldn", vim.diagnostic.goto_next, desc = "Go to next diagnostic" },
	{ "<leader>ldp", vim.diagnostic.goto_prev, desc = "Go to previous diagnostic" },
	{ "<leader>ldl", vim.diagnostic.open_float, desc = "Show line diagnostics" },
	{ "<leader>lda", "<cmd>Telescope diagnostics bufnr=0<CR>", desc = "Show all buffer diagnostics" },
})

wk.add({
	{ "<leader>w", group = "Window" },
	{ "<leader>wr", "<C-w>v", desc = "Split window right" },
	{ "<leader>wd", "<C-w>s", desc = "Split window down" },
	{ "<leader>we", "<C-w>=", desc = "Make splits equal size" },
	{ "<leader>wx", "<cmd>close<CR>", desc = "Close current split" },
})

wk.add({
	{ "<leader>b", group = "Buffer" },
	{ "<leader>bd", ":bd<CR>:BufferLineGoToBuffer 1<CR>", desc = "Close buffer" },
	{ "<leader>bo", ":BufferLineCloseOthers<CR>", desc = "Close all other buffers" },
	{ "<leader>bf", "<cmd>Telescope buffers<CR>", desc = "Find buffer" },
})

wk.add({
	{ "<leader>m", group = "MiniMap" },
	{ "<leader>mm", "<cmd>MinimapToggle<CR>", desc = "Toggle minimap" },
})

wk.add({
	{ "<leader>e", group = "Explorer" },
	{ "<leader>ee", "<cmd>NvimTreeToggle<CR>", desc = "Toggle file explorer" },
	{ "<leader>ef", "<cmd>NvimTreeFindFile<CR>", desc = "Show current file in explorer" },
	{ "<leader>ec", "<cmd>NvimTreeCollapse<CR>", desc = "Collapse file explorer" },
	{ "<leader>er", "<cmd>NvimTreeRefresh<CR>", desc = "Refresh file explorer" },
})

wk.add({
	{ "<leader>f", group = "File" },
	{ "<leader>ff", "<cmd>Telescope find_files<CR>", desc = "Find file" },
	{ "<leader>fr", "<cmd>Telescope oldfiles<CR>", desc = "Recent files" },
	{ "<leader>fs", "<cmd>Telescope live_grep<CR>", desc = "Search" },
})

wk.add({
	{ "<leader>g", group = "Git" },
	{ "<leader>gB", ":Gitsigns blame_line<CR>", desc = "Blame line" },
	{ "<leader>gD", ":Gitsigns diffthis<CR>", desc = "Diff this" },
	{ "<leader>gR", ":Gitsigns reset_hunk<CR>", desc = "Reset hunk" },
	{ "<leader>gp", ":Gitsigns preview_hunk_inline<CR>", desc = "Preview hunk inline" },
	{ "<leader>gP", ":Gitsigns preview_hunk<CR>", desc = "Preview hunk" },
	{ "<leader>gn", ":Gitsigns next_hunk<CR>", desc = "Next hunk" },
	{ "<leader>gN", ":Gitsigns prev_hunk<CR>", desc = "Previous hunk" },
	{ "<leader>gb", "<cmd>Telescope git_branches<CR>", desc = "Checkout branch" },
	{ "<leader>gc", "<cmd>Telescope git_commits<CR>", desc = "Checkout commit" },
})

wk.add({
	{ "<leader>c", group = "Quickfix" },
	{ "<leader>co", ":copen<CR>", desc = "Open quickfix" },
	{ "<leader>cc", ":cclose<CR>", desc = "Close quickfix" },
	{ "<leader>ct", ":Telescope quickfix<CR>", desc = "Show quickfix in telescope" },
	{ "<leader>ch", ":Telescope quickfixhistory<CR>", desc = "Show quickfix history in telescope" },
	{ "<leader>cn", ":cnext<CR>", desc = "Next quickfix" },
	{ "<leader>cp", ":cprevious<CR>", desc = "Previous quickfix" },
})

wk.add({
	{ "<leader>s", group = "Snippets" },
	{ "<leader>sc", '?><CR>:nohl<CR>i className=""<ESC>i', desc = "Add className attribute to element" },
	{
		"<leader>sx",
		'?><CR>:nohl<CR>i className={cx("")}<ESC>hhi',
		desc = "Add className attribute with cx() to element",
	},
})

wk.add({
	{ "<leader>h", group = "Harpoon" },
	{ "<leader>hm", "<cmd>lua require('harpoon.mark').add_file()<CR>", desc = "Mark file with harpoon" },
	{ "<leader>hn", "<cmd>lua require('harpoon.ui').nav_next()<CR>", desc = "Go to next harpoon mark" },
	{ "<leader>hp", "<cmd>lua require('harpoon.ui').nav_prev()<CR>", desc = "Go to previous harpoon mark" },
	{ "<leader>hh", "<cmd>lua require('harpoon.ui').toggle_quick_menu()<CR>", desc = "Show harpoon marks" },
})

wk.add({
	{ "<leader>a", group = "Session" },
	{ "<leader>ar", "<cmd>SessionRestore<CR>", desc = "Restore session for cwd" },
	{ "<leader>as", "<cmd>SessionSave<CR>", desc = "Save session for auto session root dir" },
})

wk.add({
	{ "<leader>o", group = "Copilot" },
	{ "<leader>oe", "<cmd>Copilot enable<CR>", desc = "Enable Copilot" },
	{ "<leader>od", "<cmd>Copilot disable<CR>", desc = "Disable Copilot" },
})

wk.add({
	{ "<leader>i", group = "Inlay Hints" },
	{
		"<leader>ii",
		"<cmd>lua vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled())<CR>",
		desc = "Toggle inlay hints",
	},
})

wk.add({
	{ "<leader>x", group = "XcodeBuild" },
	{ "<leader>xl", "<cmd>XcodebuildToggleLogs<cr>", desc = "Toggle Xcodebuild Logs" },
	{ "<leader>xb", "<cmd>XcodebuildBuild<cr>", desc = "Build Project" },
	{ "<leader>xr", "<cmd>XcodebuildBuildRun<cr>", desc = "Build & Run Project" },
	{ "<leader>xt", "<cmd>XcodebuildTest<cr>", desc = "Run Tests" },
	{ "<leader>xT", "<cmd>XcodebuildTestClass<cr>", desc = "Run This Test Class" },
	{ "<leader>xx", "<cmd>XcodebuildPicker<cr>", desc = "Show All Xcodebuild Actions" },
	{ "<leader>xd", "<cmd>XcodebuildSelectDevice<cr>", desc = "Select Device" },
	{ "<leader>xp", "<cmd>XcodebuildSelectTestPlan<cr>", desc = "Select Test Plan" },
	{ "<leader>xc", "<cmd>XcodebuildToggleCodeCoverage<cr>", desc = "Toggle Code Coverage" },
	{ "<leader>xC", "<cmd>XcodebuildShowCodeCoverageReport<cr>", desc = "Show Code Coverage Report" },
})
