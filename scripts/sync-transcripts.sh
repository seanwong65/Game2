#!/bin/bash
# 將 Claude Code 嘅對話 transcript copy 入 backups/transcripts/。
#
# 點解要呢個 script：
#   Claude Code 將 transcript 寫喺 ~/.claude/projects/<slug>/*.jsonl，
#   **預設只保留 30 日**，而且唔喺 project folder 入面。2026 年 6 月最初
#   開發嗰段對話就係咁樣冇咗（見 docs/HANDOVER.md）。
#   行一次呢個 script 就會將現存嘅 transcript 抄入 folder，跟住成個
#   folder 搬機。
#
# 用法（喺 project root 行）：
#   ./scripts/sync-transcripts.sh
#
# 建議：每次做完一大段開發、或者 deploy 之前行一次。
#
# 註：memory/ 唔使 sync —— ~/.claude/projects/<slug>/memory 已經 symlink
#     去咗呢個 folder 嘅 memory/，Claude 寫落去直接落喺 folder 入面。

set -euo pipefail

PROJ_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Claude Code 將絕對路徑入面嘅 / . _ 全部轉做 -，例如
#   /Applications/XAMPP/xamppfiles/htdocs/AI_Project/games
#   → -Applications-XAMPP-xamppfiles-htdocs-AI-Project-games
SLUG="$(echo "$PROJ_DIR" | tr '/._' '---')"
SRC="$HOME/.claude/projects/$SLUG"
DEST="$PROJ_DIR/backups/transcripts"

if [ ! -d "$SRC" ]; then
  echo "搵唔到 Claude transcript 目錄：$SRC" >&2
  echo "（folder 搬過位？slug 係由 project 絕對路徑推出嚟嘅。）" >&2
  exit 1
fi

mkdir -p "$DEST"

count=0
for f in "$SRC"/*.jsonl; do
  [ -e "$f" ] || continue
  # 只有 source 新過 dest 先抄，重覆行唔會白做功。
  # （macOS BSD cp 冇 -u，所以自己用 -nt 比較。）
  target="$DEST/$(basename "$f")"
  if [ ! -e "$target" ] || [ "$f" -nt "$target" ]; then
    cp -p "$f" "$target"
    count=$((count + 1))
  fi
done

echo "已經 sync $count 個 transcript 去 backups/transcripts/"
du -sh "$DEST" | awk '{print "總容量：" $1}'
