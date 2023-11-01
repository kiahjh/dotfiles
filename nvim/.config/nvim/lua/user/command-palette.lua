local themes = require("telescope.themes")
local pickers = require("telescope.pickers")
local finders = require("telescope.finders")
local conf = require("telescope.config").values
local actions = require("telescope.actions")
local action_state = require("telescope.actions.state")

local commands = {
	{ "git blame line                                                   <leader>b", ":Gitsigns blame_line" },
	{ "git diff hunk                                                    <leader>d", ":Gitsigns preview_hunk" },
	{ "show file in explorer                                            <leader>s", ":NvimTreeFindFile" },
	{ "close buffer                                                         <C-x>", ":Bdelete" },
	{ "close all other buffers                                      <leader><C-x>", ":BufferLineCloseOthers" },
	{ "vertical split                                                           |", ":vsplit" },
	{ 'horizontal split                                                         "', ":split" },
	{ "show terminal                                                        <C-t>", ":ToggleTerm" },
	{ "remove highlights                                                       ff", ":noh" },
	{
		"jump to next diagnostic                                              <C-e>",
		":lua vim.diagnostic.goto_next()",
	},
	{ "global search                                                        <C-f>", ":Telescope live_grep" },
	{
		"open file                                                        <leader>f",
		":lua require'telescope.builtin'.find_files(require('telescope.themes').get_dropdown({ previewer = false }))",
	},
	{ "rename variable                                                  <leader>r", ":lua vim.lsp.buf.rename()" },
	{ "collapse NvimTree                                                <leader>c", ":NvimTreeCollapse" },
	{ "copy current file path", ':let @+ = expand("%:p")' },
}

--------------------------------

local command_palette = function(opts)
	opts = opts or {}
	pickers
		.new(opts, {
			prompt_title = "Command Palette",
			finder = finders.new_table({
				results = commands,
				entry_maker = function(entry)
					return {
						value = entry,
						display = entry[1],
						ordinal = entry[1],
					}
				end,
			}),
			sorter = conf.generic_sorter(opts),
			attach_mappings = function(prompt_bufnr)
				actions.select_default:replace(function()
					actions.close(prompt_bufnr)
					local selection = action_state.get_selected_entry()
					-- print(vim.inspect(selection))
					vim.api.nvim_exec(selection.value[2], true)
				end)
				return true
			end,
		})
		:find()
end

vim.api.nvim_create_user_command("CommandPalette", function()
	command_palette(themes.get_dropdown({}))
end, { nargs = 0 })
