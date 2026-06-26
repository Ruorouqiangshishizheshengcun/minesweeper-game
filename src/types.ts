export enum CellState {
  Hidden,
  Revealed,
  Flagged,
}

export enum GameStatus {
  Idle,
  Playing,
  Won,
  Lost,
}

export interface Cell {
  row: number;
  col: number;
  hasMine: boolean;
  adjacentMines: number;
  state: CellState;
}

export interface BoardConfig {
  rows: number;
  cols: number;
  mines: number;
}

export interface GameState {
  board: Cell[][];
  config: BoardConfig;
  status: GameStatus;
  flagCount: number;
  startTime: number | null;
  elapsedTime: number;
  firstClickDone: boolean;
}