#!/bin/bash
# 將 ~/.claude/projects/<slug>/memory 指去呢個 folder 嘅 memory/。
#
# 點解要呢個 script：
#   Claude Code 嘅記憶檔寫喺 ~/.claude/projects/<slug>/memory/，唔喺
#   project folder。淨係抄一份入 folder 嘅話，之後 Claude 寫落去嘅新記憶
#   全部落喺 ~/.claude，folder 入面嗰份即刻變舊 —— 「換機淨係搬一個
#   folder」就唔成立。
#   symlink 過去之後，Claude 寫落去直接落喺呢個 folder 入面。
#
# 用法（換機／folder 搬過位之後行一次）：
#   ./scripts/link-memory.sh
#
# 安全：如果原本嗰個係真目錄，唔會刪，會改名做 memory.pre-symlink-<日期>
# 再夾硬 symlink，等你自己核對完先手動刪。

set -euo pipefail

PROJ_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Claude Code 將絕對路徑入面嘅 / . _ 全部轉做 -
SLUG="$(echo "$PROJ_DIR" | tr '/._' '---')"
CLAUDE_PROJ="$HOME/.claude/projects/$SLUG"
TARGET="$PROJ_DIR/memory"
LINK="$CLAUDE_PROJ/memory"

mkdir -p "$TARGET" "$CLAUDE_PROJ"

if [ -L "$LINK" ]; then
  current="$(readlink "$LINK")"
  if [ "$current" = "$TARGET" ]; then
    echo "已經 link 好：$LINK -> $TARGET"
    exit 0
  fi
  echo "原本 symlink 指去 $current，改指去 $TARGET"
  rm "$LINK"
elif [ -d "$LINK" ]; then
  backup="$LINK.pre-symlink-$(date +%Y-%m-%d)"
  echo "⚠️  $LINK 係真目錄，改名做 $backup（冇刪，自己核對完先手動刪）"
  mv "$LINK" "$backup"
fi

ln -s "$TARGET" "$LINK"
echo "已經 link：$LINK -> $TARGET"
