export const ROWS = 9;
export const COLS = 9;
export const CELL_SIZE = 40;          // 每个格子像素大小
export const CANVAS_WIDTH = COLS * CELL_SIZE;
export const CANVAS_HEIGHT = ROWS * CELL_SIZE;

// 单机难度预设
export const DIFFICULTY_PRESETS = {
  easy:   { rows: 9,  cols: 9,  mines: 10, label: '初级 9×9' },
  medium: { rows: 16, cols: 16, mines: 40, label: '中级 16×16' },
  hard:   { rows: 16, cols: 30, mines: 99, label: '高级 16×30' },
} as const;
export type DifficultyKey = keyof typeof DIFFICULTY_PRESETS;

// 难度参数校验边界（对战模式创建房间用）
export const DIFF_VALID = {
  ROWS_MIN: 5,
  ROWS_MAX: 30,
  COLS_MIN: 5,
  COLS_MAX: 50,
  SAFE_ZONE: 9,  // 首次点击 3×3 安全区需要至少 9 个非雷格
} as const;

// 动态计算格子尺寸，确保棋盘在视口内完整显示
// 缓存避免每次调用触发 reflow（window.innerWidth/innerHeight 读取）
let _cachedCellSize = 0;
let _cachedKey = '';
export function getDynamicCellSize(rows: number, cols: number): number {
  const key = `${rows}x${cols}_${window.innerWidth}x${window.innerHeight}`;
  if (key === _cachedKey && _cachedCellSize > 0) return _cachedCellSize;
  const maxWidth = Math.min(window.innerWidth * 0.9, 700);
  const maxHeight = window.innerHeight * 0.55;
  const fromWidth = Math.floor(maxWidth / cols);
  const fromHeight = Math.floor(maxHeight / rows);
  _cachedCellSize = Math.max(20, Math.min(40, fromWidth, fromHeight));
  _cachedKey = key;
  return _cachedCellSize;
}
