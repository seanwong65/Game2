const SIZE = 15;
const WIN_LEN = 5;
const BLACK = "B";
const WHITE = "W";
const CENTER = Math.floor(SIZE / 2);

function idx(r, c) {
  return r * SIZE + c;
}

function opponent(p) {
  return p === BLACK ? WHITE : BLACK;
}

function emptyBoard() {
  return Array(SIZE * SIZE).fill(null);
}

function place(board, i, player) {
  const next = board.slice();
  next[i] = player;
  return next;
}

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

// Checks whether the stone just placed at (r, c) completes 5-or-more in a
// row, and if so returns the contiguous winning cell indices; otherwise null.
function winningLineAt(board, r, c, player) {
  for (const [dr, dc] of DIRECTIONS) {
    const line = [idx(r, c)];
    let rr = r + dr;
    let cc = c + dc;
    while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[idx(rr, cc)] === player) {
      line.push(idx(rr, cc));
      rr += dr;
      cc += dc;
    }
    rr = r - dr;
    cc = c - dc;
    while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[idx(rr, cc)] === player) {
      line.push(idx(rr, cc));
      rr -= dr;
      cc -= dc;
    }
    if (line.length >= WIN_LEN) return line;
  }
  return null;
}

// All 5-cell windows on the board (horizontal, vertical, both diagonals) —
// precomputed once since the board size never changes.
const WINDOWS = (() => {
  const windows = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c <= SIZE - WIN_LEN; c++) {
      windows.push(Array.from({ length: WIN_LEN }, (_, k) => idx(r, c + k)));
    }
  }
  for (let c = 0; c < SIZE; c++) {
    for (let r = 0; r <= SIZE - WIN_LEN; r++) {
      windows.push(Array.from({ length: WIN_LEN }, (_, k) => idx(r + k, c)));
    }
  }
  for (let r = 0; r <= SIZE - WIN_LEN; r++) {
    for (let c = 0; c <= SIZE - WIN_LEN; c++) {
      windows.push(Array.from({ length: WIN_LEN }, (_, k) => idx(r + k, c + k)));
    }
  }
  for (let r = 0; r <= SIZE - WIN_LEN; r++) {
    for (let c = WIN_LEN - 1; c < SIZE; c++) {
      windows.push(Array.from({ length: WIN_LEN }, (_, k) => idx(r + k, c - k)));
    }
  }
  return windows;
})();

// Only cells within 2 steps of an existing stone are worth considering — on
// a 15x15 board this cuts branching from 225 to a few dozen without missing
// any locally relevant move.
function candidateMoves(board) {
  const set = new Set();
  let anyStone = false;
  for (let i = 0; i < board.length; i++) {
    if (!board[i]) continue;
    anyStone = true;
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
          const ni = idx(nr, nc);
          if (!board[ni]) set.add(ni);
        }
      }
    }
  }
  return anyStone ? [...set] : [idx(CENTER, CENTER)];
}

// Scores every open 5-cell window by how close each side is to completing
// it, weighted so blocking a near-complete opponent line outweighs building
// one's own, plus a mild bonus for stones nearer the centre (their lines
// have more room to grow in every direction).
function evaluate(board, ai, human) {
  let score = 0;
  for (const w of WINDOWS) {
    let a = 0;
    let h = 0;
    for (const i of w) {
      if (board[i] === ai) a++;
      else if (board[i] === human) h++;
    }
    if (a && h) continue;
    // A completed five is a won game and must outrank every other term —
    // notably blocking the opponent's four, which is otherwise the single
    // biggest swing available.
    if (a === 5) score += 1e6;
    else if (a === 4) score += 5000;
    else if (a === 3) score += 200;
    else if (a === 2) score += 10;
    else if (a === 1) score += 1;
    if (h === 5) score -= 1e6;
    else if (h === 4) score -= 8000;
    else if (h === 3) score -= 400;
    else if (h === 2) score -= 15;
  }
  for (let i = 0; i < board.length; i++) {
    if (!board[i]) continue;
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    const dist = Math.max(Math.abs(r - CENTER), Math.abs(c - CENTER));
    const bonus = Math.max(0, 7 - dist);
    score += board[i] === ai ? bonus : -bonus;
  }
  return score;
}

function search(board, depth, alpha, beta, isMax, ai, human, lastIdx, lastPlayer, beamWidth) {
  if (lastPlayer !== null) {
    const r = Math.floor(lastIdx / SIZE);
    const c = lastIdx % SIZE;
    if (winningLineAt(board, r, c, lastPlayer)) {
      return lastPlayer === ai ? 1e7 + depth : -1e7 - depth;
    }
  }

  const cands = candidateMoves(board);
  if (depth === 0 || !cands.length) {
    return cands.length ? evaluate(board, ai, human) : 0;
  }

  const player = isMax ? ai : human;
  const scored = cands
    .map((i) => ({ i, next: place(board, i, player) }))
    .map((m) => ({ ...m, s: evaluate(m.next, ai, human) }));
  scored.sort((x, y) => (isMax ? y.s - x.s : x.s - y.s));
  const beam = scored.slice(0, beamWidth);

  let best = isMax ? -Infinity : Infinity;
  for (const { i, next } of beam) {
    const val = search(next, depth - 1, alpha, beta, !isMax, ai, human, i, player, beamWidth);
    if (isMax) {
      best = Math.max(best, val);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, val);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return best;
}

// Finds a move that immediately completes five for `player`, or null.
// A winning move always touches that player's own stones, so it is always
// among the candidate moves.
function findImmediateWin(board, player) {
  for (const i of candidateMoves(board)) {
    const next = place(board, i, player);
    if (winningLineAt(next, Math.floor(i / SIZE), i % SIZE, player)) return i;
  }
  return null;
}

function chooseMove(board, ai, human, level) {
  const cands = candidateMoves(board);
  if (!cands.length) return null;

  if (level === "easy") {
    const empties = [];
    for (let i = 0; i < board.length; i++) if (!board[i]) empties.push(i);
    return empties[Math.floor(Math.random() * empties.length)];
  }

  // Winning the game beats every other consideration — take the win before
  // any heuristic search, which only looks at a pruned shortlist of moves and
  // could otherwise rank blocking the opponent's four above winning outright.
  const winNow = findImmediateWin(board, ai);
  if (winNow !== null) return winNow;

  // Only if we cannot win this turn does blocking their win matter.
  const blockNow = findImmediateWin(board, human);
  if (blockNow !== null) return blockNow;

  const depth = level === "hard" ? 3 : 2;
  const beamWidth = level === "hard" ? 8 : 6;
  const topN = level === "hard" ? 12 : 8;

  const scored = cands
    .map((i) => ({ i, next: place(board, i, ai) }))
    .map((m) => ({ ...m, s: evaluate(m.next, ai, human) }));
  scored.sort((a, b) => b.s - a.s);
  const top = scored.slice(0, topN);

  let bestIdx = top[0].i;
  let bestScore = -Infinity;
  for (const { i, next } of top) {
    const score = search(next, depth - 1, -Infinity, Infinity, false, ai, human, i, ai, beamWidth);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// Exported for unit tests: the AI is pure and worth testing against
// constructed positions that would be impractical to reach via clicks.
export const _internals = { SIZE, BLACK, WHITE, chooseMove, evaluate, winningLineAt, emptyBoard, idx };

export function createGomoku(ctx) {
  const { boardEl, turnIndicator, modeBadge, playersBar, resultEl, resultText, resultStats, appRoot, escapeHtml, persistGame, formatWinRate } = ctx;

  let mode = null;
  let board = emptyBoard();
  let current = BLACK;
  let gameOver = false;
  const humanColor = BLACK;
  const computerColor = WHITE;
  let aiLevel = "normal";
  let humanName = "";
  let playerBlackName = "";
  let playerWhiteName = "";

  const DISC = { [BLACK]: "⚫", [WHITE]: "⚪" };
  const LEVEL_LABELS = { easy: "簡單", normal: "普通", hard: "困難" };

  function renderCells(winLine) {
    const cells = boardEl.querySelectorAll(".cell-gomoku");
    const winSet = new Set(winLine || []);
    const disableAll = gameOver || (mode === "pvc" && current !== humanColor);
    cells.forEach((cell, i) => {
      cell.classList.remove("disc-black", "disc-white", "winning");
      if (board[i] === BLACK) cell.classList.add("disc-black");
      else if (board[i] === WHITE) cell.classList.add("disc-white");
      if (winSet.has(i)) cell.classList.add("winning");
      cell.disabled = disableAll || board[i] !== null;
    });
  }

  function initBoard() {
    boardEl.className = "board board-gomoku";
    boardEl.innerHTML = "";
    for (let i = 0; i < SIZE * SIZE; i++) {
      const cell = document.createElement("button");
      cell.className = "cell-gomoku";
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      cell.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}`);
      cell.addEventListener("click", () => handleCellClick(i));
      boardEl.appendChild(cell);
    }
    renderCells();
  }

  function updateUI() {
    renderCells();
    if (gameOver) return;

    const name = current === BLACK ? playerBlackName : playerWhiteName;
    if (mode === "pvp") {
      turnIndicator.innerHTML = `${escapeHtml(name)}'s turn (${DISC[current]})`;
      boardEl.classList.remove("thinking");
    } else {
      const isHuman = current === humanColor;
      turnIndicator.textContent = isHuman ? "Your turn" : "Computer thinking…";
      boardEl.classList.toggle("thinking", !isHuman);
    }
  }

  async function endGame(winner, line) {
    gameOver = true;

    let winnerMark;
    if (mode === "pvp") {
      winnerMark = winner === null ? null : winner === BLACK ? "X" : "O";
      resultText.textContent = winnerMark === null ? "It's a draw!" : `${winner === BLACK ? playerBlackName : playerWhiteName} wins!`;
    } else {
      winnerMark = winner === null ? null : winner === humanColor ? "X" : "O";
      if (winnerMark === null) resultText.textContent = "It's a draw!";
      else resultText.textContent = winnerMark === "X" ? "You win!" : "Computer wins!";
    }

    renderCells(line);
    resultEl.classList.remove("hidden");
    updateUI();

    const saved = await persistGame({
      mode,
      playerXName: mode === "pvp" ? playerBlackName : humanName,
      playerOName: playerWhiteName,
      winner: winnerMark,
    });

    if (saved) {
      resultStats.classList.remove("hidden");
      if (mode === "pvp") {
        resultStats.textContent = `${playerBlackName}: ${formatWinRate(saved.playerX)} · ${playerWhiteName}: ${formatWinRate(saved.playerO)}`;
      } else if (saved.player) {
        resultStats.textContent = `${saved.player.name}: ${formatWinRate(saved.player)} win rate`;
      }
    }
  }

  function playStone(i, player) {
    board = place(board, i, player);

    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    const line = winningLineAt(board, r, c, player);
    if (line) {
      endGame(player, line);
      return;
    }
    if (board.every((v) => v !== null)) {
      endGame(null, null);
      return;
    }

    current = opponent(player);
    updateUI();

    if (mode === "pvc" && current === computerColor) {
      setTimeout(computerMove, 400);
    }
  }

  function handleCellClick(i) {
    if (gameOver || board[i] !== null) return;
    if (mode === "pvc" && current !== humanColor) return;
    playStone(i, current);
  }

  function computerMove() {
    if (gameOver) return;
    const i = chooseMove(board, computerColor, humanColor, aiLevel);
    if (i !== null) playStone(i, computerColor);
  }

  function renderDifficultyScreen() {
    boardEl.className = "board board-bs-outer";
    boardEl.innerHTML = `
      <div class="bs-cover">
        <div class="bs-cover-eyebrow">選擇電腦難度</div>
        <button class="btn btn-secondary bs-diff-btn" data-level="easy">
          😊 簡單<span class="bs-diff-desc">隨機落子</span>
        </button>
        <button class="btn btn-secondary bs-diff-btn" data-level="normal">
          🤔 普通<span class="bs-diff-desc">威脅評估 · 預測 2 步</span>
        </button>
        <button class="btn btn-primary bs-diff-btn" data-level="hard">
          🧠 困難<span class="bs-diff-desc">威脅評估 · 預測 3 步</span>
        </button>
      </div>
    `;
    turnIndicator.textContent = "";
    boardEl.querySelectorAll(".bs-diff-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        aiLevel = btn.dataset.level;
        beginGame();
      });
    });
  }

  function beginGame() {
    board = emptyBoard();
    current = BLACK;
    gameOver = false;

    if (mode === "pvc") {
      playerBlackName = humanName;
      playerWhiteName = "Computer";
    }

    modeBadge.textContent = mode === "pvp" ? "五子棋 · PvP" : "五子棋 · vs CPU";
    resultEl.classList.add("hidden");
    resultStats.classList.add("hidden");
    boardEl.classList.remove("thinking");
    appRoot?.classList.add("app-wide");

    if (mode === "pvp") {
      playersBar.innerHTML = `<span class="mark-black">${escapeHtml(playerBlackName)}</span> (⚫) vs <span class="mark-white">${escapeHtml(playerWhiteName)}</span> (⚪)`;
    } else {
      playersBar.innerHTML = `<span class="mark-black">${escapeHtml(humanName)}</span> (you, ⚫) vs <span class="mark-white">Computer</span> (⚪) · ${LEVEL_LABELS[aiLevel]}`;
    }

    initBoard();
    updateUI();
  }

  return {
    start({ mode: m, playerX, playerO }) {
      mode = m;
      humanName = playerX;

      modeBadge.textContent = mode === "pvp" ? "五子棋 · PvP" : "五子棋 · vs CPU";
      resultEl.classList.add("hidden");
      resultStats.classList.add("hidden");
      boardEl.classList.remove("thinking");

      if (mode === "pvp") {
        playerBlackName = playerX;
        playerWhiteName = playerO;
        beginGame();
      } else {
        playersBar.innerHTML = "";
        renderDifficultyScreen();
      }
    },

    restart() {
      // Keep the chosen difficulty (if any) and jump straight back in.
      beginGame();
    },

    destroy() {
      appRoot?.classList.remove("app-wide");
    },
  };
}
