return {
	"sphamba/smear-cursor.nvim",
	opts = {
		-- Set cursor color explicitly (rose-pine text color)
		cursor_color = "#e0def4",

		-- Faster, snappier animation
		stiffness = 0.8,
		trailing_stiffness = 0.5,
		distance_stop_animating = 0.5,
		damping = 0.9,

		-- Particles
		particles_enabled = true,
		particles_per_second = 200,
		particles_per_length = 10,
		particle_max_lifetime = 500,
		particle_max_initial_velocity = 15,
		particle_spread = 0.8,

		-- Smear settings
		smear_between_buffers = true,
		smear_between_neighbor_lines = true,
		smear_insert_mode = true,
	},
}
