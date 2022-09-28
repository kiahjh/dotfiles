syntax on

set guicursor= " thick cursor in insert mode

set shortmess=a
set cmdheight=2
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
call plug#end()

set termguicolors
colorscheme codedark

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
