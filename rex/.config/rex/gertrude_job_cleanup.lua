-- Run with rex do -s JOB; never scan or clean up other sessions by label.
local session_id = assert(rex.session_id, "a job session is required")
local label = assert(rex.args.label, "a job label is required")
local window_id = assert(rex.args.window, "a job window is required")
local block_id = assert(rex.args.block, "a job block is required")

local function cleanup()
  local view, view_error = rex.session.view{session_id = session_id}
  if view == nil then error(view_error, 0) end
  if view.label ~= label then rex.stop() end

  local listing, list_error = rex.session.list_blocks{session_id = session_id}
  if listing == nil then error(list_error, 0) end

  -- If the user repurposes the job, stop watching rather than close their work.
  for _, window in ipairs(view.windows or {}) do
    if window.window_id ~= window_id then rex.stop() end
  end
  for _, block in ipairs(listing.blocks or {}) do
    if block.block_id ~= block_id then rex.stop() end
  end
  if #(view.windows or {}) > 0 or #(listing.blocks or {}) > 0 then return end

  local result, destroy_error = rex.call("session.destroy", {session_id = session_id})
  if result == nil then error(destroy_error, 0) end
  rex.stop()
end

rex.on("session_view_changed", cleanup)
rex.on("session_label_changed", function(_, ev)
  if ev.label ~= label then rex.stop() end
  cleanup()
end)
rex.on("window_created", function(_, ev)
  if ev.window_id ~= window_id then rex.stop() end
  cleanup()
end)
rex.on("block_created", function(_, ev)
  if ev.block_id ~= block_id then rex.stop() end
  cleanup()
end)
-- The terminal may already have exited before this watcher attached.
cleanup()
