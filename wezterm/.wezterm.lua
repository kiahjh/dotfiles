local wezterm = require("wezterm")

local assets = wezterm.config_dir .. "/assets"

local config = {
	-- window_background_opacity = 0.15,
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
	background = {
		{
			source = {
				Gradient = {
					orientation = { Linear = { angle = -45.0 } },
					colors = {
						"#000000",
						"#000000",
						"#0d1b46",
						"#000000",
						"#0d1b46",
						"#000000",
					},
					interpolation = "Basis",
					blend = "LinearRgb",
					noise = 10,
				},
			},
			width = "100%",
			height = "100%",
			opacity = 0.95,
		},
		{
			source = {
				File = { path = assets .. "/blue_blob.gif", speed = 0.3 },
			},
			repeat_x = "Mirror",
			-- width = "100%",
			height = "100%",
			opacity = 0.05,
			hsb = {
				hue = 0.9,
				saturation = 0.9,
				brightness = 0.8,
			},
		},
	},
}

return config
