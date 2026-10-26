return {
  'kiahjh/kiahgawa',
  lazy = false,
  priority = 1000,
  dependencies = { 'rebelot/kanagawa.nvim' },
  config = function()
    require('kiahgawa').setup({ dim_inactive = true })
    vim.cmd.colorscheme 'kiahgawa'
  end,
}
