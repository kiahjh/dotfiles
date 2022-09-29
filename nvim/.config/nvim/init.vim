syntax on

set shortmess=a
set cmdheight=1
set number
set relativenumber
set scrolloff=12
set tabstop=2
set shiftwidth=2
set softtabstop=2
set expandtab
set autoindent
set smarttab

" Install vim-plug if not found
if empty(glob('~/.vim/autoload/plug.vim'))
  silent !curl -fLo ~/.vim/autoload/plug.vim --create-dirs
    \ https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
endif

" plugins
call plug#begin()
Plug 'junegunn/fzf', { 'do': { -> fzf#install() } }
Plug 'junegunn/fzf.vim'
Plug 'tomasiser/vim-code-dark'
Plug 'kyazdani42/nvim-web-devicons'
Plug 'neovim/nvim-lspconfig'
call plug#end()

set termguicolors
colorscheme codedark

lua << END

require'lspconfig'.tsserver.setup{}

local bufopts = { noremap=true, silent=true, buffer=bufnr }
vim.keymap.set('n', 'gh', vim.diagnostic.open_float, opts)

END

" for fzf preview highlighting
let $BAT_THEME='Visual Studio Dark+'

" swap ; and ;
nnoremap ; :
nnoremap : ;
vnoremap ; :
vnoremap : ;

" highlight on yank
au TextYankPost * silent! lua vim.highlight.on_yank {higroup="IncSearch", timeout=150}

let mapleader = " "
nnoremap <leader>rc :source ~/.config/nvim/init.vim<CR>
nnoremap <C-p> :GFiles<CR>
nnoremap <leader>pf :Files<CR>
