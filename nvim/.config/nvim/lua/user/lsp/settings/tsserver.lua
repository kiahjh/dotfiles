return {
	init_options = {
		-- disable ts suggestions, especially "convert to es module"
		-- see https://stackoverflow.com/a/70294761/208770
		-- long-term, would be great to filter diagnostics by code
		-- as was done in this archived plugin:
		-- https://githubcom/jose-elias-alvarez/nvim-lsp-ts-utils
		preferences = { disableSuggestions = true },
	},
}
