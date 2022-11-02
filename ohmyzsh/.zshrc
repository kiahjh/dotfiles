export ZSH="$HOME/.oh-my-zsh"
export GIT_EDITOR=nvim

# ZSH_THEME="robbyrussell"

ZSH_THEME="agnoster"
DEFAULT_USER="jared"

plugins=(git)

source $HOME/.zshenv
source $ZSH/oh-my-zsh.sh
source $ZSH/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh

bindkey -s ^f "tmux-sessionizer.sh\n"
bindkey -s ^t "git commit -am '"

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

FLROOT="/Users/jared/fl"
if [ -f ${FLROOT}/bash_aliases.sh ]; then
  source ${FLROOT}/bash_aliases.sh
fi

acommit() {
  git commit -am "$1"
}

mcommit() {
  git commit -m "$1"
}

new() {
  tmux new-window -n "$1"
}

uuid() {
  UUID=$(/usr/local/bin/uuid | perl -pe "s/\s//g");
  printf $UUID | pbcopy;
  printf "\n$UUID (copied to clipboard)\n\n";
}

# aliases
alias issue="gh issue create --repo gertrude-app/project"
alias vim="nvim"
alias vims="nvim -S Session.vim"
alias ssh="kitty +kitten ssh"
alias st='~/jaredh159/Swiftest/.build/debug/Swiftest'
alias m='make'
alias lnhelp='cat ~/.lnhelp'
alias taghelp='cat ~/.taghelp'
alias run='npm run "$@"'
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
alias review="github . ; make fix && make check"
