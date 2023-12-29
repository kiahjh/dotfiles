local wezterm = require("wezterm")

local assets = wezterm.config_dir .. "/assets"

local config = {
	macos_window_background_blur = 30,
	enable_tab_bar = false,
	window_decorations = "RESIZE",
	font = wezterm.font("Operator Mono Medium"),
	font_size = 15,
	adjust_window_size_when_changing_font_size = false,
	native_macos_fullscreen_mode = true,
	keys = {
		{
			key = "n",
			mods = "SHIFT|CTRL",
			action = wezterm.action.ToggleFullScreen,
		},
	},
	window_padding = {
		left = 0,
		right = 0,
		top = 0,
		bottom = 0,
	},
	send_composed_key_when_left_alt_is_pressed = true,
	send_composed_key_when_right_alt_is_pressed = false,
	color_scheme = "tokyonight-night",
	window_background_opacity = 0.70,
}

return config
