import { Cell, CellState } from './types';
import { CELL_SIZE } from './constants';
import socket from './socket';

// ---- 上帝模式（God Mode） ----
// 纯本地视觉效果：不发送任何网络请求，不影响游戏逻辑，刷新即消失
// 仅渲染层改动：透视显示所有未揭开的地雷格子

export function enableGodMode() {
  const state = getGameState();
  state.godMode = !state.godMode;
  console.log(`[GodMode] ${state.godMode ? 'ON' : 'OFF'}`);
  if (state.godMode) {
    // 打印当前棋盘所有地雷坐标快照
    const minePositions: string[] = [];
    for (let r = 0; r < state.board.length; r++) {
      for (let c = 0; c < (state.board[r]?.length || 0); c++) {
        if (state.board[r][c].hasMine) {
          minePositions.push(`(${r},${c})`);
        }
      }
    }
    console.log(`[GodMode] 地雷坐标快照 (${minePositions.length}/${state.totalMines}):`, minePositions.join(', '));
  }
  drawBoard();
}

// ---- Canvas 旗帜绘制（纯矢量，跨平台一致） ----
function drawFlag(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size * 0.22;       // 旗面半宽
  const poleX = cx - s * 0.4;  // 旗杆 X
  const poleTop = cy - s * 1.3;
  const poleBottom = cy + s * 1.2;

  // 旗杆
  ctx.strokeStyle = '#444';
  ctx.lineWidth = Math.max(1.5, size * 0.04);
  ctx.beginPath();
  ctx.moveTo(poleX, poleTop);
  ctx.lineTo(poleX, poleBottom);
  ctx.stroke();

  // 底座三角
  ctx.fillStyle = '#555';
  ctx.beginPath();
  ctx.moveTo(poleX - s * 0.35, poleBottom);
  ctx.lineTo(poleX + s * 0.35, poleBottom);
  ctx.lineTo(poleX, poleBottom + s * 0.35);
  ctx.closePath();
  ctx.fill();

  // 旗面（红色三角）
  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  ctx.moveTo(poleX + 0.5, poleTop + s * 0.3);
  ctx.lineTo(poleX + s * 2, cy - s * 0.2);
  ctx.lineTo(poleX + 0.5, cy + s * 0.7);
  ctx.closePath();
  ctx.fill();

  // 旗面亮边
  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = Math.max(0.8, size * 0.015);
  ctx.stroke();
}

// ---- 单个格子绘制（复用逻辑） ----
function drawOneCell(
  ctx: CanvasRenderingContext2D,
  cell: Cell,
  x: number, y: number, cs: number,
  mySid?: string  // 当前玩家的 socket.id，用于区分己方/对手揭开的格子
) {
  let isOpponentCell = false;
  const state = getGameState();

  // 底色
  if (state.godMode && cell.hasMine && cell.state !== CellState.Revealed) {
    ctx.fillStyle = '#4a1010';
  } else if (cell.state === CellState.Revealed) {
    // 已揭开：根据 revealedBy 区分己方和对手
    if (mySid && cell.revealedBy && cell.revealedBy !== mySid) {
      ctx.fillStyle = '#f5e6d3';  // 对手揭开 → 暖米色，与灰色差异大
      isOpponentCell = true;
    } else {
      ctx.fillStyle = '#e0e0e0';  // 己方揭开 → 浅灰
    }
  } else {
    ctx.fillStyle = '#c0c0c0';  // 未翻开
  }
  ctx.fillRect(x, y, cs, cs);

  // 3D 边框（未翻开时）
  if (cell.state !== CellState.Revealed) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, cs - 2, 2);
    ctx.fillRect(x, y, 2, cs - 2);
    ctx.fillStyle = '#808080';
    ctx.fillRect(x, y + cs - 2, cs, 2);
    ctx.fillRect(x + cs - 2, y, 2, cs);
  }

  // 对手揭开的格子：内边框二次强化
  if (isOpponentCell) {
    ctx.strokeStyle = '#c9a87c';
    ctx.lineWidth = Math.max(1, cs * 0.03);
    ctx.strokeRect(x + 1, y + 1, cs - 2, cs - 2);
  }

  // 上帝模式：未翻开雷格画半透明红色叠加 + 小圆点
  if (state.godMode && cell.hasMine && cell.state !== CellState.Revealed) {
    // 半透明红色叠加层
    ctx.fillStyle = 'rgba(255, 0, 0, 0.35)';
    ctx.fillRect(x + 2, y + 2, cs - 4, cs - 4);
    // 红色小圆点标记
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(x + cs / 2, y + cs / 2, cs * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  // 旗帜（Canvas 矢量绘制）
  if (cell.state === CellState.Flagged) {
    drawFlag(ctx, x + cs / 2, y + cs / 2, cs);
  }

  // 数字
  if (cell.state === CellState.Revealed && cell.adjacentMines > 0) {
    ctx.font = `bold ${cs * 0.55}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const colors = ['', '#0000ff', '#008000', '#ff0000', '#000080',
                    '#800000', '#008080', '#000000', '#808080'];
    ctx.fillStyle = colors[cell.adjacentMines] || '#000';
    ctx.fillText(String(cell.adjacentMines), x + cs / 2, y + cs / 2);
  }

  // 外网格线
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, cs, cs);
}

// ---- 脏矩形：仅重绘指定格子列表 ----
// cells: 需要重绘的 {row, col} 数组，不传则全量重绘
export function drawCells(
  board: Cell[][],
  canvasId: string,
  cellSize: number,
  dirtyCells?: { row: number; col: number }[]
) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cs = cellSize;
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const mySid = socket.id;  // 当前玩家 sid，用于区分己方/对手格子

  // 判断是否使用脏矩形优化（≥ 16×16 且提供了 dirtyCells）
  const useDirty = (rows >= 16 || cols >= 16) && dirtyCells && dirtyCells.length > 0;

  if (!useDirty) {
    // 全量重绘
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = board[r][c];
        if (!cell) continue;
        drawOneCell(ctx, cell, c * cs, r * cs, cs, mySid);
      }
    }
  } else {
    // 脏矩形：逐个格子擦除+重绘
    for (const { row, col } of dirtyCells) {
      const cell = board[row]?.[col];
      if (!cell) continue;
      const x = col * cs;
      const y = row * cs;
      ctx.clearRect(x, y, cs, cs);
      drawOneCell(ctx, cell, x, y, cs, mySid);
    }
  }
}

/** 纯渲染函数：根据格子二维数组全量绘制棋盘（兼容旧接口） */
export function drawBoardFromCells(board: Cell[][], canvasId = 'game-canvas', cellSize?: number) {
  const cs = cellSize ?? CELL_SIZE;
  drawCells(board, canvasId, cs);
}

import { getGameState } from './game';
import { getDynamicCellSize } from './constants';

/** 对战模式使用的渲染（从全局 GameState 取 board），自动计算尺寸 */
export function drawBoard(dirtyCells?: { row: number; col: number }[]) {
  const state = getGameState();
  const rows = state.rows || 9;
  const cols = state.cols || 9;
  const cellSize = getDynamicCellSize(rows, cols);
  // 同步 canvas 尺寸
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (canvas) {
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;
  }
  drawCells(state.board, 'game-canvas', cellSize, dirtyCells);
}

export function drawGameOverOverlay(_isWin: boolean) {
}
