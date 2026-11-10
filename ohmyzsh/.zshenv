# for vim fzf preview highlighting
BAT_THEME='Visual Studio Dark+'
COLORTERM="truecolor"

export GIT_EDITOR=nvim
export EDITOR=nvim

# keep opencode from loading Claude desktop's skills in ~/.claude/skills
# (read by the opencode background service when it starts)
export OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1

# prevent homebrew from running all updates on every upgrade
export HOMEBREW_NO_AUTO_UPDATE=1

# keep on latest npm, no matter what node version is used
export N_PRESERVE_NPM=1

# pnpm
export PNPM_HOME="$HOME/Library/pnpm"

# clear out the path, start brand new
PATH=""

path+=$PNPM_HOME

# Keep the Rex CLI available when running inside Rex.
if [[ -n "$REX_BIN_DIR" ]]; then
  path+=("$REX_BIN_DIR")
fi

# path+=/opt/homebrew/opt/openjdk@11/bin # java 11, react native (old: 1.8)
# path+=~/.rbenv/shims # ruby version manager, for react native
# export PATH="$HOME/.jenv/bin:$PATH"

path+=~/.nvim-0.11.1/bin
path+=~/.local/scripts
path+=~/.local/bin
path+=~/.opencode/bin
# Homebrew before the system folders, matching interactive shells (brew shellenv)
path+=/opt/homebrew/bin
path+=/opt/homebrew/sbin
path+=/usr/local/bin
path+=/usr/local/bin/zig
path+=/usr/local/sbin
path+=/usr/bin
path+=/usr/sbin
path+=/bin
path+=/sbin
path+=~/.npm-global/bin
path+=~/.deno/bin
path+=~/.spicetify
path+=~/.swiftly/bin
path+=/usr/local/go/bin
path+=~/go/bin
path+=~/.bun/bin
path+=~/.maestro/bin


export PATH
. "$HOME/.cargo/env"

# Agent shells only: agents write bash-style commands, so don't fail on
# unmatched globs (`ls *.png`) or expand a leading `=` (`echo =====`).
if [[ -n $OPENCODE_SESSION_ID ]]; then
  setopt no_nomatch no_equals
fi
