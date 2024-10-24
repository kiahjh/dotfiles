# for vim fzf preview highlighting
BAT_THEME='Visual Studio Dark+'
COLORTERM="truecolor"

export GIT_EDITOR=nvim
export EDITOR=nvim

# prevent homebrew from running all updates on every upgrade
export HOMEBREW_NO_AUTO_UPDATE=1

# supress warnings about errors in swift 6 (probably want to remove this when swift 6 is out)
export SWIFT_STRICT_CONCURRENCY=minimal

# keep on latest npm, no matter what node version is used
export N_PRESERVE_NPM=1

# flp stuff
export PUPPETEER_PRODUCT=firefox

# pnpm
export PNPM_HOME="$HOME/Library/pnpm"

# android (react-native)
export ANDROID_HOME=$HOME/Library/Android/sdk

# clear out the path, start brand new
PATH=""

path+=$PNPM_HOME

# path+=/opt/homebrew/opt/openjdk@11/bin # java 11, react native (old: 1.8)
# path+=~/.rbenv/shims # ruby version manager, for react native
# export PATH="$HOME/.jenv/bin:$PATH"

path+=~/.nvim-0.10.2/bin
path+=/opt/homebrew/opt/node@18/bin
path+=~/.local/scripts
path+=~/.local/bin
path+=/usr/local/bin
path+=/usr/local/sbin
path+=/usr/bin
path+=/usr/sbin
path+=/bin
path+=/sbin
path+=/opt/homebrew/bin
path+=/opt/homebrew/sbin
path+=/opt/homebrew/opt/postgresql@12/bin
path+=~/.npm-global/bin
path+=/Applications/kitty.app/Contents/MacOS
path+=$ANDROID_HOME/emulator
path+=$ANDROID_HOME/platform-tools
path+=~/.local/kotlinc/bin
path+=~/.local/kotlin-native-macos-aarch64-1.9.20/bin
path+=~/.deno/bin
path+=~/.opam/latest/bin


export PATH
. "$HOME/.cargo/env"
