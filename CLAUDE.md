# Board Games — Claude Code 項目規則

一個網頁棋類遊戲平台（6 個遊戲），前端 vanilla ES modules，後端 Cloudflare
Worker + D1。線上：https://game2-8rc.pages.dev

## 溝通

用戶用**繁體中文（廣東話語氣）**溝通。code／commit message／技術名詞照用英文。

## 開發 Convention（所有新遊戲一律跟從）

### 1. 每一格都要自己嘅 click listener

四子棋踩過一次大坑：落子嘅 listener 綁咗喺棋盤上方一條 20px 透明窄條
（`.c4-col`），玩家撳嘅圓形格仔本身**完全冇 listener**，撳極都冇反應。

**規矩**：click handler 直接綁喺玩家真係會撳嗰個元素（每格一個
`<button>`），跟返 tictactoe／reversi／battleship 嘅做法。唔准搞「控制條 +
顯示層」分離。

### 2. AI 一定要先攞贏，先至諗防守

五子棋踩過：`evaluate()` 漏咗 5 連（`a === 5`）呢個 case，即係「已經贏咗」
嘅盤面攞 0 分；而 block 對手四連會令對手個 window 變成雙方混用被跳過，
慳返 8000 分。結果**贏嗰步分數低過 block 嗰步**，加上 `chooseMove()` 只搜
頭 N 個候選，贏嗰步隨時跌出候選名單、由頭到尾冇被搜尋過。

**規矩**：`chooseMove()` 開頭一定要有明確短路 —— 有得即刻贏就贏，其次先
block 對手即刻贏。唔准淨係靠啟發式評分排序，因為 pruning 隨時冚住個贏步。
新遊戲加 AI 時照抄 `gomoku.js` 個 `findImmediateWin()` pattern。

### 3. 評分函數要覆蓋晒「贏」呢個終局

任何 window-based `evaluate()` 都要有「連成功」嗰個 case（連四／連五），
而且分數要**大過所有防守項**。漏咗呢格就會出現 §2 嗰個 bug。

### 4. 難度選擇畫面

PvC 開局前彈難度畫面（簡單／普通／困難），沿用 `bs-cover` / `bs-diff-btn`
呢套 class（battleship 起頭，reversi／connectfour／gomoku 都 reuse 緊）。
`restart()` 保留上次揀嘅難度，唔好再問多次。

### 5. 勝率要 scope 返「遊戲 + 難度」

勝率**唔係**全域一個數。每個遊戲、每個難度分開計（`player.byGame`）。
遊戲結算畫面用 `formatGameWinRate(player, difficulty)`，唔好用
`formatWinRate(player)`（嗰個係全域數）。

新遊戲要做嘅：
- `persistGame({ ..., difficulty: mode === "pvc" ? aiLevel : null })`
- worker `index.js` 嘅 gameType 白名單加返個新 id
- `app.js` 嘅 `gameTypeLabel()` 加返個顯示名

### 6. 「New Game」要 scroll 返上頂

手機上棋盤好長，撳完 New Game 個畫面停喺原位會好似「冇反應」。呢個已經喺
`app.js` 嘅 `restartBtn` handler 統一處理咗（`window.scrollTo`），新遊戲
自動受惠，唔使自己再寫。

## 測試

`npx vitest run`（jsdom，透過 public API 驅動，唔 export 內部）。

⚠️ **測試會 mock `persistGame` 回傳 `null`**，即係 `if (saved)` 分支唔會行
—— 勝率顯示嗰條路徑好易變成零覆蓋。改到嗰度就要明確 mock 個 payload。

⚠️ **唔好靠 hardcode 一連串座標去測 AI 行為**。AI 會自己防守，打亂你預想
嘅步驟，寫出嚟嘅測試會 flaky。改用通用 invariant（例如「黑棋永遠唔可以留
低未被封鎖嘅活四」），或者直接用 `_internals` export 出嚟嘅純函數 + 砌好嘅
盤面測。

⚠️ **新測試寫完要驗返佢真係捉到 bug** —— 暫時還原個修正，確認測試會 fail，
再改返。呢個 project 出現過「測試全綠但根本冇覆蓋到」嘅情況。

## Deploy

```bash
# 前端（一定要喺 project root 行，唔係喺 frontend/ 入面）
npx wrangler pages deploy frontend --project-name=game2 --commit-dirty=true
```

```bash
# Worker（wrangler.toml 平時改咗做 .bak，避免同 Pages 撞）
cd worker && cp wrangler.toml.bak wrangler.toml && npx wrangler deploy && rm wrangler.toml
```

⚠️ `worker/wrangler.toml` **特登改咗做 `wrangler.toml.bak`**：擺喺度會令
`wrangler pages deploy` 混淆。deploy worker 嗰陣臨時改返個名，做完刪走。

## Git

feature branch（`feat/` `fix/` `chore/`）→ commit → push → PR → merge，
全程唔使問。唔准直接 commit 落 `main`。

## 其他

- 架構同技術細節睇 `docs/NOTES.md`
- 接手／交接睇 `docs/HANDOVER.md`
