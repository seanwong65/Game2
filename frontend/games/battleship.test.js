import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBattleship } from './battleship.js';

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

function drag(el, type) {
  const e = new DragEvent(type, { bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

function startPvc(ctx) {
  const game = createBattleship(ctx);
  game.start({ mode: 'pvc', playerX: 'Alice', playerO: '電腦' });
  ctx.boardEl.querySelector('#bsDiffHard')?.click();
  return game;
}

// ── placement UI ───────────────────────────────────────────────────────────

describe('placement UI', () => {
  let ctx;
  beforeEach(() => { ctx = makeCtx(); startPvc(ctx); });

  it('renders placement board after difficulty selected', () => {
    expect(ctx.boardEl.querySelector('.bs-placement')).toBeTruthy();
  });

  it('has 5 ship badges', () => {
    expect(ctx.boardEl.querySelectorAll('.bs-badge[data-ship]')).toHaveLength(5);
  });

  it('all badges have draggable="true"', () => {
    ctx.boardEl.querySelectorAll('.bs-badge[data-ship]').forEach(b =>
      expect(b.getAttribute('draggable')).toBe('true')
    );
  });

  it('grid has placeable cells', () => {
    expect(ctx.boardEl.querySelectorAll('.bs-cell-placeable').length).toBeGreaterThan(0);
  });
});

// ── drag and drop ──────────────────────────────────────────────────────────

describe('drag and drop', () => {
  let ctx, board;
  beforeEach(() => { ctx = makeCtx(); startPvc(ctx); board = ctx.boardEl; });

  it('dragstart on badge does NOT replace the badge DOM node (no render() during drag)', () => {
    const badge = board.querySelector('.bs-badge[data-ship="0"]');
    drag(badge, 'dragstart');
    // If render() was called, boardEl.innerHTML is replaced → badge is a NEW node
    // document.contains(badge) would be false because the OLD node was removed
    expect(document.contains(badge)).toBe(true);
  });

  it('dragover a placeable cell adds a preview class', () => {
    drag(board.querySelector('.bs-badge[data-ship="0"]'), 'dragstart');
    drag(board.querySelector('.bs-cell-placeable[data-r="0"][data-c="0"]'), 'dragover');

    const previews = board.querySelectorAll('.bs-cell-preview, .bs-cell-preview-bad');
    expect(previews.length).toBeGreaterThan(0);
  });

  it('dragover does NOT call render() (cell node identity preserved)', () => {
    drag(board.querySelector('.bs-badge[data-ship="0"]'), 'dragstart');
    const cell = board.querySelector('.bs-cell-placeable[data-r="0"][data-c="0"]');
    drag(cell, 'dragover');
    // If render() replaced innerHTML, the cell node would be detached
    expect(document.contains(cell)).toBe(true);
  });

  it('drop on a valid cell places the ship', () => {
    drag(board.querySelector('.bs-badge[data-ship="0"]'), 'dragstart');
    drag(board.querySelector('.bs-cell-placeable[data-r="0"][data-c="0"]'), 'drop');

    // Cell A1 should now be a ship cell
    const placed = board.querySelector('[data-r="0"][data-c="0"]');
    expect(placed?.classList.contains('bs-cell-ship')).toBe(true);
  });

  it('dragend removes all preview classes', () => {
    drag(board.querySelector('.bs-badge[data-ship="0"]'), 'dragstart');
    drag(board.querySelector('.bs-cell-placeable[data-r="0"][data-c="0"]'), 'dragover');
    drag(board, 'dragend');

    expect(board.querySelectorAll('.bs-cell-preview, .bs-cell-preview-bad')).toHaveLength(0);
  });
});
