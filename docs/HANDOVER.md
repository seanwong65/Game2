# Board Games 交接文件

寫俾**接手嘅人或者 AI**。目的係：唔使揭返成個對話，睇完呢份就知個系統做緊
咩、邊啲決定係特登咁做、踩過邊啲坑、同埋跟住要做咩。

最後更新：2026-08-23（commit `91e9906`）

> ⚠️ **2026 年 6 月嗰段對話已經冇咗** —— Claude Code 嘅 transcript 預設保留
> 30 日，最初開發（tictactoe／reversi／minesweeper／花旗骰起頭／海戰棋）
> 嗰個 session 已經被清走。呢份文件同 git log 就係僅存嘅紀錄。
> 現存嘅 transcript 喺 `backups/transcripts/`。
> **做完一大段開發記得行 `./scripts/sync-transcripts.sh`**，唔好再蝕多次。

---

## 0. 落手之前

1. **先讀 `../CLAUDE.md`** —— 入面係開發 convention，唔係建議，係每個新
   遊戲都要跟（尤其 §1 click listener 同 §2 AI 攞贏優先，兩個都係踩過先寫低）。
2. **再讀 `NOTES.md`** —— 架構同技術細節。
3. 用戶用**繁體中文（廣東話語氣）**溝通。code／commit message 照用英文。

## 1. 個系統做緊咩

網頁棋類遊戲平台，6 個遊戲（Tic Tac Toe、黑白棋、四子棋、五子棋、海戰棋、
掃雷），PvP／PvC，AI 分難度，成績存落 Cloudflare D1，有排行榜同 per-game／
per-difficulty 勝率。

技術骨架見 `NOTES.md` §1–2。一句講晒：**冇 build step、冇 framework**，
前端 vanilla ES modules，後端一個 Cloudflare Worker + D1。

## 2. 用戶點做嘢（好重要）

呢個 project 嘅工作習慣：

- **git 全自動**：feature branch → commit → push → PR → merge，**全程唔使
  問**。唔准直接 commit 落 `main`。（記憶檔 `memory/feedback_branch_workflow.md`
  同 `feedback_auto_push.md` 有寫。）
- **驗證唔可以靠讀 code 講「應該冇問題」**。用戶會 push back 唔準確嘅陳述。
  改完要真係跑測試／真係 call 個 API／真係開 browser 睇。
- **新測試要證明佢捉到 bug** —— 暫時還原個修正，睇住佢 fail，再改返。
  呢個 project 出現過「46 個測試全綠但根本冇覆蓋到嗰條路徑」。
- 用戶自己會玩，然後好準確咁報 bug（例如「AI 有四連又唔贏，走去 block」
  —— 一講就中，真係有個評分函數漏 case）。

## 3. 踩過嘅坑（睇完慳返好多重複踩）

### 3.1 四子棋成塊棋盤撳唔到

落子 listener 綁咗喺棋盤上方一條 20px 透明窄條，玩家撳嘅圓形格仔本身冇
listener。用戶報「禁完都冇反應」。
**教訓**：listener 綁喺玩家真係會撳嗰個元素。→ `CLAUDE.md` §1

### 3.2 五子棋 AI 有得贏都唔贏

`evaluate()` 漏咗 `a === 5`（已經贏咗嘅盤面攞 0 分），而 block 對手四連會
慳返 8000 分 → 贏嗰步排名低過 block，仲要跌出 top-12 候選，**由頭到尾冇被
搜尋過**。修法係兩層：補返 5 連評分 + `chooseMove()` 開頭明確短路。
**教訓**：評分函數要覆蓋終局；攞贏唔可以靠排序執生。→ `CLAUDE.md` §2、§3

### 3.3 「New Game」好似冇反應

手機上棋盤好長，restart 完畫面停喺底部，睇落似冇反應。海戰棋當初自己修咗，
但 reversi／四子棋冇受惠。後尾提升去 `app.js` 嘅 `restartBtn` handler 統一
處理，新遊戲自動受惠。

### 3.4 測試綠燈但零覆蓋

測試將 `persistGame` mock 成回傳 `null`，於是 `if (saved)` 分支永遠唔行 ——
成條勝率顯示路徑冇測過。改嗰度嘅嘢本來可以靜靜壞咗都冇人知。

### 3.5 AI 測試 flaky

寫過幾次「hardcode 一連串座標，預期 AI 咁樣反應」嘅測試，全部踩中同一個
問題：**AI 會自己提早防守，打亂咗預想嘅步驟**（撳落去嗰格已經俾電腦佔咗，
變成 no-op）。改用通用 invariant 或者純函數 + 砌好盤面先穩陣。

### 3.6 Deploy 兩個陷阱

前端要喺 root 行；`worker/wrangler.toml` 特登叫 `.bak`。見 `NOTES.md` §8。

### 3.7 Pages CDN cache 呃到人

驗證部署嗰陣 `curl /index.html` 攞到舊版，但 `curl /` 係新版。差啲以為
deploy 失敗。**驗證用 `/`**。

## 4. 幾個「特登咁做」嘅決定

- **黑白棋 PvC 隨機派黑白**。黑永遠先行，所以抽到白即係電腦開局。輸贏判斷
  跟人類實際顏色，唔再假設「你＝黑」。
- **海戰棋跟官方規則：每人每輪射一次**，中咗都唔會再射。曾經改成「中咗再
  射一次」，上網查證後改返。
- **海戰棋「邊框上限」預設 3**、「不相鄰」預設開。
- **掃雷／花旗骰以外，勝率一律 scope 返遊戲 + 難度**。全域勝率淨係留返俾
  排行榜排序。
- **Reversi 有 401 行 `difficulty IS NULL`** —— 加難度之前打嘅，真係冇資料，
  唔係 bug，UI 顯示「未分難度」。

## 5. 🔴 跟住要做：重寫花旗骰（Craps）

**呢個係目前唯一 pending 嘅嘢。**

### 背景

花旗骰整過兩次，兩次都唔啱：

1. 第一次**理解錯個遊戲**：以為「花旗骰」＝ Liar's Dice（吹牛骰），寫咗
   `frontend/games/liars_dice.js`。用戶指正並俾咗參考連結，先知係 **Craps**
   （賭場擲骰）。
2. 第二次照 Craps 寫，但用戶玩完講：**「你成張桌布都唔係跟 official table，
   玩法、起機嘅流程都錯曬」**。

### 現況

**已經完全拆走**（commit `5306f5a`）：`craps.js`、580 行 CSS、`app.js` 入面
嘅 registry／factory／label、`index.html` 個按鈕、worker gameType 白名單、
同埋當初淨係為咗 craps 而加嘅「唔計勝率」機制（`NO_WIN_RATE_GAMES`）。

D1 入面**一行 craps 記錄都冇**，所以拆走冇走失任何數據。

`liars_dice.js` 未刪，留咗喺度（死 code，冇 wire 落 `app.js`）。

### 落手之前

用戶明確講咗：**「你上網睇下rule 解釋俾我知你想點改先做」** —— 即係
**唔好即刻寫 code**。要：

1. 上網查清楚 Craps 官方規則同**真實賭枱 layout**（Pass Line / Don't Pass /
   Come / Don't Come / Field / Place / Odds 各區點擺、比例、位置關係）
2. **先向用戶解釋你打算點做**，等佢確認
3. 用戶特別強調**桌布（felt layout）要先改好**先至做玩法

用戶對規則好熟，之前已經自己捉到「Place Bet 應該係押咗個數字、要嗰個數字
先於 7 出現先贏」呢類細節。唔好靠估。

## 6. 檔案喺邊

成個 project 整合晒喺呢一個 folder（2026-08-23 由 `~/Downloads/Game2` 搬過
嚟）。換電腦淨係要搬呢個 folder，然後：

```bash
npm install                  # node_modules 冇跟住走
npx wrangler login           # secrets 喺 Cloudflare，唔喺呢個 folder
./scripts/link-memory.sh     # 記憶檔 symlink 返入 folder（見下）
```

- `backups/boardgames-db_2026-08-23.sql` — D1 完整 dump（1,207 行）
- `backups/games-python-prototype_2026-05-24.zip` — **上一代原型**，Python
  stdlib server + 本地 SQLite，冇 git 歷史，只存在於呢個 zip
- `backups/transcripts/` — 對話紀錄，由 `./scripts/sync-transcripts.sh` 抄入
- `memory/` — Claude Code 記憶檔（工作偏好）

`backups/` 同 `memory/` 特登 gitignore：唔屬於原始碼，跟 folder 走。
Secrets 全部喺 Cloudflare（`wrangler secret`），唔喺呢個 folder。

### 兩樣嘢原本會漏出 folder 之外

Claude Code 有兩樣嘢預設**唔**喺 project folder 入面，會令「搬一個 folder
就搞掂」呢個目標穿窿。兩樣都處理咗：

| 嘢 | 原本喺邊 | 點解決 |
|---|---|---|
| 記憶檔 | `~/.claude/projects/<slug>/memory/` | 嗰個目錄 symlink 咗去呢個 folder 嘅 `memory/`，Claude 寫落去直接落喺 folder（`scripts/link-memory.sh`） |
| 對話 transcript | `~/.claude/projects/<slug>/*.jsonl`，**30 日就清** | `scripts/sync-transcripts.sh` 抄入 `backups/transcripts/`，要人手行 |

`<slug>` 係 project 絕對路徑將 `/` `.` `_` 全部換做 `-`，所以**folder 一搬
位個 slug 就變**，兩個 script 都要重新行過。
