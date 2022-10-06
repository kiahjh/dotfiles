lua require("jared.plugins")

syntax on

let g:better_whitespace_ctermcolor='DarkRed'
let g:better_whitespace_guicolor='DarkRed'


" give room to breathe at bottom of screen
let g:scrollfix=70

lua require('jared.keymaps')
lua require("jared.colorscheme")

" LSP config
nnoremap <silent> <leader>e <cmd>lua vim.diagnostic.open_float()<CR>
nnoremap <silent> gd <cmd>lua vim.lsp.buf.definition()<CR>
nnoremap <silent> gD <cmd>lua vim.lsp.buf.declaration()<CR>
nnoremap <silent> gr <cmd>lua vim.lsp.buf.references()<CR>
nnoremap <silent> gi <cmd>lua vim.lsp.buf.implementation()<CR>
nnoremap <silent> gh <cmd>lua vim.lsp.buf.hover()<CR>
nnoremap <silent> <C-k> <cmd>lua vim.lsp.buf.signature_help()<CR>
" nnoremap <silent> <C-n> <cmd>lua vim.diagnostic.goto_prev()<CR>
" nnoremap <silent> <C-p> <cmd>lua vim.diagnostic.goto_next()<CR>

" TODO: switch whole file to lua
" options should go after plugins, to prevent plugins from setting stuff
lua require('jared.options')

augroup filetype
  au! BufRead,BufNewFile *.swift exec "set filetype=swift shiftwidth=2 tabstop=2"
augroup END

" cause enter in quickfix to also close quickfix
:autocmd FileType qf nnoremap <buffer> <CR> <CR>:cclose<CR>

" prettier
autocmd BufWritePre *.js,*.jsx,*.mjs,*.ts,*.tsx,*.css,*.json,*.graphql,*.yaml,*.yml,*.html,*.md Prettier

" swift format on save
autocmd BufWritePost *.swift silent! exec "silent! !swiftformat --quiet %" | redraw

" strip whitespace on save
autocmd BufWritePre *.* StripWhitespace

lua require('init')

" make swift comment out with `//`
autocmd FileType swift setlocal commentstring=//\ %s

" for fzf preview highlighting
let $BAT_THEME='Visual Studio Dark+'

inoremap <silent><expr> <CR> compe#confirm('<CR>')

" swap ; and ;
nnoremap ; :
nnoremap : ;
vnoremap ; :
vnoremap : ;

" highlight on yank
au TextYankPost * silent! lua vim.highlight.on_yank {higroup="IncSearch"}

let mapleader = " "
nnoremap <leader>rc :source ~/.config/nvim/init.vim<CR>
nnoremap <C-p> :GFiles<CR>
nnoremap <leader>pf :Files<CR>
nnoremap <leader>f :Rg<CR>

" clear the highlighted search
nnoremap <leader>c :noh<CR>

nnoremap <leader>ww :q<CR>

" move lines up and down
vnoremap K :move '<-2<CR>gv=gv
vnoremap J :move '>+1<CR>gv=gv

nnoremap <C-\> :vsplit<CR>

" C-j open terminal
nnoremap <C-j> :silent !tmux split-window -p 33<CR>

" gold
nnoremap <C-f> :silent !tmux neww tmux-sessionizer.sh<CR>

" nerdtree
let g:NERDTreeIgnore = ['\.git$', 'node_modules', 'dist', '.build', '\.DS_Store']
let NERDTreeShowHidden=1
let NERDTreeWinSize=36
nnoremap <C-b> :NERDTreeToggle<CR>

" <s>how <f>ile
nnoremap <leader>sf :NERDTreeFind<CR>

" start a session
nnoremap <leader>ss :Obsess<CR>

" macros

" @d - turn backtick prop to <d>ouble quotes
let @d="f{xr\"f`xr\"j^"
" @i - explicit returns to <i>implicit
let @i="^/returndaw?{x/(%jdd"
