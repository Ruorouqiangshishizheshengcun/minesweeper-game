import { GameState, GameStatus, CellState, BoardConfig } from './types';
import {
  createEmptyBoard,
  placeMines,
  revealCell,
  checkWin,
  revealAllMines,
} from './board';

export function initGame(config: BoardConfig): GameState {
  return {
    board: createEmptyBoard(config.rows, config.cols),
    config,
    status: GameStatus.Idle,
    flagCount: 0,
    startTime: null,
    elapsedTime: 0,
    firstClickDone: false,
  };
}

export function handleLeftClick(state: GameState, row: number, col: number): void {
  const cell = state.board[row][col];
  if (state.status === GameStatus.Won || state.status === GameStatus.Lost) return;
  if (cell.state !== CellState.Hidden) return;

  if (!state.firstClickDone) {
    placeMines(state.board, state.config.mines, row, col);
    state.firstClickDone = true;
    state.status = GameStatus.Playing;
    state.startTime = Date.now();
  }

  if (cell.hasMine) {
    cell.state = CellState.Revealed;
    state.status = GameStatus.Lost;
    revealAllMines(state.board);
    return;
  }

  revealCell(state.board, row, col);

  if (checkWin(state.board)) {
    state.status = GameStatus.Won;
    state.elapsedTime = (Date.now() - state.startTime!) / 1000;
  }
}

export function handleRightClick(state: GameState, row: number, col: number): void {
  const cell = state.board[row][col];
  if (state.status !== GameStatus.Playing && state.status !== GameStatus.Idle) return;
  if (cell.state === CellState.Revealed) return;

  if (cell.state === CellState.Hidden) {
    cell.state = CellState.Flagged;
    state.flagCount++;
  } else if (cell.state === CellState.Flagged) {
    cell.state = CellState.Hidden;
    state.flagCount--;
  }
}

export function updateTimer(state: GameState): void {
  if (state.status === GameStatus.Playing && state.startTime) {
    state.elapsedTime = (Date.now() - state.startTime) / 1000;
  }
}

export function resetGame(state: GameState): void {
  state.board = createEmptyBoard(state.config.rows, state.config.cols);
  state.status = GameStatus.Idle;
  state.flagCount = 0;
  state.startTime = null;
  state.elapsedTime = 0;
  state.firstClickDone = false;
}
