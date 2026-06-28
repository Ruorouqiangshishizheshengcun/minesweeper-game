export enum CellState {
  Hidden = 'hidden',
  Revealed = 'revealed',
  Flagged = 'flagged',
}

export enum GameStatus {
  Idle = 'idle',
  Waiting = 'waiting',
  Playing = 'playing',
  Won = 'won',
  Lost = 'lost',
  Draw = 'draw',
}

export interface Cell {
  row: number;
  col: number;
  hasMine: boolean;
  adjacentMines: number;
  state: CellState;
  /** 揭开该格子的玩家 sid，用于视觉区分己方/对手揭开的格子 */
  revealedBy?: string;
}

export interface LastResult {
  isWin: boolean;
  elapsed: number;
  myProgress: number;
  opponentProgress: number;
}

export interface GameState {
  board: Cell[][];
  roomId: string | null;
  token: string | null;
  role: 'host' | 'guest' | null;
  status: GameStatus;
  flagCount: number;
  totalMines: number;
  startTime: number | null;
  elapsedTime: number;
  opponentProgress: number;
  myProgress: number;
  totalNonMine: number;
  socketConnected: boolean;
  currentTurn: string | null;
  gameMode: 'lobby' | 'room' | 'playing' | 'finished';
  myTurn: boolean;
  lastResult: LastResult | null;
  serverTimeOffset: number;
  rows: number;
  cols: number;
  /** 上帝模式标识（纯本地，刷新即忘） */
  isHost: boolean;
  godMode: boolean;
}