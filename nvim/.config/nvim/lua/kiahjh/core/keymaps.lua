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

--
-- MODULAR --
--   v
--

wk.register({
	l = {
		name = "LSP",
		R = { "<cmd>Telescope lsp_references<CR>", "Show references" },
		r = { vim.lsp.buf.rename, "Smart rename" },
		D = { vim.lsp.buf.declaration, "Go to declaration" },
		a = { vim.lsp.buf.code_action, "See available code actions" },
		x = { ":LspRestart<CR>", "Restart LSP" },
		d = {
			name = "Diagnostics",
			n = { vim.diagnostic.goto_next, "Go to next diagnostic" },
			p = { vim.diagnostic.goto_prev, "Go to previous diagnostic" },
			l = { vim.diagnostic.open_float, "Show line diagnostics" },
			a = { "<cmd>Telescope diagnostics bufnr=0<CR>", "Show all buffer diagnostics" },
		},
	},
}, { prefix = "<leader>" })

wk.register({
	w = {
		name = "Window",
		v = { "<C-w>v", "Split window vertically" },
		h = { "<C-w>s", "Split window horizontally" },
		e = { "<C-w>=", "Make splits equal size" },
		x = { "<cmd>close<CR>", "Close current split" },
	},
}, { prefix = "<leader>" })

wk.register({
	b = {
		name = "Buffer",
		d = { ":bd<CR>:BufferLineGoToBuffer 1<CR>", "Close buffer" },
		o = { ":BufferLineCloseOthers<CR>", "Close all other buffers" },
		f = { "<cmd>Telescope buffers<CR>", "Find buffer" },
	},
}, { prefix = "<leader>" })

wk.register({
	m = {
		name = "MiniMap",
		m = { "<cmd>MinimapToggle<CR>", "Toggle minimap" },
	},
}, { prefix = "<leader>" })

wk.register({
	e = {
		name = "Explorer",
		e = { "<cmd>NvimTreeToggle<CR>", "Toggle file explorer" },
		f = { "<cmd>NvimTreeFindFile<CR>", "Show current file in explorer" },
		c = { "<cmd>NvimTreeCollapse<CR>", "Collapse file explorer" },
		r = { "<cmd>NvimTreeRefresh<CR>", "Refresh file explorer" },
	},
}, { prefix = "<leader>" })

wk.register({
	f = {
		name = "File",
		f = { "<cmd>Telescope find_files<CR>", "Find file" },
		r = { "<cmd>Telescope oldfiles<CR>", "Recent files" },
		s = { "<cmd>Telescope live_grep<CR>", "Search" },
	},
}, { prefix = "<leader>" })

wk.register({
	g = {
		name = "Git",
		B = { ":Gitsigns blame_line<CR>", "Blame line" },
		D = { ":Gitsigns diffthis<CR>", "Diff this" },
		R = { ":Gitsigns reset_hunk<CR>", "Reset hunk" },
		p = { ":Gitsigns preview_hunk_inline<CR>", "Preview hunk inline" },
		P = { ":Gitsigns preview_hunk<CR>", "Preview hunk" },
		n = { ":Gitsigns next_hunk<CR>", "Next hunk" },
		N = { ":Gitsigns prev_hunk<CR>", "Previous hunk" },
		b = { "<cmd>Telescope git_branches<CR>", "Checkout branch" },
		c = { "<cmd>Telescope git_commits<CR>", "Checkout commit" },
	},
}, { prefix = "<leader>" })

wk.register({
	c = {
		name = "Quickfix",
		o = { ":copen<CR>", "Open quickfix" },
		c = { ":cclose<CR>", "Close quickfix" },
		t = { ":Telescope quickfix<CR>", "Show quickfix in telescope" },
		h = { ":Telescope quickfixhistory<CR>", "Show quickfix history in telescope" },
		n = { ":cnext<CR>", "Next quickfix" },
	},
}, { prefix = "<leader>" })

wk.register({
	s = {
		name = "Snippets",
		c = { '?><CR>:nohl<CR>i className=""<ESC>i', "Add className attribute to element" },
		x = { '?><CR>:nohl<CR>i className={cx("")}<ESC>hhi', "Add className attribute with cx() to element" },
	},
}, { prefix = "<leader>" })

wk.register({
	h = {
		name = "Harpoon",
		m = { "<cmd>lua require('harpoon.mark').add_file()<CR>", "Mark file with harpoon" },
		n = { "<cmd>lua require('harpoon.ui').nav_next()<CR>", "Go to next harpoon mark" },
		p = { "<cmd>lua require('harpoon.ui').nav_prev()<CR>", "Go to previous harpoon mark" },
		h = { "<cmd>lua require('harpoon.ui').toggle_quick_menu()<CR>", "Show harpoon marks" },
	},
}, { prefix = "<leader>" })

wk.register({
	x = {
		name = "XCodeBuild",
		l = { "<cmd>XcodebuildToggleLogs<CR>", "Toggle Xcodebuild Logs" },
		b = { "<cmd>XcodebuildBuild<CR>", "Build Project" },
		x = { "<cmd>XcodebuildBuildRun<CR>", "Build & Run Project" },
		r = { "<cmd>XcodebuildBuildRun<CR>", "Build & Run Project" },
		t = { "<cmd>XcodebuildTest<CR>", "Run Tests" },
		T = { "<cmd>XcodebuildTestClass<CR>", "Run This Test Class" },
		X = { "<cmd>XcodebuildPicker<CR>", "Show All Xcodebuild Actions" },
		d = { "<cmd>XcodebuildSelectDevice<CR>", "Select Device" },
		p = { "<cmd>XcodebuildSelectTestPlan<CR>", "Select Test Plan" },
		c = { "<cmd>XcodebuildToggleCodeCoverage<CR>", "Toggle Code Coverage" },
		C = { "<cmd>XcodebuildShowCodeCoverageReport<CR>", "Show Code Coverage Report" },
	},
}, { prefix = "<leader>" })

wk.register({
	a = {
		name = "Session",
		r = { "<cmd>SessionRestore<CR>", "Restore session for cwd" },
		s = { "<cmd>SessionSave<CR>", "Save session for auto session root dir" },
	},
}, { prefix = "<leader>" })
