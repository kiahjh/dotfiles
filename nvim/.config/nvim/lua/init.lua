require "completion"

-- typescript
require'lspconfig'.tsserver.setup{}

-- swift
require'lspconfig'.sourcekit.setup{}


-- make diagnostic info not cause jump  
vim.o.signcolumn="yes"

