local wk = require("which-key")
local map = vim.keymap.set
local Snacks = require("snacks")

-- clear search highlights
map("n", "ff", "<cmd>nohlsearch<CR>")

-- quit nvim
map("n", "<leader>X", "<cmd>wqa<CR>", { desc = "Save and quit" })

-- put diagnostics into quickfix list
map("n", "<leader>q", vim.diagnostic.setloclist, { desc = "Open diagnostic [Q]uickfix list" })

-- navigating between splits
map("n", "<C-h>", "<C-w><C-h>", { desc = "Move focus to the left window" })
map("n", "<C-l>", "<C-w><C-l>", { desc = "Move focus to the right window" })
map("n", "<C-j>", "<C-w><C-j>", { desc = "Move focus to the lower window" })
map("n", "<C-k>", "<C-w><C-k>", { desc = "Move focus to the upper window" })

-- utils
map("n", "<leader><space>", Snacks.picker.smart, { desc = "Smart find files" })
map("n", "<leader>/", Snacks.picker.grep, { desc = "Grep" })
map("n", "<leader>:", Snacks.picker.command_history, { desc = "Command history" })
map("n", "<leader>h", Snacks.picker.notifications, { desc = "Notification history" }) map("n", "<leader>,", Snacks.picker.buffers, { desc = "Buffers" })
map("n", "<leader>.", function() Snacks.scratch() end, { desc = "Open Scratch Buffer" })
map("n", "<leader>S", function() Snacks.scratch.select() end, { desc = "Select Scratch Buffer" })
map("n", "<leader>R", function() Snacks.rename.rename_file() end, { desc = "Rename File" })
map("n", "<leader>un", function() Snacks.notifier.hide() end, { desc = "Dismiss All Notifications" })
map("n", "]]", function() Snacks.words.jump(vim.v.count1) end, { desc = "Next Reference" })
map("n", "[[", function() Snacks.words.jump(-vim.v.count1) end, { desc = "Prev Reference" })

-- lsp goodies
map("n", "gd", Snacks.picker.lsp_definitions, { desc = "Goto Definition" })
map("n", "gD", Snacks.picker.lsp_declarations, { desc = "Goto Declaration" })
map("n", "gr", Snacks.picker.lsp_references, { desc = "References" })
map("n", "gI", Snacks.picker.lsp_implementations, { desc = "Goto Implementation" })
map("n", "gy", Snacks.picker.lsp_type_definitions, { desc = "Goto Type Definitions" })

-- switch buffers
map("n", "H", "<cmd>BufferPrevious<CR>", { desc = "Previous Buffer" })
map("n", "L", "<cmd>BufferNext<CR>", { desc = "Next Buffer" })

-- multicursor

local mc = require("multicursor-nvim")

-- Add or skip cursor above/below the main cursor.
map({"n", "v"}, "<up>", function() mc.lineAddCursor(-1) end, { desc = "Add cursor above" })
map({"n", "v"}, "<down>", function() mc.lineAddCursor(1) end, { desc = "Add cursor below" })
map({"n", "v"}, "<leader><up>", function() mc.lineSkipCursor(-1) end, { desc = "Skip cursor above" })
map({"n", "v"}, "<leader><down>", function() mc.lineSkipCursor(1) end, { desc = "Skip cursor below" })

-- Add or skip adding a new cursor by matching word/selection
map({"n", "v"}, "<leader>n", function() mc.matchAddCursor(1) end, { desc = "New cursor on next match" })
map({"n", "v"}, "<leader>m", function() mc.matchSkipCursor(1) end, { desc = "Skip next match" })
map({"n", "v"}, "<leader>N", function() mc.matchAddCursor(-1) end, { desc = "New cursor on previous match" })
map({"n", "v"}, "<leader>M", function() mc.matchSkipCursor(-1) end, { desc = "Skip previous match" })

-- Add all matches in the document
map({"n", "v"}, "<leader>A", mc.matchAllAddCursors, { desc = "Add all matches" })

-- You can also add cursors with any motion you prefer:
-- set("n", "<right>", function()
--     mc.addCursor("w")
-- end)
-- set("n", "<leader><right>", function()
--     mc.skipCursor("w")
-- end)

-- Rotate the main cursor.
map({"n", "v"}, "<left>", mc.prevCursor, { desc = "Make previous cursor main cursor" })
map({"n", "v"}, "<right>", mc.nextCursor, { desc = "Make next cursor main cursor" })

-- Delete the main cursor.
map({"n", "v"}, "<leader>x", mc.deleteCursor, { desc = "Delete main cursor" })

-- Easy way to add and remove cursors using the main cursor.
map({"n", "v"}, "<c-q>", mc.toggleCursor, { desc = "Create a cursor" })

-- Clone every cursor and disable the originals.
map({"n", "v"}, "<leader><c-q>", mc.duplicateCursors, { desc = "Duplicate cursors" })

map("n", "<esc>", function()
    if not mc.cursorsEnabled() then
        mc.enableCursors()
    elseif mc.hasCursors() then
        mc.clearCursors()
    else
        -- Default <esc> handler.
    end
end)

-- bring back cursors if you accidentally clear them
map("n", "<leader>gv", mc.restoreCursors, { desc = "Restore cursors" })

-- Align cursor columns.
map("n", "<leader>a", mc.alignCursors, { desc = "Align cursors" })

-- Split visual selections by regex.
map("v", "S", mc.splitCursors, { desc = "Split selection on regex" })

-- Append/insert for each line of visual selections.
map("v", "I", mc.insertVisual)
map("v", "A", mc.appendVisual)

-- match new cursors within visual selections by regex.
map("v", "M", mc.matchCursors, { desc = "Create cursors on regex" })

-- Rotate visual selection contents.
map("v", "<leader>t", function() mc.transposeCursors(1) end, { desc = "Rotate selection content" })
map("v", "<leader>T", function() mc.transposeCursors(-1) end, { desc = "Rotate selection content backwards" })

wk.add({
  { "<leader>b", group = "Buffers" },
  { "<leader>bd", ":BufferDelete<CR>", { desc = "Delete Buffer" }},
  { "<leader>bo", ":BufferCloseAllButCurrent<CR>", { desc = "Close all other buffers" }}
})

wk.add({
  { "<leader>t", group = "Toggle" },
  { "<leader>tz", function() Snacks.zen() end, desc = "Toggle Zen Mode" },
  { "<leader>tZ", function() Snacks.zen.zoom() end, desc = "Toggle Zoom Mode" },
  { "<leader>tdd", function() Snacks.dim() end, desc = "Turn on Dim" },
  { "<leader>tdo", function() Snacks.dim.disable() end, desc = "Turn off Dim" },
})

wk.add({
  { "<leader>f", group = "Find" },
  { "<leader>fb", Snacks.picker.buffers, desc = "Buffers" },
  { "<leader>ff", function() Snacks.picker.files() end, desc = "Find Files" },
  { "<leader>fg", function() Snacks.picker.git_files() end, desc = "Find Git Files" },
  { "<leader>fp", function() Snacks.picker.projects() end, desc = "Projects" },
  { "<leader>fr", function() Snacks.picker.recent() end, desc = "Recent" },
})

wk.add({
  { "<leader>g", group = "Git" },
  { "<leader>gb", function() Snacks.picker.git_branches() end, desc = "Git Branches" },
  { "<leader>gl", function() Snacks.picker.git_log() end, desc = "Git Log" },
  { "<leader>gL", function() Snacks.picker.git_log_line() end, desc = "Git Log Line" },
  { "<leader>gs", function() Snacks.picker.git_status() end, desc = "Git Status" },
  { "<leader>gS", function() Snacks.picker.git_stash() end, desc = "Git Stash" },
  { "<leader>gd", function() Snacks.picker.git_diff() end, desc = "Git Diff (Hunks)" },
  { "<leader>gf", function() Snacks.picker.git_log_file() end, desc = "Git Log File" },
  { "<leader>gB", ":Gitsigns blame_line<CR>", desc = "Blame line" },
  { "<leader>gD", ":Gitsigns diffthis<CR>", desc = "Diff this" },
  { "<leader>gR", ":Gitsigns reset_hunk<CR>", desc = "Reset hunk" },
  { "<leader>gp", ":Gitsigns preview_hunk_inline<CR>", desc = "Preview hunk inline" },
  { "<leader>gP", ":Gitsigns preview_hunk<CR>", desc = "Preview hunk" },
  { "<leader>gn", ":Gitsigns next_hunk<CR>", desc = "Next hunk" },
  { "<leader>gN", ":Gitsigns prev_hunk<CR>", desc = "Previous hunk" },
})

wk.add({
  { "<leader>s", group = "Search" },
  { "<leader>sb", function() Snacks.picker.lines() end, desc = "Buffer Lines" },
  { "<leader>sB", function() Snacks.picker.grep_buffers() end, desc = "Grep Open Buffers" },
  { "<leader>sg", function() Snacks.picker.grep() end, desc = "Grep" },
  { "<leader>sw", function() Snacks.picker.grep_word() end, desc = "Visual selection or word", mode = { "n", "x" } },
  { '<leader>s"', function() Snacks.picker.registers() end, desc = "Registers" },
  { '<leader>s/', function() Snacks.picker.search_history() end, desc = "Search History" },
  { "<leader>sa", function() Snacks.picker.autocmds() end, desc = "Autocmds" },
  { "<leader>sc", function() Snacks.picker.command_history() end, desc = "Command History" },
  { "<leader>sC", function() Snacks.picker.commands() end, desc = "Commands" },
  { "<leader>sd", function() Snacks.picker.diagnostics() end, desc = "Diagnostics" },
  { "<leader>sD", function() Snacks.picker.diagnostics_buffer() end, desc = "Buffer Diagnostics" },
  { "<leader>sh", function() Snacks.picker.help() end, desc = "Help Pages" },
  { "<leader>sH", function() Snacks.picker.highlights() end, desc = "Highlights" },
  { "<leader>si", function() Snacks.picker.icons() end, desc = "Icons" },
  { "<leader>sj", function() Snacks.picker.jumps() end, desc = "Jumps" },
  { "<leader>sk", function() Snacks.picker.keymaps() end, desc = "Keymaps" },
  { "<leader>sl", function() Snacks.picker.loclist() end, desc = "Location List" },
  { "<leader>sm", function() Snacks.picker.marks() end, desc = "Marks" },
  { "<leader>sM", function() Snacks.picker.man() end, desc = "Man Pages" },
  { "<leader>sp", function() Snacks.picker.lazy() end, desc = "Search for Plugin Spec" },
  { "<leader>sq", function() Snacks.picker.qflist() end, desc = "Quickfix List" },
  { "<leader>sR", function() Snacks.picker.resume() end, desc = "Resume" },
  { "<leader>su", function() Snacks.picker.undo() end, desc = "Undo History" },
  { "<leader>sC", function() Snacks.picker.colorschemes() end, desc = "Colorschemes" },
  { "<leader>ss", function() Snacks.picker.lsp_symbols() end, desc = "LSP Symbols" },
  { "<leader>sS", function() Snacks.picker.lsp_workspace_symbols() end, desc = "LSP Workspace Symbols" },
})

wk.add({
  { "<leader>l", group = "LSP" },
  { "<leader>lr", vim.lsp.buf.rename, desc = "Smart rename" },
  { "<leader>lD", vim.lsp.buf.declaration, desc = "Go to declaration" },
  { "<leader>la", vim.lsp.buf.code_action, desc = "See available code actions" },
  { "<leader>lx", ":LspRestart<CR>", desc = "Restart LSP" },
  { "<leader>li", ":LspInfo<CR>", desc = "LSP info" },
  { "<leader>ld", group = "Diagnostics" },
  { "<leader>ldn", function() vim.diagnostic.jump { count = 1, float = true } end, desc = "Go to next diagnostic" },
  { "<leader>ldp", function() vim.diagnostic.jump { count = -1, float = true } end, desc = "Go to next diagnostic" },
  { "<leader>ldl", vim.diagnostic.open_float, desc = "Show line diagnostics" },
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

wk.add({
	{ "<leader>c", group = "Quickfix" },
	{ "<leader>co", ":copen<CR>", desc = "Open quickfix" },
	{ "<leader>cc", ":cclose<CR>", desc = "Close quickfix" },
	{ "<leader>ct", function() Snacks.picker.qflist() end, desc = "Show quickfix in picker" },
	{ "<leader>cn", ":cnext<CR>", desc = "Next quickfix" },
	{ "<leader>cp", ":cprevious<CR>", desc = "Previous quickfix" },
})
