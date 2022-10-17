local status_ok, telescope = pcall(require, "telescope")
if not status_ok then
  return
end


telescope.setup {
  defaults = {
    selection_caret = " ",
    path_display = { "smart" },
    file_ignore_patterns = { ".git/", "node_modules", "dist/", ".build/" },
    mappings = {},
  },
   extensions = {
    ["ui-select"] = {
      require("telescope.themes").get_dropdown {},
    },
  },
}

telescope.load_extension "ui-select"
