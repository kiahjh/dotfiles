export ZSH="$HOME/.oh-my-zsh"


# ZSH_THEME="agnoster"
ZSH_THEME="robbyrussell"
DEFAULT_USER="miciah"

plugins=(git)

source $HOME/.zshenv
source $ZSH/oh-my-zsh.sh
source $ZSH/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
source $HOME/.cargo/env # rust

# enable completions for `just`
eval "$(brew shellenv)"
fpath=($HOMEBREW_PREFIX/share/zsh/site-functions $fpath)

bindkey -s ^f "zellij-sessionizer.sh\n"

# fixes kitty + tmux for some reason...
unset MANPATH

# usage: `release 1.2.1`
release() {
  git tag v$1
  git push origin master
  git push origin tag v$1
  gh release create v$1 --title v$1 --notes ""
}


# when you transfer to headless mini, start with pulling latest cli changes + npm install + run compile, etc...
alias flpub='fell clone && fell branch && fell status && fell sync && fl publish --slack'

acommit() {
  git commit -am "$1"
}

mcommit() {
  git commit -m "$1"
}

new() {
  tmux new-window -n "$1"
}

vims() {
  if [ -f Session.vim ]; then
    nvim -S Session.vim
  else
    nvim .
  fi
}

uuid() {
  UUID=$(/usr/local/bin/uuid | perl -pe "s/\s//g");
  printf $UUID | pbcopy;
  printf "\n$UUID (copied to clipboard)\n\n";
}

# flp aliases
alias fl="/Users/jared/mfl/node_modules/.bin/ts-node \
  --project /Users/jared/mfl/apps/cli/tsconfig.json \
  /Users/jared/mfl/apps/cli/src/app.ts ${@}"
alias fell="/Users/jared/mfl/node_modules/.bin/ts-node \
  --project /Users/jared/mfl/apps/fell/tsconfig.json \
  /Users/jared/mfl/apps/fell/src/app.ts ${@}"
  #
# misc aliases
alias issue="gh issue create --repo gertrude-app/project"
alias vim="nvim"
alias vi="/usr/bin/vim"
alias n="nvim"
alias ksh="kitty +kitten ssh"
alias diffall="git difftool HEAD"
alias diff="git diff -- . ':(exclude)package-lock.json' ':(exclude)ios/FriendsLibrary.xcodeproj/project.pbxproj'"
alias giff="git add . ; github ."
alias stignore="echo .DS_Store >> .gitignore && echo \"*.swp\" >> .gitignore && echo node_modules/ >> .gitignore && echo .env >> .gitignore"
alias s="git s"
alias l="git l"
alias cowpath="echo $PATH | perl -pe 's/:/\n/g' | cowsay"
alias back="cd -"
alias ndate="node -e \"process.stdout.write(new Date().toISOString())\" | pbcopy"
alias grep="rg"
alias kn="kotlinc-native"
alias xbs="xcode-build-server config -scheme ${PWD##*/} -project *.xcodeproj"
alias run="npm run"
alias zlj="zellij"
alias zj="zellij -l welcome"
alias tlox="~/learning/lox/typescript/tlox"
alias src="source ~/.zshrc && source ~/.zshenv && echo 'sourced .zshrc and .zshenv'"
alias oc="opencode"

# bun completions
[ -s "/Users/miciah/.bun/_bun" ] && source "/Users/miciah/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# pnpm
export PNPM_HOME="/Users/miciah/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end

# Add RVM to PATH for scripting. Make sure this is the last PATH variable change.
export PATH="$PATH:$HOME/.rvm/bin"
. "/Users/miciah/.deno/env"


# BEGIN opam configuration
# This is useful if you're using opam as it adds:
#   - the correct directories to the PATH
#   - auto-completion for the opam binary
# This section can be safely removed at any time if needed.
[[ ! -r '/Users/miciah/.opam/opam-init/init.zsh' ]] || source '/Users/miciah/.opam/opam-init/init.zsh' > /dev/null 2> /dev/null
# END opam configuration

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

export PATH=$PATH:/Users/miciah/.spicetify

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# opencode
export PATH=/Users/miciah/.opencode/bin:$PATH

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
