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
set termguicolors
set splitbelow

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
Plug 'hrsh7th/nvim-compe'
Plug 'prettier/vim-prettier'
Plug 'keith/swift'
Plug 'github/copilot.vim'
Plug 'tpope/vim-commentary'
Plug 'vim-scripts/scrollfix'
Plug 'preservim/nerdtree'
Plug 'ntpeters/vim-better-whitespace'
call plug#end()

colorscheme codedark

" give room to breathe at bottom of screen
let g:scrollfix=80

" LSP config
nnoremap <silent> gd <cmd>lua vim.lsp.buf.definition()<CR>
nnoremap <silent> gD <cmd>lua vim.lsp.buf.declaration()<CR>
nnoremap <silent> gr <cmd>lua vim.lsp.buf.references()<CR>
nnoremap <silent> gi <cmd>lua vim.lsp.buf.implementation()<CR>
nnoremap <silent> gh <cmd>lua vim.lsp.buf.hover()<CR>
nnoremap <silent> <C-k> <cmd>lua vim.lsp.buf.signature_help()<CR>
nnoremap <silent> <C-n> <cmd>lua vim.lsp.diagnostic.goto_prev()<CR>
nnoremap <silent> <C-p> <cmd>lua vim.lsp.diagnostic.goto_next()<CR>

augroup filetype
  au! BufRead,BufNewFile *.swift set ft=swift
augroup END

" prettier
autocmd BufWritePre,InsertLeave *.js,*.jsx,*.mjs,*.ts,*.tsx,*.css,*.less,*.scss,*.json,*.graphql,*.md,*.vue,*.svelte,*.yaml,*.html Prettier

" strip whitespace on save
autocmd BufWritePre *.* StripWhitespace

lua require('init')

" make swift comment out with `//`
autocmd FileType swift setlocal commentstring=//\ %s

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

" clear the highlighted search
nnoremap <leader>c :noh<CR>

nnoremap <leader>ww :q<CR>

" move lines up and down
vnoremap J :move '>+1<CR>gv=gv
vnoremap K :move '<-2<CR>gv=gv

" leave terminal mode with escape
tnoremap <Esc> <C-\><C-n>
nnoremap <leader>tt :20 split term://zsh<CR>
autocmd TermOpen * startinsert
autocmd TermOpen * setlocal nonumber norelativenumber

" C-j open terminal
nnoremap <C-j> :silent !tmux split-window -p 33<CR>

" gold
nnoremap <C-f> :silent !tmux neww tmux-sessionizer.sh<CR>

" nerdtree
let g:NERDTreeIgnore = ['\.git$', 'node_modules', 'dist', '.build', '\.DS_Store']
let NERDTreeShowHidden=1
nnoremap <C-b> :NERDTreeToggle<CR>
