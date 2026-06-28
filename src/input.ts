// 共享输入模块：旗子模式、长按标记、canvas 事件绑定

import { showToast } from './game';

// ---- 旗子模式 ----
export let flagMode = false;

export function isFlagMode() {
  return flagMode;
}

export function toggleFlagMode(): boolean {
  flagMode = !flagMode;
  updateFlagModeUI();
  return flagMode;
}

export function setFlagMode(on: boolean) {
  flagMode = on;
  updateFlagModeUI();
}

function updateFlagModeUI() {
  const btn = document.getElementById('flag-mode-btn');
  if (!btn) return;
  if (flagMode) {
    btn.className = 'flag-mode-on';
    btn.innerHTML = '🚩 标记模式<span class="flag-on-indicator">●</span>';
  } else {
    btn.className = 'flag-mode-off';
    btn.innerHTML = '🚩 标记模式';
  }
}

// ---- 长按检测 ----
function attachLongPress(
  el: HTMLElement,
  onLongPress: (row: number, col: number) => void,
  getRowCol: (e: MouseEvent | Touch) => { row: number; col: number } | null
): () => void {
  let longPressTimer: number | null = null;
  let longPressFired = false;
  let startRow = -1;
  let startCol = -1;

  const start = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const rc = getRowCol(touch);
    if (!rc) return;
    startRow = rc.row;
    startCol = rc.col;
    longPressFired = false;
    longPressTimer = window.setTimeout(() => {
      longPressFired = true;
      onLongPress(startRow, startCol);
    }, 500);
  };

  const move = (e: TouchEvent) => {
    if (!longPressTimer) return;
    if (e.touches.length !== 1) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      return;
    }
    const rc = getRowCol(e.touches[0]);
    if (!rc || rc.row !== startRow || rc.col !== startCol) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const end = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    return longPressFired;
  };

  const cancelTouch = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const touchendHandler = (e: TouchEvent) => {
    const fired = end();
    if (fired) {
      e.preventDefault();
    }
  };

  el.addEventListener('touchstart', start, { passive: false });
  el.addEventListener('touchmove', move, { passive: false });
  el.addEventListener('touchend', touchendHandler);
  el.addEventListener('touchcancel', cancelTouch);

  // 返回清理函数
  return () => {
    el.removeEventListener('touchstart', start);
    el.removeEventListener('touchmove', move);
    el.removeEventListener('touchend', touchendHandler);
    el.removeEventListener('touchcancel', cancelTouch);
  };
}

// ---- 统一 canvas 事件绑定 ----
// 保存上一次绑定的清理函数，每次 bind 时先清理旧监听
let cleanupHandlers: Array<() => void> = [];

export function bindCanvasInputEvents(
  onClick: (row: number, col: number) => void,
  onRightClick: (row: number, col: number) => void,
  cellSizeFn: () => number
) {
  // 先清理旧绑定
  unbindCanvasInputEvents();

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  function getRowCol(e: MouseEvent | Touch): { row: number; col: number } | null {
    const rect = canvas!.getBoundingClientRect();
    const cs = cellSizeFn();
    const rows = Math.floor(canvas!.height / cs);
    const cols = Math.floor(canvas!.width / cs);
    const scaleX = canvas!.width / rect.width;
    const scaleY = canvas!.height / rect.height;
    const col = Math.floor(((e.clientX - rect.left) * scaleX) / cs);
    const row = Math.floor(((e.clientY - rect.top) * scaleY) / cs);
    if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
    return { row, col };
  }

  // ---- 鼠标事件 ----
  const clickHandler = (e: MouseEvent) => {
    const rc = getRowCol(e);
    if (!rc) return;
    if (flagMode) {
      onRightClick(rc.row, rc.col);
    } else {
      onClick(rc.row, rc.col);
    }
  };

  const contextMenuHandler = (e: MouseEvent) => {
    e.preventDefault();
    const rc = getRowCol(e);
    if (!rc) return;
    onRightClick(rc.row, rc.col);
  };

  canvas.addEventListener('click', clickHandler);
  canvas.addEventListener('contextmenu', contextMenuHandler);

  // ---- 触摸事件（长按 = 插旗） ----
  const touchCleanup = attachLongPress(canvas, (row, col) => {
    onRightClick(row, col);
    showToast('🚩 已标记', 1200);
  }, getRowCol as any);

  // 记录清理函数
  cleanupHandlers = [
    () => canvas.removeEventListener('click', clickHandler),
    () => canvas.removeEventListener('contextmenu', contextMenuHandler),
    touchCleanup,
  ];
}

export function unbindCanvasInputEvents() {
  cleanupHandlers.forEach(fn => fn());
  cleanupHandlers = [];
}
