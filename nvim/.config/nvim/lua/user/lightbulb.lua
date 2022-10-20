require("nvim-lightbulb").setup({
	autocmd = {
		enabled = true,
	},
	sign = {
		enabled = false,
	},
	virtual_text = {
		enabled = true,
		text = "",
		style = "bold",
		hl_mode = "replace",
	},
})

-- color of lightbulb virtual text
vim.api.nvim_command("highlight LightBulbVirtualText ctermfg=DarkYellow ctermbg=NONE guifg=DarkYellow guibg=NONE")
