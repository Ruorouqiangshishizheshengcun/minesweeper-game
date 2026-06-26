export const DEFAULT_CONFIG: BoardConfig = {
  rows: 16,
  cols: 16,
  mines: 40,
};

export const CELL_SIZE = 40;

export const BASE_URL = 'https://minesweeper-backend-production.up.railway.app';
export const WS_URL = 'wss://minesweeper-backend-production.up.railway.app';

export const COLORS = {
  background: '#f0f0f0',
  cell: '#b0b0b0',
  cellRevealed: '#d1d1d1',
  border: '#7b7b7b',
  mine: '#333333',
  flag: '#dc3545',
  text: {
    1: '#0000ff',
    2: '#008000',
    3: '#ff0000',
    4: '#000080',
    5: '#800000',
    6: '#008080',
    7: '#000000',
    8: '#808080',
  } as Record<number, string>,
};

export const FONT_SIZE = 20;
export const FONT_WEIGHT = 'bold';

export interface BoardConfig {
  rows: number;
  cols: number;
  mines: number;
}