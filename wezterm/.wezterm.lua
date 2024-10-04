local wezterm = require("wezterm")

local config = {
	colors = {
		background = "#11101a",
	},
	enable_tab_bar = false,
	window_decorations = "RESIZE",
	font = wezterm.font("Operator Mono Medium"),
	font_size = 15,
	adjust_window_size_when_changing_font_size = false,
	native_macos_fullscreen_mode = true,
	window_padding = {
		left = 0,
		right = 0,
		top = 0,
		bottom = 0,
	},
	send_composed_key_when_left_alt_is_pressed = true,
	send_composed_key_when_right_alt_is_pressed = true,
}

return config
