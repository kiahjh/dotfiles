local colors = require("colors")

-- Equivalent to the --bar domain
sbar.bar({
	height = 40,
	color = colors.bar.bg,
	position = "bottom",
	corner_radius = 10,
	margin = 12,
	y_offset = 6,
	border_color = colors.bar.border,
	border_width = 1,
	shadow = true,
	sticky = true,
	padding_right = 10,
	padding_left = 10,
	blur_radius = 30,
	topmost = "window",
})
