return {
  'vague2k/vague.nvim',
  priority = 1000,
  init = function()
    vim.cmd.colorscheme 'vague'
    vim.cmd.hi 'Comment gui=none'
  end,
}

