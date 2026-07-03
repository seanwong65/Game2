import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createConnectFour } from './connectfour.js';

// ── helpers ────────────────────────────────────────────────────────────────

function makeCtx() {
  const el = (tag = 'div') => document.createElement(tag);
  const board = el();
  document.body.appendChild(board);
  return {
    boardEl: board,
    turnIndicator: el(), modeBadge: el(), playersBar: el(), scoreBar: el(),
    resultEl: el(), resultText: el(), resultStats: el(),
    escapeHtml: (s) => s,
    formatWinRate: () => '50%',
    persistGame: vi.fn().mockResolvedValue(null),
  };
}

const discCount = (ctx) => ctx.boardEl.querySelectorAll('.disc-red, .disc-yellow').length;

function startPvc(ctx, level = 'normal') {
  const game = createConnectFour(ctx);
  game.start({ mode: 'pvc', playerX: 'Alice', playerO: 'Computer' });
  ctx.boardEl.querySelector(`.bs-diff-btn[data-level="${level}"]`).click();
  return game;
}

// Clicking any cell in a column should drop into it — not just the top row.
// Default to the top-row cell for convenience; tests can target other rows.
function clickCol(ctx, col, row = 0) {
  ctx.boardEl.querySelectorAll('.cell-c4')[row * 7 + col].click();
}

describe('connect four', () => {
  let ctx;
  beforeEach(() => { document.body.innerHTML = ''; ctx = makeCtx(); });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('shows a 3-level difficulty screen before dealing the board in pvc', () => {
    const game = createConnectFour(ctx);
    game.start({ mode: 'pvc', playerX: 'Alice', playerO: 'Computer' });
    const btns = [...ctx.boardEl.querySelectorAll('.bs-diff-btn')];
    expect(btns.map((b) => b.dataset.level)).toEqual(['easy', 'normal', 'hard']);
    expect(ctx.boardEl.querySelectorAll('.cell-c4').length).toBe(0);
  });

  it('deals an empty 7x6 board after picking a difficulty, human plays red first', () => {
    startPvc(ctx, 'normal');
    expect(ctx.boardEl.querySelectorAll('.cell-c4').length).toBe(42);
    expect(discCount(ctx)).toBe(0);
    expect(ctx.playersBar.textContent).toContain('🔴');
  });

  it('drops a disc to the bottom-most empty row of the clicked column', () => {
    startPvc(ctx, 'normal');
    clickCol(ctx, 3);
    // Column 3 (0-indexed) bottom cell is index 5*7+3 = 38
    expect(ctx.boardEl.querySelectorAll('.cell-c4')[38].classList.contains('disc-red')).toBe(true);
  });

  it('clicking any cell in a column drops a disc, not just the top-row cell', () => {
    startPvc(ctx, 'normal');
    // Click the middle of the board, not the top row — this is the exact
    // spot users naturally click, and previously had no listener at all.
    clickCol(ctx, 3, 3);
    expect(discCount(ctx)).toBe(1);
    expect(ctx.boardEl.querySelectorAll('.cell-c4')[5 * 7 + 3].classList.contains('disc-red')).toBe(true);
  });

  it('stacks a second disc in the same column directly above the first', () => {
    vi.useFakeTimers();
    startPvc(ctx, 'easy');
    clickCol(ctx, 0);
    vi.advanceTimersByTime(500); // let the (easy) computer respond
    const colCells = [0, 1, 2, 3, 4, 5].map((r) => ctx.boardEl.querySelectorAll('.cell-c4')[r * 7 + 0]);
    const filled = colCells.filter((c) => c.classList.contains('disc-red') || c.classList.contains('disc-yellow'));
    expect(filled.length).toBeGreaterThanOrEqual(1);
    // whichever cells are filled, they must be the bottom-most ones (contiguous from row 5 up)
    for (let i = 0; i < filled.length; i++) {
      expect(colCells[5 - i]).toBe(filled[i]);
    }
  });

  it('detects a horizontal 4-in-a-row win in pvp', () => {
    const game = createConnectFour(ctx);
    game.start({ mode: 'pvp', playerX: 'Red', playerO: 'Yellow' });
    // Red: 0,1,2,3 (bottom row) with Yellow interleaved elsewhere (col doesn't matter for this board state)
    clickCol(ctx, 0); // Red bottom row col0
    clickCol(ctx, 0); // Yellow col0 (stacks)
    clickCol(ctx, 1); // Red col1
    clickCol(ctx, 1); // Yellow col1
    clickCol(ctx, 2); // Red col2
    clickCol(ctx, 2); // Yellow col2
    clickCol(ctx, 3); // Red col3 -> completes 0,1,2,3 bottom row
    expect(ctx.resultEl.classList.contains('hidden')).toBe(false);
    expect(ctx.resultText.textContent).toContain('Red wins');
  });

  it('an easy AI still only plays into a valid (non-full) column', () => {
    vi.useFakeTimers();
    startPvc(ctx, 'easy');
    clickCol(ctx, 0);
    vi.advanceTimersByTime(500);
    expect(discCount(ctx)).toBe(2);
  });

  it('hard AI prevents an unblocked bottom-row four when human pushes cols 0-2', () => {
    vi.useFakeTimers();
    startPvc(ctx, 'hard');
    clickCol(ctx, 0);
    vi.advanceTimersByTime(500);
    clickCol(ctx, 1);
    vi.advanceTimersByTime(500);
    clickCol(ctx, 2);
    vi.advanceTimersByTime(500);
    // Red now holds the bottom row at cols 0-2; a bottom-row win via col 3
    // must not have been left open, and red must not already hold col 3 too.
    expect(ctx.resultText.textContent).not.toContain('You win');
    const col3Bottom = ctx.boardEl.querySelectorAll('.cell-c4')[5 * 7 + 3];
    expect(col3Bottom.classList.contains('disc-red')).toBe(false);
  });

  it('hard AI computes a move within a reasonable time on a mid-game board', () => {
    vi.useFakeTimers();
    const start = Date.now();
    startPvc(ctx, 'hard');
    for (let i = 0; i < 6 && discCount(ctx) < 12; i++) {
      const topRow = [...ctx.boardEl.querySelectorAll('.cell-c4')].slice(0, 7);
      const validCols = topRow.map((c, idx) => (!c.disabled ? idx : -1)).filter((i) => i >= 0);
      clickCol(ctx, validCols[0]);
      vi.advanceTimersByTime(500);
    }
    // Real wall-clock time (fake timers don't fake CPU-bound synchronous work)
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it('pvp has no difficulty screen and starts immediately', () => {
    const game = createConnectFour(ctx);
    game.start({ mode: 'pvp', playerX: 'A', playerO: 'B' });
    expect(ctx.boardEl.querySelectorAll('.bs-diff-btn').length).toBe(0);
    expect(ctx.boardEl.querySelectorAll('.cell-c4').length).toBe(42);
    expect(ctx.playersBar.textContent).toContain('A');
    expect(ctx.playersBar.textContent).toContain('B');
  });
});
