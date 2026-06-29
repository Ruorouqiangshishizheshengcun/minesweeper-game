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
  reason: 'last_cell_opened' | 'mine_hit' | '';
  elapsed: number;
  myProgress: number;
  opponentProgress: number;
  totalSafe: number;
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
  /** 对手是否已主动退出（退出 vs 断线区分） */
  opponentOffline: boolean;
}

/** 单机模式缓存数据结构 */
export interface SoloCacheData {
  rows: number;
  cols: number;
  totalMines: number;
  totalNonMineCount: number;
  revealedCount: number;
  firstClickDone: boolean;
  gameOver: boolean;
  /** 每格状态序列化：{ "r,c": { hasMine, adjacentMines, state } } */
  cells: Record<string, { hasMine: boolean; adjacentMines: number; state: CellState }>;
}

/** 多人模式缓存 key */
export const LS_KEYS = {
  SOLO: 'minesweeper_solo',
  ROOM_ID: 'minesweeper_room_id',
  ROOM_TOKEN: 'minesweeper_room_token',
} as const;