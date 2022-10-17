-- ignore case in search patterns
vim.opt.ignorecase = true
-- don't ignore case when search contains capital letters
vim.opt.smartcase = true

-- shortmess allows you to eliminate many messages vim gives
vim.opt.shortmess = "a"
vim.opt.shortmess:append "c"

vim.opt.cmdheight = 1

vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.numberwidth = 4

-- make room for diagnostics, prevent jump when they appear
vim.opt.signcolumn = "yes"

vim.opt.scrolloff = 12
vim.opt.sidescrolloff = 8

vim.opt.tabstop = 2
vim.opt.shiftwidth = 2
vim.opt.softtabstop = 2
vim.opt.expandtab = true
vim.opt.autoindent = true
vim.opt.smarttab = true
vim.opt.termguicolors = true
vim.opt.swapfile = false

-- search/replace `/g` by default
vim.opt.gdefault = true

vim.opt.fileencoding = "utf-8"
vim.opt.hlsearch = true

-- allow the mouse to be used in neovim
vim.opt.mouse = "a"

-- force all horiz/vert splits to go below/right of current window
vim.opt.splitbelow = true
vim.opt.splitright = true

vim.opt.cursorline = true

-- faster completion (4000ms default)
vim.opt.updatetime = 300

-- copilot
vim.g.copilot_no_tab_map = true
vim.g.copilot_assume_mapped = true
vim.g.copilot_node_command = "/usr/local/n/versions/node/16.17.1/bin/node"
vim.g.copilot_filetypes = { ['TelescopePrompt'] = false }

-- vim.opt.backup = false                          -- creates a backup file
-- vim.opt.clipboard = "unnamedplus"               -- allows neovim to access the system clipboard
-- vim.opt.completeopt = { "menuone" "noselect" }, -- mostly just for cmp
-- vim.opt.conceallevel = 0                        -- so that `` is visible in markdown files
-- vim.opt.pumheight = 10                          -- pop up menu height
-- vim.opt.showmode = false                        -- we don't need to see things like -- INSERT -- anymore
-- vim.opt.showtabline = 2                         -- always show tabs
--
--
-- vim.opt.timeoutlen = 100                        -- time to wait for a mapped sequence to complete (in milliseconds)
-- vim.opt.undofile = true                         -- enable persistent undo
-- vim.opt.updatetime = 300                        -- faster completion (4000ms default)
-- vim.opt.writebackup = false                     -- if a file is being edited by another program (or was written to file while editing with another program), it is not allowed to be edited
-- vim.opt.wrap = false                            -- display lines as one long line
-- vim.opt.guifont = "monospace:h17"               -- the font used in graphical neovim applications


-- vim.cmd "set whichwrap+=<,>,[,],h,l"

