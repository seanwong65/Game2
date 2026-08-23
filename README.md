# Board Games

網頁棋類遊戲平台，6 個遊戲，有 PvP／PvC 模式、AI 難度分級同雲端排行榜。

**線上**：https://game2-8rc.pages.dev
**Repo**：https://github.com/seanwong65/Game2

## 遊戲

| 遊戲 | 模式 | AI 難度 |
|---|---|---|
| Tic Tac Toe | PvP / PvC | 冇（minimax 必和） |
| Reversi 黑白棋 | PvP / PvC | 簡單／普通／困難 |
| 四子棋 Connect Four | PvP / PvC | 簡單／普通／困難 |
| 五子棋 Gomoku | PvP / PvC | 簡單／普通／困難 |
| 海戰棋 Battleship | PvP / PvC | 簡單／困難 |
| Minesweeper | 單人 | 8×8／15×15 |

## 結構

```
games/
├── CLAUDE.md          項目規則（Claude Code 自動載入）
├── frontend/          前端（vanilla ES modules，冇 build step）
│   ├── index.html
│   ├── app.js         主控制器：畫面切換、排行榜、遊戲 factory
│   ├── api.js         Worker API client
│   ├── styles.css
│   └── games/         逐個遊戲一個 module + 對應 .test.js
├── worker/            Cloudflare Worker（API + D1）
│   ├── index.js
│   ├── schema.sql
│   └── wrangler.toml.bak   （見 CLAUDE.md 點解係 .bak）
├── docs/              NOTES.md（架構）、HANDOVER.md（交接）
├── scripts/
│   └── sync-transcripts.sh   將對話 transcript 抄入 backups/
├── memory/            Claude Code 記憶檔（gitignored，~/.claude symlink 過嚟）
└── backups/           （gitignored）
    ├── boardgames-db_*.sql        D1 dump
    ├── games-python-prototype_*.zip  上一代原型
    └── transcripts/               對話紀錄
```

## 開發

```bash
npm install          # 頭一次
npx vitest run       # 跑測試
```

本地開個 server 睇效果：`npx serve -p 3457 frontend`
（或者喺 Claude Code 用 `.claude/launch.json` 入面個 `game2-frontend`）

## Deploy

睇 `CLAUDE.md` 嘅 Deploy 一節 —— 前端同 worker 各有一個要注意嘅陷阱。

## 換電腦

搬呢一個 folder 就夠。之後：

1. `npm install`（`node_modules/` 冇跟住走）
2. `npx wrangler login`（secrets 喺 Cloudflare，唔喺呢個 folder）
3. 重建 memory symlink，Claude Code 嘅記憶先會繼續寫返入呢個 folder：

```bash
./scripts/link-memory.sh
```

`backups/boardgames-db_*.sql` 係 D1 數據庫嘅 snapshot，真係要重建 DB 先用。

## 保存對話紀錄

Claude Code 嘅 transcript **預設只保留 30 日**，而且唔喺呢個 folder 入面
（2026 年 6 月最初開發嗰段對話就係咁樣冇咗）。做完一大段開發行一次：

```bash
./scripts/sync-transcripts.sh
```
