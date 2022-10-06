# for vim fzf preview highlighting
BAT_THEME='Visual Studio Dark+'
COLORTERM="truecolor"

# keep on latest npm, no matter what node version is used
export N_PRESERVE_NPM=1

# fl stuff
export PUPPETEER_PRODUCT=firefox

# make italics work in tmux
# @see https://gist.github.com/gutoyr/4192af1aced7a1b555df06bd3781a722
export TERM=screen-256color

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

