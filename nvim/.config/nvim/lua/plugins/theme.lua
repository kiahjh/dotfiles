return {
  'rose-pine/neovim',
  name = 'rose-pine',
  priority = 1000,
  config = function()
    require('rose-pine').setup({
      variant = 'auto', -- auto, main, moon, or dawn
      dark_variant = 'main',
      dim_inactive_windows = true,
      extend_background_behind_borders = true,

      styles = {
        bold = true,
        italic = true,
        transparency = false,
      },

      highlight_groups = {
        -- Softer cursorline
        CursorLine = { bg = 'highlight_low' },
        CursorLineNr = { fg = 'gold', bold = true },

        -- Beautiful floating windows
        NormalFloat = { bg = 'surface' },
        FloatBorder = { fg = 'subtle', bg = 'surface' },
        FloatTitle = { fg = 'love', bg = 'surface', bold = true },

        -- Telescope/Picker styling
        TelescopeBorder = { fg = 'highlight_high', bg = 'none' },
        TelescopeNormal = { bg = 'none' },
        TelescopePromptNormal = { bg = 'base' },
        TelescopeResultsNormal = { fg = 'subtle', bg = 'none' },
        TelescopeSelection = { fg = 'text', bg = 'highlight_med' },
        TelescopeSelectionCaret = { fg = 'rose', bg = 'highlight_med' },

        -- Statusline polish
        StatusLine = { fg = 'text', bg = 'surface' },
        StatusLineNC = { fg = 'muted', bg = 'base' },

        -- Better visual selection (very bright purple/iris accent)
        Visual = { bg = '#5e5891' },
        VisualNOS = { bg = '#5e5891' },

        -- Pmenu (completion menu)
        Pmenu = { fg = 'text', bg = 'surface' },
        PmenuSel = { fg = 'text', bg = 'highlight_med', bold = true },
        PmenuThumb = { bg = 'highlight_high' },

        -- Git signs
        GitSignsAdd = { fg = 'foam' },
        GitSignsChange = { fg = 'rose' },
        GitSignsDelete = { fg = 'love' },

        -- Indent lines (subtle, not rainbow)
        IblIndent = { fg = 'highlight_med' },
        IblScope = { fg = 'subtle' },

        -- Which-key
        WhichKeyFloat = { bg = 'surface' },
        WhichKeyBorder = { fg = 'highlight_high', bg = 'surface' },

        -- Neo-tree
        NeoTreeNormal = { bg = 'base' },
        NeoTreeNormalNC = { bg = 'base' },
        NeoTreeFloatBorder = { fg = 'highlight_high' },
        NeoTreeTitleBar = { fg = 'base', bg = 'foam', bold = true },

        -- Barbar tabs
        BufferCurrent = { fg = 'text', bg = 'surface', bold = true },
        BufferCurrentIndex = { fg = 'iris', bg = 'surface' },
        BufferCurrentMod = { fg = 'gold', bg = 'surface' },
        BufferCurrentSign = { fg = 'iris', bg = 'surface' },
        BufferInactive = { fg = 'muted', bg = 'base' },
        BufferVisible = { fg = 'subtle', bg = 'base' },

        -- Noice cmdline
        NoiceCmdlinePopup = { bg = 'surface' },
        NoiceCmdlinePopupBorder = { fg = 'iris' },
        NoiceCmdlineIcon = { fg = 'iris' },
      },
    })
    vim.cmd.colorscheme 'rose-pine'
  end,
}

