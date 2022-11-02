# for vim fzf preview highlighting
BAT_THEME='Visual Studio Dark+'
COLORTERM="truecolor"

# keep on latest npm, no matter what node version is used
export N_PRESERVE_NPM=1

# flp stuff
export PUPPETEER_PRODUCT=firefox

# pnpm
export PNPM_HOME="/Users/jared/Library/pnpm"

# clear out the path, start brand new
PATH=""

path+=$PNPM_HOME
path+=~/.local/scripts
path+=/usr/local/bin
path+=/usr/local/sbin
path+=/usr/bin
path+=/usr/sbin
path+=/bin
path+=/sbin
path+=~/.nvim8/nvim-macos/bin # temp, while testing nvim 0.8.0
path+=/opt/homebrew/bin
path+=/opt/homebrew/opt/postgresql@12/bin
path+=~/.npm-global/bin
path+=/Applications/kitty.app/Contents/MacOS

export PATH

