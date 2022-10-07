# for vim fzf preview highlighting
BAT_THEME='Visual Studio Dark+'
COLORTERM="truecolor"

# keep on latest npm, no matter what node version is used
export N_PRESERVE_NPM=1

# fl stuff
export PUPPETEER_PRODUCT=firefox

# clear out the path, start brand new
PATH=""

path+=~/.local/scripts
path+=/usr/local/bin
path+=/usr/local/sbin
path+=/usr/bin
path+=/usr/sbin
path+=/bin
path+=/sbin
path+=/opt/homebrew/bin
path+=/opt/homebrew/opt/postgresql@12/bin
path+=~/.npm-global/bin
path+=/Applications/kitty.app/Contents/MacOS
export PATH

