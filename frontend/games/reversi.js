const SIZE = 8;
const BLACK = "B";
const WHITE = "W";
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

function opponent(p) {
  return p === BLACK ? WHITE : BLACK;
}

function initialBoard() {
  const b = Array(64).fill(null);
  b[27] = WHITE;
  b[28] = BLACK;
  b[35] = BLACK;
  b[36] = WHITE;
  return b;
}

function idx(row, col) {
  return row * SIZE + col;
}

function getFlips(board, row, col, player) {
  if (board[idx(row, col)] !== null) return [];
  const flips = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
      const i = idx(r, c);
      if (board[i] === opponent(player)) {
        line.push(i);
        r += dr;
        c += dc;
      } else if (board[i] === player) {
        flips.push(...line);
        break;
      } else {
        break;
      }
    }
  }
  return flips;
}

function getValidMoves(board, player) {
  const moves = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const flips = getFlips(board, r, c, player);
      if (flips.length) moves.push({ index: idx(r, c), flips });
    }
  }
  return moves;
}

function countDiscs(board) {
  let black = 0;
  let white = 0;
  for (const cell of board) {
    if (cell === BLACK) black++;
    else if (cell === WHITE) white++;
  }
  return { black, white };
}

function applyMove(board, move, player) {
  const next = board.slice();
  next[move.index] = player;
  for (const i of move.flips) next[i] = player;
  return next;
}

function evaluate(board, ai, human) {
  const { black, white } = countDiscs(board);
  const aiCount = ai === BLACK ? black : white;
  const humanCount = ai === BLACK ? white : black;
  const corners = [0, 7, 56, 63];
  let cornerBonus = 0;
  for (const c of corners) {
    if (board[c] === ai) cornerBonus += 25;
    else if (board[c] === human) cornerBonus -= 25;
  }
  const aiMoves = getValidMoves(board, ai).length;
  const humanMoves = getValidMoves(board, human).length;
  return (aiCount - humanCount) * 10 + cornerBonus + (aiMoves - humanMoves) * 3;
}

// ── Hard-level heuristics ─────────────────────────────────────────────
// Classic Reversi positional weights: corners are gold, the X/C squares
// next to empty corners are traps, edges are mildly good.
const WEIGHTS = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];

// Frontier discs (own discs touching an empty square) are exposed to being
// flipped — fewer is better.
function countFrontier(board, player) {
  let n = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[idx(r, c)] !== player) continue;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[idx(nr, nc)] === null) {
          n++;
          break;
        }
      }
    }
  }
  return n;
}

// Phase-aware evaluation used by the "hard" AI: positional weights + corner
// control + mobility + frontier, shifting toward raw disc count in the endgame.
function evaluateHard(board, ai, human) {
  const aiMoves = getValidMoves(board, ai).length;
  const humanMoves = getValidMoves(board, human).length;
  const { black, white } = countDiscs(board);
  const aiCount = ai === BLACK ? black : white;
  const humanCount = ai === BLACK ? white : black;

  // Terminal position — decide by final disc count.
  if (aiMoves === 0 && humanMoves === 0) {
    if (aiCount > humanCount) return 1e6 + (aiCount - humanCount);
    if (aiCount < humanCount) return -1e6 - (humanCount - aiCount);
    return 0;
  }

  const empties = 64 - black - white;

  let pos = 0;
  for (let i = 0; i < 64; i++) {
    if (board[i] === ai) pos += WEIGHTS[i];
    else if (board[i] === human) pos -= WEIGHTS[i];
  }

  const corners = [0, 7, 56, 63];
  let corner = 0;
  for (const c of corners) {
    if (board[c] === ai) corner++;
    else if (board[c] === human) corner--;
  }

  const mob = aiMoves + humanMoves > 0 ? (aiMoves - humanMoves) / (aiMoves + humanMoves) : 0;
  const frontier = countFrontier(board, human) - countFrontier(board, ai);
  const discDiff = aiCount - humanCount;

  let score = pos + corner * 100 + mob * 80 + frontier * 8;
  // Grabbing discs early hurts mobility; only reward disc count near the end.
  if (empties <= 8) score += discDiff * 30;
  else if (empties <= 12) score += discDiff * 10;
  return score;
}

// Corners-first move ordering makes alpha-beta pruning far more effective.
function orderMoves(moves) {
  return moves.slice().sort((a, b) => WEIGHTS[b.index] - WEIGHTS[a.index]);
}

function search(board, depth, alpha, beta, isMax, ai, human, evalFn) {
  const aiMoves = getValidMoves(board, ai);
  const humanMoves = getValidMoves(board, human);

  if (depth === 0 || (!aiMoves.length && !humanMoves.length)) {
    return evalFn(board, ai, human);
  }

  if (isMax) {
    if (!aiMoves.length) return search(board, depth - 1, alpha, beta, false, ai, human, evalFn);
    let best = -Infinity;
    for (const move of orderMoves(aiMoves)) {
      const next = applyMove(board, move, ai);
      best = Math.max(best, search(next, depth - 1, alpha, beta, false, ai, human, evalFn));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  if (!humanMoves.length) return search(board, depth - 1, alpha, beta, true, ai, human, evalFn);
  let best = Infinity;
  for (const move of orderMoves(humanMoves)) {
    const next = applyMove(board, move, human);
    best = Math.min(best, search(next, depth - 1, alpha, beta, true, ai, human, evalFn));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

// Deeper search as the board fills; solve to the end once few squares remain.
function hardDepth(board) {
  const empties = board.reduce((n, cell) => (cell === null ? n + 1 : n), 0);
  if (empties <= 10) return empties;
  if (empties <= 14) return 8;
  return 6;
}

function chooseMove(board, ai, human, level) {
  const moves = getValidMoves(board, ai);
  if (!moves.length) return null;

  // Easy: greedy max-flip (a well-known weak strategy), random tie-break.
  if (level === "easy") {
    const max = Math.max(...moves.map((m) => m.flips.length));
    const top = moves.filter((m) => m.flips.length === max);
    return top[Math.floor(Math.random() * top.length)];
  }

  const evalFn = level === "hard" ? evaluateHard : evaluate;
  const depth = level === "hard" ? hardDepth(board) : 4;
  let bestMove = moves[0];
  let bestScore = -Infinity;
  for (const move of orderMoves(moves)) {
    const next = applyMove(board, move, ai);
    const score = search(next, depth - 1, -Infinity, Infinity, false, ai, human, evalFn);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}

export function createReversi(ctx) {
  const { boardEl, turnIndicator, modeBadge, playersBar, scoreBar, resultEl, resultText, resultStats, escapeHtml, persistGame, formatGameWinRate } = ctx;

  let mode = null;
  let board = initialBoard();
  let current = BLACK;
  let gameOver = false;
  let humanColor = BLACK;
  let computerColor = WHITE;
  let aiLevel = "normal";
  let humanName = "";
  let playerBlackName = "";
  let playerWhiteName = "";
  let validIndices = new Set();

  const LEVEL_LABELS = { easy: "簡單", normal: "普通", hard: "困難" };

  function updateScore() {
    const { black, white } = countDiscs(board);
    scoreBar.innerHTML = `<span class="mark-black">● ${black}</span> · <span class="mark-white">○ ${white}</span>`;
  }

  function refreshValidMoves() {
    const moves = getValidMoves(board, current);
    validIndices = new Set(moves.map((m) => m.index));
  }

  function initBoard() {
    boardEl.className = "board board-reversi";
    boardEl.innerHTML = "";
    for (let i = 0; i < 64; i++) {
      const cell = document.createElement("button");
      cell.className = "cell cell-reversi";
      cell.dataset.index = i;
      cell.addEventListener("click", () => handleCellClick(i));
      boardEl.appendChild(cell);
    }
  }

  function renderCells() {
    const cells = boardEl.querySelectorAll(".cell");
    cells.forEach((cell, i) => {
      const v = board[i];
      cell.textContent = "";
      cell.classList.remove("disc-black", "disc-white", "valid-move");
      if (v === BLACK) {
        cell.classList.add("disc-black");
      } else if (v === WHITE) {
        cell.classList.add("disc-white");
      } else if (!gameOver && validIndices.has(i)) {
        cell.classList.add("valid-move");
      }
      cell.disabled = gameOver || v !== null || !validIndices.has(i);
    });
    updateScore();
  }

  function updateUI() {
    renderCells();
    if (gameOver) return;

    const name = current === BLACK ? playerBlackName : playerWhiteName;
    const markClass = current === BLACK ? "mark-black" : "mark-white";
    const disc = current === BLACK ? "●" : "○";

    if (mode === "pvp") {
      turnIndicator.innerHTML = `${escapeHtml(name)}'s turn (<span class="${markClass}">${disc}</span>)`;
    } else {
      const isHuman = current === humanColor;
      turnIndicator.textContent = isHuman ? "Your turn" : "Computer thinking…";
      boardEl.classList.toggle("thinking", !isHuman);
      if (!isHuman) {
        boardEl.querySelectorAll(".cell").forEach((c) => (c.disabled = true));
      }
    }
  }

  async function endGame() {
    gameOver = true;
    const { black, white } = countDiscs(board);

    // winnerMark is relative to how the game is persisted: for pvp, X = black
    // player; for pvc, X = the human (whatever colour they were dealt).
    let winnerMark;
    if (mode === "pvp") {
      winnerMark = black > white ? "X" : white > black ? "O" : null;
      if (winnerMark === null) {
        resultText.textContent = `Draw! ${black} – ${white}`;
      } else {
        const name = winnerMark === "X" ? playerBlackName : playerWhiteName;
        resultText.textContent = `${name} wins! (${black} – ${white})`;
      }
    } else {
      const humanDiscs = humanColor === BLACK ? black : white;
      const cpuDiscs = humanColor === BLACK ? white : black;
      winnerMark = humanDiscs > cpuDiscs ? "X" : cpuDiscs > humanDiscs ? "O" : null;
      if (winnerMark === null) {
        resultText.textContent = `Draw! ${black} – ${white}`;
      } else if (winnerMark === "X") {
        resultText.textContent = `You win! (${black} – ${white})`;
      } else {
        resultText.textContent = `Computer wins! (${black} – ${white})`;
      }
    }

    resultEl.classList.remove("hidden");
    updateUI();

    const saved = await persistGame({
      mode,
      playerXName: mode === "pvp" ? playerBlackName : humanName,
      playerOName: playerWhiteName,
      winner: winnerMark,
      difficulty: mode === "pvc" ? aiLevel : null,
    });

    if (saved) {
      resultStats.classList.remove("hidden");
      if (mode === "pvp") {
        resultStats.textContent = `${playerBlackName}: ${formatGameWinRate(saved.playerX, null)} · ${playerWhiteName}: ${formatGameWinRate(saved.playerO, null)}`;
      } else if (saved.player) {
        resultStats.textContent = `${saved.player.name}: ${formatGameWinRate(saved.player, aiLevel)}`;
      }
    }
  }

  function advanceTurn() {
    const next = opponent(current);
    const nextMoves = getValidMoves(board, next);
    if (nextMoves.length) {
      current = next;
      refreshValidMoves();
      updateUI();
      if (mode === "pvc" && current === computerColor) {
        setTimeout(computerMove, 500);
      }
      return;
    }

    const curMoves = getValidMoves(board, current);
    if (curMoves.length) {
      refreshValidMoves();
      turnIndicator.textContent = `${opponent(current === BLACK ? playerBlackName : playerWhiteName)} must pass`;
      updateUI();
      if (mode === "pvc" && current === computerColor) {
        setTimeout(computerMove, 500);
      }
      return;
    }

    endGame();
  }

  function playMove(move) {
    board = applyMove(board, move, current);
    advanceTurn();
  }

  function handleCellClick(index) {
    if (gameOver || !validIndices.has(index)) return;
    if (mode === "pvc" && current !== humanColor) return;

    const row = Math.floor(index / SIZE);
    const col = index % SIZE;
    const flips = getFlips(board, row, col, current);
    if (!flips.length) return;

    playMove({ index, flips });
  }

  function computerMove() {
    if (gameOver) return;
    const move = chooseMove(board, computerColor, humanColor, aiLevel);
    if (move) {
      playMove(move);
    } else {
      advanceTurn();
    }
  }

  function renderDifficultyScreen() {
    boardEl.className = "board board-bs-outer";
    boardEl.innerHTML = `
      <div class="bs-cover">
        <div class="bs-cover-eyebrow">選擇電腦難度</div>
        <button class="btn btn-secondary bs-diff-btn" data-level="easy">
          😊 簡單<span class="bs-diff-desc">貪心走法，容易擊敗</span>
        </button>
        <button class="btn btn-secondary bs-diff-btn" data-level="normal">
          🤔 普通<span class="bs-diff-desc">標準 AI · 預測 4 步</span>
        </button>
        <button class="btn btn-primary bs-diff-btn" data-level="hard">
          🧠 困難<span class="bs-diff-desc">位置權重＋殘局精算 · 6 步以上</span>
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
    if (mode === "pvc") {
      // Random starting colour — black always moves first, so if the human
      // draws white the computer opens the game.
      humanColor = Math.random() < 0.5 ? BLACK : WHITE;
      computerColor = opponent(humanColor);
      playerBlackName = humanColor === BLACK ? humanName : "Computer";
      playerWhiteName = humanColor === WHITE ? humanName : "Computer";
    }

    board = initialBoard();
    current = BLACK;
    gameOver = false;

    scoreBar.classList.remove("hidden");
    resultEl.classList.add("hidden");
    resultStats.classList.add("hidden");
    boardEl.classList.remove("thinking");

    if (mode === "pvp") {
      playersBar.innerHTML = `<span class="mark-black">${escapeHtml(playerBlackName)}</span> (●) vs <span class="mark-white">${escapeHtml(playerWhiteName)}</span> (○)`;
    } else {
      const youDisc = humanColor === BLACK ? "●" : "○";
      const youMark = humanColor === BLACK ? "mark-black" : "mark-white";
      const cpuDisc = computerColor === BLACK ? "●" : "○";
      const cpuMark = computerColor === BLACK ? "mark-black" : "mark-white";
      playersBar.innerHTML = `<span class="${youMark}">${escapeHtml(humanName)}</span> (you, ${youDisc}) vs <span class="${cpuMark}">Computer</span> (${cpuDisc}) · ${LEVEL_LABELS[aiLevel]}`;
    }

    initBoard();
    refreshValidMoves();
    updateUI();

    if (mode === "pvc" && current === computerColor) {
      setTimeout(computerMove, 500);
    }
  }

  return {
    start({ mode: m, playerX, playerO }) {
      mode = m;
      humanName = playerX;
      humanColor = BLACK;
      computerColor = WHITE;

      if (mode === "pvp") {
        playerBlackName = playerX;
        playerWhiteName = playerO;
      }

      modeBadge.textContent = mode === "pvp" ? "Reversi · PvP" : "Reversi · vs CPU";
      resultEl.classList.add("hidden");
      resultStats.classList.add("hidden");
      boardEl.classList.remove("thinking");

      if (mode === "pvc") {
        // Pick the opponent strength before dealing colours.
        scoreBar.classList.add("hidden");
        playersBar.innerHTML = "";
        renderDifficultyScreen();
      } else {
        beginGame();
      }
    },

    restart() {
      // Keep the chosen difficulty; re-deal colours for pvc.
      beginGame();
    },
  };
}
