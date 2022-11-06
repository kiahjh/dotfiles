local themes = require("telescope.themes")
local pickers = require("telescope.pickers")
local finders = require("telescope.finders")
local conf = require("telescope.config").values
local actions = require("telescope.actions")
local action_state = require("telescope.actions.state")

local commands = {
	{ "git blame line", ":Gitsigns blame_line" },
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
