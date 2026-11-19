-- Colors come from the current theme in ~/.dotfiles/themes (lua/theme).
return {
  'rebelot/kanagawa.nvim',
  lazy = false,
  priority = 1000,
  config = function()
    require('theme').setup({ dim_inactive = true })
  end,
}
