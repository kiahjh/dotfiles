-- require "completion"

-- vim.cmd "Copilot disable"

-- typescript
-- @see https://github.com/typescript-language-server/typescript-language-server/issues/216
local function filter(arr, predicate)
  if type(arr) ~= "table" then
    return arr
  end

  local filtered = {}
  for k, v in pairs(arr) do
    if predicate(v, k, arr) then
      table.insert(filtered, v)
    end
  end

  return filtered
end

local function filterReactDTS(value)
  return string.match(value.targetUri, '%.d.ts') == nil
end

-- require'lspconfig'.tsserver.setup{
--   handlers = {
--     ['textDocument/definition'] = function(err, result, method, ...)
--       if vim.tbl_islist(result) and #result > 1 then
--         local filtered_result = filter(result, filterReactDTS)
--         return vim.lsp.handlers['textDocument/definition'](err, filtered_result, method, ...)
--       end

      -- vim.lsp.handlers['textDocument/definition'](err, result, method, ...)
    -- end
  -- }
-- }

-- -- swift
-- require'lspconfig'.sourcekit.setup{}

