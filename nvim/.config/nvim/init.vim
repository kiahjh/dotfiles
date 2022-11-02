lua require("user.plugins")

syntax on

" no color till i figure out how to prevent it in toggleterm
let g:better_whitespace_ctermcolor='None'
let g:better_whitespace_guicolor='None'

lua require("user.nvimtree")
lua require('user.keymaps')
lua require("user.colorscheme")
lua require("user.treesitter")
lua require("user.gitsigns")
lua require("user.lualine")
lua require("user.telescope")
lua require("user.lightbulb")
lua require("user.toggleterm")
lua require("user.autopairs")
lua require("user.null-ls")
lua require("user.cmp")
lua require("user.lsp")

" todo: switch whole file to lua
" options should go after plugins, to prevent plugins from setting stuff
lua require('user.options')

augroup filetype
  au! BufRead,BufNewFile *.swift exec "set filetype=swift shiftwidth=2 tabstop=2"
augroup END

" cause enter in quickfix to also close quickfix
:autocmd FileType qf nnoremap <buffer> <CR> <CR>:cclose<CR>

" this disables getting newlines starting with comment leader
autocmd BufNewFile,BufRead * setlocal formatoptions-=cro

" strip whitespace on save
autocmd BufWritePre *.* StripWhitespace

" make swift comment out with `//`
autocmd FileType swift setlocal commentstring=//\ %s

" auto save whenever focus is lost
autocmd FocusLost * silent! wa

" swap ; and ;
nnoremap ; :
nnoremap : ;
vnoremap ; :
vnoremap : ;

" highlight on yank
au TextYankPost * silent! lua vim.highlight.on_yank {higroup="IncSearch"}

let mapleader = " "
nnoremap <leader>rc :source ~/.config/nvim/init.vim<CR>
nnoremap <C-p> :Telescope git_files<CR>
nnoremap <leader>pf :Telescope find_files find_command=rg,--hidden,--files<CR>
nnoremap <leader>f :Telescope live_grep<CR>
nnoremap <Leader>b :lua require'telescope.builtin'.buffers(require('telescope.themes').get_dropdown({preview_title = 'Preview'}))<CR>

" copy to system clipboard
vnoremap  <leader>y "+y
xnoremap  <leader>y "+y
nnoremap  <leader>Y "+yg_
nnoremap  <leader>y "+y

" paste from system clipboard
nnoremap <leader>p "+p
nnoremap <leader>P "+P
vnoremap <leader>p "+p
vnoremap <leader>P "+P

" clear the highlighted search
nnoremap <leader>h :noh<CR>

" close a buffer without killing window split
nnoremap <leader>dd :b# <bar> bd# <CR>

" save, then delete all non-visible buffers
nnoremap <silent> <C-q> :silent! wa! <bar> :Bdelete hidden<CR>

" git add
nnoremap <silent> <leader>gaa :silent! !git add .<CR> <bar> :echo "git added ."<CR>
nnoremap <silent> <leader>gaf :silent! !git add %<CR> <bar> :echo "git added current file"<CR>

" move lines up and down
vnoremap K :move '<-2<CR>gv=gv
vnoremap J :move '>+1<CR>gv=gv

nnoremap <C-\> :vsplit<CR>

" C-j open terminal
nnoremap <C-j> :silent !tmux split-window -p 33<CR>

" gold
nnoremap <C-f> :silent !tmux neww tmux-sessionizer.sh<CR>

" nvim-tree
nnoremap <C-b> :NvimTreeToggle<CR>
nnoremap <leader>sf :NvimTreeFindFile<CR>

" start a session
nnoremap <leader>ss :Obsess<CR>

" -- write all writable buffers, ignoring unnamed and non-writable
nnoremap <silent> <leader>wa :silent! wa!<CR> <bar> :echo "Wrote all writable buffers"<CR>

" -- start a local Rename
nnoremap <silent> <leader>rr @r

" -- show code actions
nnoremap <leader>aa :lua vim.lsp.buf.code_action()<CR>

" -- add className prop
nnoremap <silent> <leader>cc @b

" -- restart lsp
nnoremap <leader>ll :LspRestart<CR>

" -- xcode run/stox
nnoremap <leader>33 :silent !xcode-build<CR>
nnoremap <leader>88 :silent !xcode-stop<CR>

" folding
set foldmethod=indent
set foldlevelstart=99
set foldnestmax=19

" macros
" fdo
" @d - turn backtick prop to <d>ouble quotes
let @d="f{xr\"f`xr\"j^"
" @c wrap classnames prop in cx
let @c="f\"s{cx(`f\"s`, className)}"
" @c start a local rename
let @r="*Nciw"
" @b add className prop
let @b="ea className=\"\"i"
