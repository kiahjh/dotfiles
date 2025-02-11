require("kiahjh.core.keymaps")
require("kiahjh.core.options")

vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
	pattern = { "*.fen" },
	callback = function()
		vim.opt.filetype = "fen"
	end,
})
