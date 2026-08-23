# Board Games — 架構同技術細節

最後更新：2026-08-23

---

## 1. 整體

```
瀏覽器 ──► Cloudflare Pages (game2-8rc.pages.dev)   前端靜態檔
   │
   └─fetch─► Cloudflare Worker (boardgames-worker)   API
                    │
                    └──► D1 (boardgames-db)          SQLite
```

**冇 build step、冇 bundler、冇 framework。** 前端就係一堆 ES modules，改完
直接 deploy。呢個係特登嘅 —— 省返成套 toolchain。

## 2. 前端

| 檔案 | 做咩 |
|---|---|
| `index.html` | 單頁 SPA，所有畫面（遊戲選擇／模式／設定／棋盤／排行榜）都喺入面，靠 `.hidden` 切換 |
| `app.js` | 主控制器：`GAME_META` registry、畫面導航、遊戲 factory、排行榜、勝率格式化 |
| `api.js` | Worker API client，得 28 行 |
| `styles.css` | 全部樣式 |
| `games/*.js` | 逐個遊戲一個 module |

### 遊戲 module 介面

每個遊戲 export 一個 `createXxx(ctx)`，回傳：

```js
{
  start({ mode, playerX, playerO }),   // 開局
  restart(),                           // New Game（保留難度）
  destroy?()                           // 離開時清理（例如除返 app-wide class）
}
```

`ctx` 由 `app.js` 嘅 `gameContext` 提供：DOM 元素（`boardEl`、`resultEl`…）
加 helper（`escapeHtml`、`persistGame`、`formatGameWinRate`…）。

加新遊戲要改 4 個地方：`games/新.js`、`app.js`（import + `GAME_META` +
factory + `gameTypeLabel`）、`index.html`（按鈕）、`worker/index.js`
（gameType 白名單）。

## 3. 各遊戲 AI

| 遊戲 | 簡單 | 普通 | 困難 |
|---|---|---|---|
| Tic Tac Toe | — | — | 全深度 minimax（必和，贏唔到） |
| Reversi | 貪心食最多子 | depth-4 minimax | 位置權重表 + 角落 + 行動力 + frontier，階段感知，動態深度（6 → 殘局算到終局） |
| 四子棋 | 隨機 column | depth 4 | 69 條四格 window 評分 + 中路優先排序 + 動態深度 |
| 五子棋 | 隨機空格 | depth 2, beam 6 | depth 3, beam 8 |
| 海戰棋 | 隨機鄰格 | — | 方向追蹤（2+ 命中同行就沿住嗰個方向伸延） |

### 五子棋點解要 beam search

15×15 = 225 格，全盤搜尋太慢。兩層剪枝：
1. **候選格限制喺現有棋子 2 步範圍內** → 225 縮到幾十格
2. **beam width** → 每層只展開評分最高嗰幾個

實測最壞情況（棋子分散、候選多）每步 250–600ms。

### ⚠️ 贏／擋嘅短路（唔好刪）

`gomoku.js` 嘅 `chooseMove()` 開頭有：

```js
const winNow = findImmediateWin(board, ai);
if (winNow !== null) return winNow;          // 有得贏即刻贏
const blockNow = findImmediateWin(board, human);
if (blockNow !== null) return blockNow;      // 其次擋
```

呢個唔係優化，係**正確性**。詳細成因見 `CLAUDE.md` §2 —— 簡單講就係啟發式
評分曾經令「贏」排得低過「擋」，加上候選剪枝，贏嗰步試都冇試過。

## 4. Worker API

| Method | Path | 做咩 |
|---|---|---|
| GET | `/api/players` | 排行榜（全部玩家） |
| GET | `/api/players/:name` | 單一玩家：總計 + `history` + `byGame` 分項 |
| POST | `/api/games` | 記錄一局 |

`POST /api/games` body：

```jsonc
{
  "gameType": "gomoku",     // 白名單內：ttt|reversi|minesweeper|battleship|connectfour|gomoku
  "mode": "pvc",            // pvc | pvp
  "playerName": "Alice",    // pvc 用
  "playerX": "…",           // pvp 用
  "playerO": "…",
  "winner": "X",            // X | O | null(和局)
  "difficulty": "hard"      // 可選：AI 難度或棋盤大細
}
```

## 5. 數據庫

```sql
players       (id, name UNIQUE COLLATE NOCASE, wins, losses, draws, created_at)
game_history  (id, player_id, opponent_name, game_type, difficulty, mode, result, played_at)
```

- `players` 嘅 wins/losses/draws = **全部遊戲加埋**嘅總數
- `game_history` 係**逐局真相**，per-game／per-difficulty 勝率全部由佢
  `GROUP BY game_type, difficulty, result` 即時計出嚟（`getPlayerBreakdown()`）

### difficulty 欄嘅歷史

呢欄係後加嘅（2026-08）。之前掃雷嘅難度收埋喺 `opponent_name`（`"15×15 grid"`），
migration 嗰陣 backfill 咗返嚟（669 行 `15x15`、4 行 `8x8`）。

**Reversi 有 401 行 `difficulty IS NULL`** —— 嗰批係加難度選擇之前打嘅，
真係冇呢個資料，唔係 bug。UI 顯示做「未分難度」。

## 6. 勝率點計

以前全部遊戲夾埋一個數，掃雷贏多咗會推高黑白棋勝率。而家：

- `player.winRate` — 全部遊戲總計（排行榜排序用）
- `player.byGame[gameType]` — 該遊戲勝率
- `player.byGame[gameType].byDifficulty[level]` — 該遊戲該難度勝率

前端 `formatGameWinRate(player, difficulty)` 會揀啱嗰個 scope 顯示。
冇難度資料嘅局歸入 `"none"` bucket（顯示「未分難度」），唔會掉。

## 7. 測試

`npx vitest run` — jsdom 環境，透過 public API 驅動（造個假 `ctx`、撳 DOM）。
46 個測試：battleship 9、connectfour 13、gomoku 17、reversi 7。

五子棋額外 export 咗 `_internals`（純函數 + 常數），因為要用砌好嘅盤面直接
測 AI —— 嗰啲局面用撳 DOM 砌出嚟唔實際。

測試嘅坑全部寫咗喺 `CLAUDE.md` 嘅「測試」一節，寫新測試之前睇一睇。

## 8. Deploy 嘅兩個陷阱

1. **前端一定要喺 project root 行** `wrangler pages deploy frontend …`，
   唔係入咗 `frontend/` 再行（會變成搵 `frontend/frontend`）。
2. **`worker/wrangler.toml` 平時叫 `.bak`**。擺喺度會令 `wrangler pages
   deploy` 混淆，所以 deploy worker 先臨時改返個名，做完刪走。

Pages 有 CDN cache，deploy 完即刻開可能仲係舊版。`/index.html` 尤其容易
serve 舊 cache（`/` 就冇事）—— 驗證嗰陣用 `/` 或者加 query string。

## 9. 未清理嘅嘢

- `frontend/games/liars_dice.js`（355 行）—— 死 code。當初「花旗骰」誤會咗
  係 Liar's Dice 而寫，後尾證實應該係 Craps，就冇再 wire 落 `app.js`。
  留返喺度，未刪。
- **花旗骰（Craps）已經完全移除**（2026-08，commit `5306f5a`）—— 個賭枱
  layout 同開局流程都唔跟官方規則，決定拆走重寫。用戶會另外再講返 rule。
  D1 入面一行 craps 記錄都冇，拆走冇走失數據。
