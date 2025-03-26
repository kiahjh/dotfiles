return {
  'sainnhe/everforest',
  priority = 1000,
  init = function()
    vim.cmd([[let g:everforest_background = 'hard']])
    vim.cmd.colorscheme 'everforest'
  end,
}

