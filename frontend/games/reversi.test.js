import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createReversi } from './reversi.js';

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

const discCount = (ctx) => ctx.boardEl.querySelectorAll('.disc-black, .disc-white').length;

function startPvc(ctx, level = 'normal') {
  const game = createReversi(ctx);
  game.start({ mode: 'pvc', playerX: 'Alice', playerO: 'Computer' });
  ctx.boardEl.querySelector(`.bs-diff-btn[data-level="${level}"]`).click();
  return game;
}

describe('reversi', () => {
  let ctx;
  beforeEach(() => { document.body.innerHTML = ''; ctx = makeCtx(); });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('shows a 3-level difficulty screen before dealing the board in pvc', () => {
    const game = createReversi(ctx);
    game.start({ mode: 'pvc', playerX: 'Alice', playerO: 'Computer' });
    const btns = [...ctx.boardEl.querySelectorAll('.bs-diff-btn')];
    expect(btns.map((b) => b.dataset.level)).toEqual(['easy', 'normal', 'hard']);
    expect(ctx.boardEl.querySelectorAll('.cell').length).toBe(0); // no board yet
  });

  it('deals the standard 4-disc opening after picking a difficulty', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // human = black → human opens
    startPvc(ctx, 'normal');
    expect(ctx.boardEl.querySelectorAll('.cell').length).toBe(64);
    expect(discCount(ctx)).toBe(4);
  });

  it('deals the human black when random < 0.5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    startPvc(ctx, 'normal');
    expect(ctx.playersBar.textContent).toContain('you, ●');
  });

  it('deals the human white and lets the computer open when random >= 0.5', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // human = white → computer (black) opens
    startPvc(ctx, 'normal');
    expect(ctx.playersBar.textContent).toContain('you, ○');
    expect(discCount(ctx)).toBe(4);      // before the computer's scheduled move
    vi.advanceTimersByTime(600);
    expect(discCount(ctx)).toBe(5);      // computer placed exactly one disc — a legal move
  });

  it('hard AI still opens with a single legal move', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    startPvc(ctx, 'hard');
    vi.advanceTimersByTime(600);
    expect(discCount(ctx)).toBe(5);
  });

  it('easy AI opens with a single legal move', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    startPvc(ctx, 'easy');
    vi.advanceTimersByTime(600);
    expect(discCount(ctx)).toBe(5);
  });

  it('pvp starts immediately with no difficulty screen and fixed colours', () => {
    const game = createReversi(ctx);
    game.start({ mode: 'pvp', playerX: 'A', playerO: 'B' });
    expect(ctx.boardEl.querySelectorAll('.bs-diff-btn').length).toBe(0);
    expect(ctx.boardEl.querySelectorAll('.cell').length).toBe(64);
    expect(discCount(ctx)).toBe(4);
    expect(ctx.playersBar.textContent).toContain('A');
    expect(ctx.playersBar.textContent).toContain('B');
  });
});
