import { Cell, CellState, SoloCacheData, LS_KEYS } from './types';
import { drawBoardFromCells, drawCells, setSoloGodMode } from './renderer';
import { ROWS, COLS, CELL_SIZE, getDynamicCellSize, DIFFICULTY_PRESETS, type DifficultyKey } from './constants';
import { bindCanvasInputEvents, setFlagMode } from './input';

// ---- 单机状态 ----
let board: Cell[][] = [];
let totalMines = 10;
let rows = ROWS;
let cols = COLS;
let gameOver = false;
let startTime = 0;
let timerInterval: number | null = null;
let firstClickDone = false;
let revealedCount = 0;
let totalNonMineCount = 0;
export let isSoloActive = false;
// 上帝模式（纯本地视觉效果，刷新即消失）
let godMode = false;
// 记录当前难度参数，确保「再来一局」沿用同一难度
let currentDifficulty: DifficultyKey | null = 'easy';
let customParams: { rows: number; cols: number; mines: number } | null = null;
// 当前 solo 单格像素尺寸
let soloCellSize = CELL_SIZE;

// ---- 单机持久化 ----
function saveSoloState() {
  if (gameOver) return; // 对局已结束时不再写缓存
  try {
    const cells: Record<string, { hasMine: boolean; adjacentMines: number; state: CellState }> = {};
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = board[r]?.[c];
        if (cell) {
          cells[`${r},${c}`] = {
            hasMine: cell.hasMine,
            adjacentMines: cell.adjacentMines,
            state: cell.state,
          };
        }
      }
    }
    const data: SoloCacheData = {
      rows,
      cols,
      totalMines,
      totalNonMineCount,
      revealedCount,
      firstClickDone,
      gameOver,
      cells,
    };
    localStorage.setItem(LS_KEYS.SOLO, JSON.stringify(data));
  } catch {
    // 数据损坏时静默清理
    clearSoloSave();
  }
}

export function clearSoloSave() {
  try { localStorage.removeItem(LS_KEYS.SOLO); } catch { /* noop */ }
}

/** 尝试从缓存恢复单机对局，返回 true 表示已恢复 */
export function tryRestoreSoloGame(): boolean {
  try {
    const raw = localStorage.getItem(LS_KEYS.SOLO);
    if (!raw) return false;

    const data: SoloCacheData = JSON.parse(raw);
    // 基本合法性校验
    if (!data.cells || !data.rows || !data.cols || data.gameOver) {
      clearSoloSave();
      return false;
    }
    if (data.rows < 5 || data.cols < 5 || data.totalMines < 1) {
      clearSoloSave();
      return false;
    }

    // 恢复状态变量
    rows = data.rows;
    cols = data.cols;
    totalMines = data.totalMines;
    totalNonMineCount = data.totalNonMineCount;
    revealedCount = data.revealedCount;
    firstClickDone = data.firstClickDone;
    gameOver = data.gameOver;
    currentDifficulty = null;
    customParams = { rows, cols, mines: totalMines };
    isSoloActive = true;

    // 重建 board
    board = [];
    for (let r = 0; r < rows; r++) {
      board[r] = [];
      for (let c = 0; c < cols; c++) {
        const saved = data.cells[`${r},${c}`];
        board[r][c] = saved
          ? { row: r, col: c, hasMine: saved.hasMine, adjacentMines: saved.adjacentMines, state: saved.state }
          : { row: r, col: c, hasMine: false, adjacentMines: 0, state: CellState.Hidden };
      }
    }

    return true;
  } catch {
    clearSoloSave();
    return false;
  }
}

// ---- 棋盘生成 ----
function generateBoard(rCount: number, cCount: number, mines: number): Cell[][] {
  const b: Cell[][] = [];
  for (let r = 0; r < rCount; r++) {
    b[r] = [];
    for (let c = 0; c < cCount; c++) {
      b[r][c] = {
        row: r,
        col: c,
        hasMine: true,
        adjacentMines: 0,
        state: CellState.Hidden,
      };
    }
  }
  // 随机布雷
  const allPos: [number, number][] = [];
  for (let r = 0; r < rCount; r++) {
    for (let c = 0; c < cCount; c++) {
      allPos.push([r, c]);
    }
  }
  // Fisher-Yates 打乱
  for (let i = allPos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPos[i], allPos[j]] = [allPos[j], allPos[i]];
  }
  for (let k = 0; k < mines; k++) {
    const [r, c] = allPos[k];
    b[r][c].hasMine = true;
  }
  for (let k = mines; k < allPos.length; k++) {
    const [r, c] = allPos[k];
    b[r][c].hasMine = false;
  }
  recomputeAdjacent(b, rCount, cCount);
  return b;
}

function recomputeAdjacent(b: Cell[][], rCount: number, cCount: number) {
  for (let r = 0; r < rCount; r++) {
    for (let c = 0; c < cCount; c++) {
      if (b[r][c].hasMine) {
        b[r][c].adjacentMines = -1;
        continue;
      }
      let cnt = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rCount && nc >= 0 && nc < cCount && b[nr][nc].hasMine) {
            cnt++;
          }
        }
      }
      b[r][c].adjacentMines = cnt;
    }
  }
}

function ensureSafeStart(b: Cell[][], safeRow: number, safeCol: number, rCount: number, cCount: number) {
  const safeZone: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = safeRow + dr;
      const nc = safeCol + dc;
      if (nr >= 0 && nr < rCount && nc >= 0 && nc < cCount) {
        safeZone.push([nr, nc]);
      }
    }
  }
  const safeMines = safeZone.filter(([r, c]) => b[r][c].hasMine);
  const farNonMines: [number, number][] = [];
  for (let r = 0; r < rCount; r++) {
    for (let c = 0; c < cCount; c++) {
      if (!safeZone.some(([sr, sc]) => sr === r && sc === c) && !b[r][c].hasMine) {
        farNonMines.push([r, c]);
      }
    }
  }
  // 将安全区的地雷移到远处非雷位置
  for (let i = 0; i < safeMines.length && i < farNonMines.length; i++) {
    const [mr, mc] = safeMines[i];
    const [nr, nc] = farNonMines[i];
    b[mr][mc].hasMine = false;
    b[nr][nc].hasMine = true;
  }
  recomputeAdjacent(b, rCount, cCount);
}

// BFS 展开
function revealCell(row: number, col: number): Cell[] {
  const newRevealed: Cell[] = [];
  const queue: [number, number][] = [[row, col]];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const cell = board[r]?.[c];
    if (!cell || cell.state === CellState.Revealed) continue;

    cell.state = CellState.Revealed;
    newRevealed.push(cell);
    revealedCount++;

    if (cell.adjacentMines === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            queue.push([nr, nc]);
          }
        }
      }
    }
  }
  return newRevealed;
}

// ---- 计时器 ----
function startTimer() {
  startTime = Date.now();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = window.setInterval(updateSoloUI, 200);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateSoloUI() {
  const timerEl = document.getElementById('timer');
  if (timerEl && !gameOver) {
    const elapsed = (Date.now() - startTime) / 1000;
    const m = Math.floor(elapsed / 60);
    const s = Math.floor(elapsed % 60);
    timerEl.innerText = `⏱ ${m}:${String(s).padStart(2, '0')}`;
  }
  const mineEl = document.getElementById('mine-count');
  if (mineEl) {
    const flagCount = board.flat().filter(c => c.state === CellState.Flagged).length;
    mineEl.innerText = `💣 ${totalMines - flagCount}`;
  }
}

// ---- 时间格式化 ----
function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---- 结局弹窗 ----
function showSoloResult(win: boolean) {
  stopTimer();
  gameOver = true;
  clearSoloSave(); // 对局结束，清除缓存避免刷新后恢复已结束对局
  const elapsed = (Date.now() - startTime) / 1000;

  const modal = document.getElementById('solo-result-modal')!;
  const title = document.getElementById('solo-result-title')!;
  const detail = document.getElementById('solo-result-detail')!;

  title.innerText = win ? '🎉 胜利！' : '💥 失败';
  detail.innerHTML =
    `⏱ 用时 <b>${fmtTime(elapsed)}</b><br>` +
    `🔍 已揭开 <b>${revealedCount}</b> / ${totalNonMineCount} 格`;
  modal.style.display = 'flex';

  document.getElementById('solo-restart-btn')!.onclick = () => {
    modal.style.display = 'none';
    startSoloGame();
  };
  document.getElementById('solo-lobby-btn')!.onclick = () => {
    modal.style.display = 'none';
    stopTimer();
    goBackToLobby();
  };
}

// ---- 公共操作 ----
export function handleSoloCellClick(row: number, col: number) {
  if (gameOver) return;
  const cell = board[row]?.[col];
  if (!cell || cell.state === CellState.Revealed || cell.state === CellState.Flagged) return;

  if (!firstClickDone) {
    firstClickDone = true;
    if (cell.hasMine) {
      ensureSafeStart(board, row, col, rows, cols);
    }
  }

  if (cell.hasMine) {
    cell.state = CellState.Revealed;
    drawCells(board, 'game-canvas', soloCellSize, [{ row, col }]);
    // 踩雷不保存状态，直接结束 + 清除缓存
    showSoloResult(false);
    return;
  }

  const newCells = revealCell(row, col);
  drawCells(board, 'game-canvas', soloCellSize, newCells.map(c => ({ row: c.row, col: c.col })));
  saveSoloState();

  if (revealedCount >= totalNonMineCount) {
    showSoloResult(true);
  }
}

export function handleSoloCellRightClick(row: number, col: number) {
  if (gameOver) return;
  const cell = board[row]?.[col];
  if (!cell || cell.state === CellState.Revealed) return;

  cell.state = cell.state === CellState.Flagged ? CellState.Hidden : CellState.Flagged;
  drawCells(board, 'game-canvas', soloCellSize, [{ row, col }]);
  updateSoloUI();
  saveSoloState();
}

// ---- 上帝模式切换（纯本地视觉效果） ----
export function toggleSoloGodMode() {
  godMode = !godMode;
  setSoloGodMode(godMode);
  console.log(`[GodMode] ${godMode ? 'ON' : 'OFF'}`);
  if (godMode) {
    // 打印当前单机棋盘所有地雷坐标快照
    const minePositions: string[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r]?.[c]?.hasMine) {
          minePositions.push(`(${r},${c})`);
        }
      }
    }
    console.log(`[GodMode] 地雷坐标快照 (${minePositions.length}/${totalMines}):`, minePositions.join(', '));
  }
  // 全量重绘棋盘使上帝模式视觉效果生效
  drawBoardFromCells(board, 'game-canvas', soloCellSize);
}

// ---- 启动/返回 ----
let lobbyDiv: HTMLElement | null = null;
let gameUIDiv: HTMLElement | null = null;

export function startSoloGame(pRows?: number, pCols?: number, pMines?: number) {
  // 确定参数：传入 > 自定义 > 当前难度预设 > 默认初级
  if (pRows !== undefined && pCols !== undefined && pMines !== undefined) {
    rows = pRows;
    cols = pCols;
    totalMines = pMines;
    currentDifficulty = null;
    customParams = { rows: pRows, cols: pCols, mines: pMines };
  } else if (customParams) {
    rows = customParams.rows;
    cols = customParams.cols;
    totalMines = customParams.mines;
  } else if (currentDifficulty) {
    const preset = DIFFICULTY_PRESETS[currentDifficulty];
    rows = preset.rows;
    cols = preset.cols;
    totalMines = preset.mines;
  } else {
    // fallback 初级
    rows = 9; cols = 9; totalMines = 10;
    currentDifficulty = 'easy';
  }

  // 安全校验：雷数不能超过总格子数 - 1
  const maxMines = rows * cols - 1;
  if (totalMines > maxMines) totalMines = maxMines;
  if (totalMines < 1) totalMines = 1;

  clearSoloSave(); // 新对局开始前清除旧缓存
  gameOver = false;
  firstClickDone = false;
  revealedCount = 0;
  isSoloActive = true;
  // 重置上帝模式
  godMode = false;
  setSoloGodMode(false);
  totalNonMineCount = rows * cols - totalMines;

  board = generateBoard(rows, cols, totalMines);

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  soloCellSize = getDynamicCellSize(rows, cols);
  canvas.width = cols * soloCellSize;
  canvas.height = rows * soloCellSize;

  // 切换到游戏 UI
  lobbyDiv = document.getElementById('lobby');
  gameUIDiv = document.getElementById('game-ui');
  if (lobbyDiv) lobbyDiv.style.display = 'none';
  if (gameUIDiv) gameUIDiv.style.display = 'block';

  // 隐藏双人模式专属元素
  hideEl('room-code-display');
  hideEl('turn-indicator');
  hideEl('progress-bars');
  hideEl('turn-hint');

  const timerEl = document.getElementById('timer');
  if (timerEl) {
    timerEl.style.display = '';
    timerEl.innerText = '⏱ 0:00';
  }
  const mineEl = document.getElementById('mine-count');
  if (mineEl) {
    mineEl.style.display = '';
    mineEl.innerText = `💣 ${totalMines}`;
    // 隐蔽入口：点击雷数图标切换上帝模式
    if (!(mineEl as any).__soloGodModeBound) {
      (mineEl as any).__soloGodModeBound = true;
      mineEl.addEventListener('click', () => {
        if (isSoloActive) toggleSoloGodMode();
      });
    }
  }

  // 显示难度选择栏
  const dfBar = document.getElementById('solo-difficulty-bar');
  if (dfBar) dfBar.style.display = '';
  // 显示旗子模式按钮
  const flagBar = document.getElementById('flag-mode-bar');
  if (flagBar) flagBar.style.display = '';
  // 隐藏自定义面板
  const custPanel = document.getElementById('custom-difficulty-panel');
  if (custPanel) custPanel.style.display = 'none';

  // 高亮当前难度按钮
  updateDifficultyHighlight();

  drawBoardFromCells(board, 'game-canvas', soloCellSize);
  startTimer();
  saveSoloState(); // 持久化新对局
  bindSoloCanvasEvents();
  bindSoloDifficultyEvents();
}

/** 使用已恢复的棋盘初始化单机 UI（用于刷新恢复，跳过棋盘生成） */
export function initSoloUI() {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  soloCellSize = getDynamicCellSize(rows, cols);
  canvas.width = cols * soloCellSize;
  canvas.height = rows * soloCellSize;

  // 切换到游戏 UI
  lobbyDiv = document.getElementById('lobby');
  gameUIDiv = document.getElementById('game-ui');
  if (lobbyDiv) lobbyDiv.style.display = 'none';
  if (gameUIDiv) gameUIDiv.style.display = 'block';

  // 隐藏双人模式专属元素
  hideEl('room-code-display');
  hideEl('turn-indicator');
  hideEl('progress-bars');
  hideEl('turn-hint');

  const timerEl = document.getElementById('timer');
  if (timerEl) {
    timerEl.style.display = '';
    timerEl.innerText = '⏱ 0:00';
  }
  const mineEl = document.getElementById('mine-count');
  if (mineEl) {
    mineEl.style.display = '';
    const flagCount = board.flat().filter(c => c.state === CellState.Flagged).length;
    mineEl.innerText = `💣 ${totalMines - flagCount}`;
    if (!(mineEl as any).__soloGodModeBound) {
      (mineEl as any).__soloGodModeBound = true;
      mineEl.addEventListener('click', () => {
        if (isSoloActive) toggleSoloGodMode();
      });
    }
  }

  // 显示难度选择栏
  const dfBar = document.getElementById('solo-difficulty-bar');
  if (dfBar) dfBar.style.display = '';
  // 显示旗子模式按钮
  const flagBar = document.getElementById('flag-mode-bar');
  if (flagBar) flagBar.style.display = '';
  // 隐藏自定义面板
  const custPanel = document.getElementById('custom-difficulty-panel');
  if (custPanel) custPanel.style.display = 'none';

  updateDifficultyHighlight();

  drawBoardFromCells(board, 'game-canvas', soloCellSize);
  startTimer();
  bindSoloCanvasEvents();
  bindSoloDifficultyEvents();
}

function hideEl(id: string) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function showEl(id: string, display = '') {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
}

function updateDifficultyHighlight() {
  document.querySelectorAll('#solo-difficulty-bar .diff-btn').forEach(btn => {
    const diff = btn.getAttribute('data-diff');
    btn.classList.toggle('active', diff === currentDifficulty && !customParams);
  });
  const customBtn = document.getElementById('custom-toggle-btn');
  if (customBtn) {
    customBtn.classList.toggle('active', customParams !== null);
  }
}

// ---- 难度切换 ----
function applyPresetDifficulty(key: DifficultyKey) {
  currentDifficulty = key;
  customParams = null;
  stopTimer();
  startSoloGame();
}

function applyCustomDifficulty() {
  const rInput = document.getElementById('custom-rows') as HTMLInputElement;
  const cInput = document.getElementById('custom-cols') as HTMLInputElement;
  const mInput = document.getElementById('custom-mines') as HTMLInputElement;

  const r = parseInt(rInput?.value) || 9;
  const c = parseInt(cInput?.value) || 9;
  const m = parseInt(mInput?.value) || 10;

  // 基本校验
  const maxMines = r * c - 1;
  const validM = Math.max(1, Math.min(m, maxMines));

  currentDifficulty = null;
  customParams = { rows: r, cols: c, mines: validM };
  stopTimer();
  startSoloGame(r, c, validM);
}

let diffBound = false;
function bindSoloDifficultyEvents() {
  if (diffBound) return;
  diffBound = true;

  // 预设难度按钮
  document.querySelectorAll('#solo-difficulty-bar .diff-btn[data-diff]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-diff') as DifficultyKey;
      applyPresetDifficulty(key);
    });
  });

  // 自定义切换按钮
  document.getElementById('custom-toggle-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('custom-difficulty-panel')!;
    if (panel.style.display === 'none' || !panel.style.display) {
      // 用当前参数预填输入框
      (document.getElementById('custom-rows') as HTMLInputElement).value = String(rows);
      (document.getElementById('custom-cols') as HTMLInputElement).value = String(cols);
      (document.getElementById('custom-mines') as HTMLInputElement).value = String(totalMines);
      panel.style.display = '';
    } else {
      panel.style.display = 'none';
    }
  });

  // 自定义开始
  document.getElementById('custom-start-btn')?.addEventListener('click', () => {
    applyCustomDifficulty();
  });

  // 自定义取消
  document.getElementById('custom-cancel-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('custom-difficulty-panel')!;
    panel.style.display = 'none';
  });
}

export function goBackToLobby() {
  stopTimer();
  gameOver = true;
  isSoloActive = false;
  soloBound = false;
  diffBound = false;
  clearSoloSave(); // 退出单机时清除缓存
  // 重置旗子模式
  setFlagMode(false);
  // 隐藏难度栏、自定义面板、旗子模式按钮
  hideEl('solo-difficulty-bar');
  hideEl('custom-difficulty-panel');
  hideEl('flag-mode-bar');
  if (gameUIDiv) gameUIDiv.style.display = 'none';
  if (lobbyDiv) lobbyDiv.style.display = '';
  // 恢复双人模式专属元素
  showEl('room-code-display');
  showEl('turn-indicator');
  showEl('progress-bars');
}

let soloBound = false;
function bindSoloCanvasEvents() {
  if (soloBound) return;
  soloBound = true;

  bindCanvasInputEvents(
    handleSoloCellClick,
    handleSoloCellRightClick,
    () => soloCellSize,
  );
}

// ---- 快捷键：Ctrl+Shift+G 切换上帝模式（仅单机模式激活时生效） ----
let soloGodBound = false;
function bindSoloGodKey() {
  if (soloGodBound) return;
  soloGodBound = true;
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'G' || e.code === 'KeyG')) {
      if (!isSoloActive) return;
      e.preventDefault();
      e.stopPropagation();
      toggleSoloGodMode();
    }
  });
}
bindSoloGodKey();
