import { Cell, CellState } from './types';

export function createEmptyBoard(rows: number, cols: number): Cell[][] {
  const board: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    board[r] = [];
    for (let c = 0; c < cols; c++) {
      board[r][c] = {
        row: r,
        col: c,
        hasMine: false,
        adjacentMines: 0,
        state: CellState.Hidden,
      };
    }
  }
  return board;
}

export function placeMines(
  board: Cell[][],
  mines: number,
  safeRow: number,
  safeCol: number
): void {
  const rows = board.length;
  const cols = board[0].length;
  let placed = 0;

  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (Math.abs(r - safeRow) <= 1 && Math.abs(c - safeCol) <= 1) continue;
    if (board[r][c].hasMine) continue;

    board[r][c].hasMine = true;
    placed++;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].hasMine) {
        board[r][c].adjacentMines = -1;
      } else {
        board[r][c].adjacentMines = countAdjacentMines(board, r, c);
      }
    }
  }
}

function countAdjacentMines(board: Cell[][], row: number, col: number): number {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < board.length && nc >= 0 && nc < board[0].length) {
        if (board[nr][nc].hasMine) {
          count++;
        }
      }
    }
  }
  return count;
}

export function revealCell(board: Cell[][], row: number, col: number): Cell[] {
  const revealed: Cell[] = [];
  const queue: [number, number][] = [[row, col]];
  const visited = new Set<string>();
  const key = (r: number, c: number) => `${r},${c}`;

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    if (visited.has(key(r, c))) continue;
    visited.add(key(r, c));

    const cell = board[r][c];
    if (cell.state !== CellState.Hidden) continue;
    cell.state = CellState.Revealed;
    revealed.push(cell);

    if (cell.adjacentMines === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < board.length && nc >= 0 && nc < board[0].length) {
            if (!visited.has(key(nr, nc))) {
              queue.push([nr, nc]);
            }
          }
        }
      }
    }
  }
  return revealed;
}

export function toggleFlag(board: Cell[][], row: number, col: number): boolean {
  const cell = board[row][col];
  if (cell.state === CellState.Revealed) return false;

  if (cell.state === CellState.Flagged) {
    cell.state = CellState.Hidden;
    return false;
  } else {
    cell.state = CellState.Flagged;
    return true;
  }
}

export function checkWin(board: Cell[][]): boolean {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      const cell = board[r][c];
      if (!cell.hasMine && cell.state !== CellState.Revealed) {
        return false;
      }
    }
  }
  return true;
}

export function revealAllMines(board: Cell[][]): void {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      if (board[r][c].hasMine) {
        board[r][c].state = CellState.Revealed;
      }
    }
  }
}