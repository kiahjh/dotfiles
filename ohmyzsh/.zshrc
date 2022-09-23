export ZSH="$HOME/.oh-my-zsh"
export GIT_EDITOR=vim

ZSH_THEME="robbyrussell"

plugins=(git)

source $ZSH/oh-my-zsh.sh
source $ZSH/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh

bindkey -s ^f "tmux-sessionizer.sh\n"
bindkey -s ^k "clear\n"
bindkey -s ^t "git commit -am '"

# when you transfer to headless mini, start with pulling latest cli changes + npm install + run compile, etc...
alias flpub='fell clone && fell branch && fell status && fell sync && fl publish --slack'

FLROOT="/Users/jared/fl"
if [ -f ${FLROOT}/bash_aliases.sh ]; then
  source ${FLROOT}/bash_aliases.sh
fi


# aliases
alias vim="nvim"
alias st='~/jaredh159/Swiftest/.build/debug/Swiftest'
alias m='make'
alias lnhelp='cat ~/.lnhelp'
alias taghelp='cat ~/.taghelp'
alias run='npm run "$@"'
alias diffall="git difftool HEAD"
alias diff="git diff -- . ':(exclude)package-lock.json' ':(exclude)ios/FriendsLibrary.xcodeproj/project.pbxproj'"
alias stignore="echo .DS_Store >> .gitignore && echo \"*.swp\" >> .gitignore && echo node_modules/ >> .gitignore && echo .env >> .gitignore"
alias s="git status"
alias l="git l"
alias cowpath="echo $PATH | perl -pe 's/:/\n/g' | cowsay"
alias back="cd -"
alias ndate="node -e \"process.stdout.write(new Date().toISOString())\" | pbcopy"
alias grep="rg"
alias review="make fix && make check && github ."


