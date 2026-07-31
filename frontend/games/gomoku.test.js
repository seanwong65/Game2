import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGomoku, _internals } from './gomoku.js';

// ── helpers ────────────────────────────────────────────────────────────────

function makeCtx() {
  const el = (tag = 'div') => document.createElement(tag);
  const board = el();
  document.body.appendChild(board);
  return {
    boardEl: board,
    turnIndicator: el(), modeBadge: el(), playersBar: el(), scoreBar: el(),
    resultEl: el(), resultText: el(), resultStats: el(), appRoot: el(),
    escapeHtml: (s) => s,
    formatWinRate: () => '50%',
    persistGame: vi.fn().mockResolvedValue(null),
  };
}

const SIZE = 15;
const stoneCount = (ctx) => ctx.boardEl.querySelectorAll('.disc-black, .disc-white').length;
const cellAt = (ctx, r, c) => ctx.boardEl.querySelectorAll('.cell-gomoku')[r * SIZE + c];
const clickAt = (ctx, r, c) => cellAt(ctx, r, c).click();

function startPvc(ctx, level = 'normal') {
  const game = createGomoku(ctx);
  game.start({ mode: 'pvc', playerX: 'Alice', playerO: 'Computer' });
  ctx.boardEl.querySelector(`.bs-diff-btn[data-level="${level}"]`).click();
  return game;
}

describe('gomoku', () => {
  let ctx;
  beforeEach(() => { document.body.innerHTML = ''; ctx = makeCtx(); });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('shows a 3-level difficulty screen before dealing the board in pvc', () => {
    const game = createGomoku(ctx);
    game.start({ mode: 'pvc', playerX: 'Alice', playerO: 'Computer' });
    const btns = [...ctx.boardEl.querySelectorAll('.bs-diff-btn')];
    expect(btns.map((b) => b.dataset.level)).toEqual(['easy', 'normal', 'hard']);
    expect(ctx.boardEl.querySelectorAll('.cell-gomoku').length).toBe(0);
  });

  it('deals an empty 15x15 board after picking a difficulty, human plays black first', () => {
    startPvc(ctx, 'normal');
    expect(ctx.boardEl.querySelectorAll('.cell-gomoku').length).toBe(225);
    expect(stoneCount(ctx)).toBe(0);
    expect(ctx.playersBar.textContent).toContain('⚫');
    expect(ctx.appRoot.classList.contains('app-wide')).toBe(true);
  });

  it('clicking a cell places a stone there directly (any cell is clickable)', () => {
    startPvc(ctx, 'normal');
    clickAt(ctx, 7, 7);
    expect(cellAt(ctx, 7, 7).classList.contains('disc-black')).toBe(true);
  });

  it('clicking an already-occupied cell does nothing', () => {
    startPvc(ctx, 'normal');
    clickAt(ctx, 7, 7);
    const before = stoneCount(ctx);
    clickAt(ctx, 7, 7);
    expect(stoneCount(ctx)).toBe(before);
  });

  it('detects a horizontal 5-in-a-row win in pvp', () => {
    const game = createGomoku(ctx);
    game.start({ mode: 'pvp', playerX: 'Black', playerO: 'White' });
    // Black: row 0, cols 0-4. White interleaved on row 1 (irrelevant to the line).
    clickAt(ctx, 0, 0); clickAt(ctx, 1, 0);
    clickAt(ctx, 0, 1); clickAt(ctx, 1, 1);
    clickAt(ctx, 0, 2); clickAt(ctx, 1, 2);
    clickAt(ctx, 0, 3); clickAt(ctx, 1, 3);
    clickAt(ctx, 0, 4); // completes 5 in a row
    expect(ctx.resultEl.classList.contains('hidden')).toBe(false);
    expect(ctx.resultText.textContent).toContain('Black wins');
  });

  it('detects a diagonal 5-in-a-row win in pvp', () => {
    const game = createGomoku(ctx);
    game.start({ mode: 'pvp', playerX: 'Black', playerO: 'White' });
    clickAt(ctx, 0, 0); clickAt(ctx, 0, 5);
    clickAt(ctx, 1, 1); clickAt(ctx, 0, 6);
    clickAt(ctx, 2, 2); clickAt(ctx, 0, 7);
    clickAt(ctx, 3, 3); clickAt(ctx, 0, 8);
    clickAt(ctx, 4, 4); // completes the (0,0)-(4,4) diagonal
    expect(ctx.resultText.textContent).toContain('Black wins');
  });

  it('an easy AI only plays into an empty cell', () => {
    vi.useFakeTimers();
    startPvc(ctx, 'easy');
    clickAt(ctx, 7, 7);
    vi.advanceTimersByTime(500);
    expect(stoneCount(ctx)).toBe(2);
  });

  // An "open four" (4 in a row with both flanking cells empty) is an
  // unstoppable win next turn — a competent AI must never let one stand.
  function hasOpenFour(ctxToScan, player) {
    const cls = player === 'B' ? 'disc-black' : 'disc-white';
    const cells = [...ctxToScan.boardEl.querySelectorAll('.cell-gomoku')];
    const at = (r, c) => cells[r * SIZE + c];
    const isPlayer = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE && at(r, c).classList.contains(cls);
    const isEmpty = (r, c) =>
      r >= 0 && r < SIZE && c >= 0 && c < SIZE &&
      !at(r, c).classList.contains('disc-black') && !at(r, c).classList.contains('disc-white');
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!isPlayer(r, c)) continue;
        for (const [dr, dc] of dirs) {
          if (isPlayer(r - dr, c - dc)) continue; // not the start of a run
          let len = 0;
          let rr = r;
          let cc = c;
          while (isPlayer(rr, cc)) {
            len++;
            rr += dr;
            cc += dc;
          }
          if (len === 4 && isEmpty(r - dr, c - dc) && isEmpty(rr, cc)) return true;
        }
      }
    }
    return false;
  }

  it('hard AI never lets black build an unstoppable open four', () => {
    vi.useFakeTimers();
    startPvc(ctx, 'hard');
    // Repeatedly try to extend a line on row 7 — wherever the AI doesn't
    // pre-empt it, keep pushing. The AI is deterministic, so whatever it does
    // in response is the real product behaviour, not a guess.
    for (const c of [5, 6, 7, 8, 9, 10, 11]) {
      if (!cellAt(ctx, 7, c).disabled) {
        clickAt(ctx, 7, c);
        vi.advanceTimersByTime(800);
      }
    }
    expect(ctx.resultText.textContent).not.toContain('You win');
    expect(hasOpenFour(ctx, 'B')).toBe(false);
  });

  it('hard AI computes a move within a reasonable time on a mid-game board', () => {
    vi.useFakeTimers();
    const start = Date.now();
    startPvc(ctx, 'hard');
    const spots = [[7, 7], [8, 8], [6, 6], [9, 9], [5, 5], [10, 10], [4, 4], [11, 11]];
    for (const [r, c] of spots) {
      clickAt(ctx, r, c);
      vi.advanceTimersByTime(800);
    }
    expect(Date.now() - start).toBeLessThan(8000);
  });

  it('pvp has no difficulty screen and starts immediately', () => {
    const game = createGomoku(ctx);
    game.start({ mode: 'pvp', playerX: 'A', playerO: 'B' });
    expect(ctx.boardEl.querySelectorAll('.bs-diff-btn').length).toBe(0);
    expect(ctx.boardEl.querySelectorAll('.cell-gomoku').length).toBe(225);
    expect(ctx.playersBar.textContent).toContain('A');
    expect(ctx.playersBar.textContent).toContain('B');
  });

  it('destroy() removes the app-wide layout class', () => {
    const game = startPvc(ctx, 'easy');
    expect(ctx.appRoot.classList.contains('app-wide')).toBe(true);
    game.destroy();
    expect(ctx.appRoot.classList.contains('app-wide')).toBe(false);
  });
});

// The AI is a pure function, so test it against constructed positions that
// would be impractical to reach by clicking through a real game.
describe('gomoku AI move choice', () => {
  const { BLACK, WHITE, chooseMove, emptyBoard, idx } = _internals;

  // Lays out stones from a compact map: { 'r,c': player, ... }
  function boardWith(stones) {
    const b = emptyBoard();
    for (const [pos, player] of Object.entries(stones)) {
      const [r, c] = pos.split(',').map(Number);
      b[idx(r, c)] = player;
    }
    return b;
  }

  function line(r, c, dr, dc, len, player) {
    const out = {};
    for (let k = 0; k < len; k++) out[`${r + dr * k},${c + dc * k}`] = player;
    return out;
  }

  for (const level of ['normal', 'hard']) {
    it(`${level}: takes its own win instead of blocking the opponent's four`, () => {
      // White (AI) has 4 at row 5 cols 5-8 → wins at (5,4) or (5,9).
      // Black (human) has 4 at row 10 cols 5-8 → threatens (10,4)/(10,9).
      // Winning outright must beat blocking.
      const board = boardWith({
        ...line(5, 5, 0, 1, 4, WHITE),
        ...line(10, 5, 0, 1, 4, BLACK),
      });
      const move = chooseMove(board, WHITE, BLACK, level);
      expect([idx(5, 4), idx(5, 9)]).toContain(move);
    });

    it(`${level}: blocks the opponent's four when it has no win available`, () => {
      // Black threatens at (10,4)/(10,9); white has only a harmless pair.
      const board = boardWith({
        ...line(10, 5, 0, 1, 4, BLACK),
        ...line(2, 2, 0, 1, 2, WHITE),
      });
      const move = chooseMove(board, WHITE, BLACK, level);
      expect([idx(10, 4), idx(10, 9)]).toContain(move);
    });

    it(`${level}: takes a diagonal win over blocking`, () => {
      const board = boardWith({
        ...line(3, 3, 1, 1, 4, WHITE),   // wins at (2,2) or (7,7)
        ...line(11, 2, 0, 1, 4, BLACK),  // threatens (11,1)/(11,6)
      });
      const move = chooseMove(board, WHITE, BLACK, level);
      expect([idx(2, 2), idx(7, 7)]).toContain(move);
    });
  }
});
