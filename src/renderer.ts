import { Cell, CellState, BoardConfig } from './types';
import {
  DEFAULT_CONFIG,
  CELL_SIZE,
  COLORS,
  FONT_SIZE,
  FONT_WEIGHT,
} from './constants';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  private config: BoardConfig;

  constructor(canvas: HTMLCanvasElement, config: BoardConfig = DEFAULT_CONFIG) {
    this.canvas = canvas;
    this.config = config;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    this.ctx = ctx;

    this.resizeCanvas();
  }

  resizeCanvas(): void {
    this.canvas.width = this.config.cols * CELL_SIZE;
    this.canvas.height = this.config.rows * CELL_SIZE;
  }

  clear(): void {
    this.ctx.fillStyle = COLORS.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawBoard(board: Cell[][]): void {
    this.clear();

    for (let row = 0; row < this.config.rows; row++) {
      for (let col = 0; col < this.config.cols; col++) {
        const cell = board[row][col];
        const x = col * CELL_SIZE;
        const y = row * CELL_SIZE;

        this.ctx.fillStyle = cell.state === CellState.Revealed ? COLORS.cellRevealed : COLORS.cell;
        this.ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

        this.ctx.strokeStyle = COLORS.border;
        this.ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);

        if (cell.state === CellState.Flagged) {
          this.drawFlag(x, y);
        } else if (cell.state === CellState.Revealed) {
          if (cell.hasMine) {
            this.drawMine(x, y);
          } else if (cell.adjacentMines > 0) {
            this.drawNumber(cell.adjacentMines, x, y);
          }
        }
      }
    }
  }

  private drawMine(x: number, y: number): void {
    const centerX = x + CELL_SIZE / 2;
    const centerY = y + CELL_SIZE / 2;
    const radius = CELL_SIZE / 3;

    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = COLORS.mine;
    this.ctx.fill();
    this.ctx.strokeStyle = '#000';
    this.ctx.lineWidth = 1;
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(centerX - radius * 0.6, centerY);
    this.ctx.lineTo(centerX + radius * 0.6, centerY);
    this.ctx.moveTo(centerX, centerY - radius * 0.6);
    this.ctx.lineTo(centerX, centerY + radius * 0.6);
    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }

  private drawFlag(x: number, y: number): void {
    const poleHeight = CELL_SIZE * 0.6;
    const poleX = x + CELL_SIZE * 0.3;
    const poleY = y + CELL_SIZE * 0.1;

    this.ctx.beginPath();
    this.ctx.moveTo(poleX, poleY);
    this.ctx.lineTo(poleX, poleY + poleHeight);
    this.ctx.strokeStyle = '#333';
    this.ctx.lineWidth = 3;
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(poleX, poleY);
    this.ctx.lineTo(poleX + CELL_SIZE * 0.4, poleY + poleHeight * 0.3);
    this.ctx.lineTo(poleX, poleY + poleHeight * 0.5);
    this.ctx.closePath();
    this.ctx.fillStyle = COLORS.flag;
    this.ctx.fill();
  }

  private drawNumber(num: number, x: number, y: number): void {
    this.ctx.font = `${FONT_WEIGHT} ${FONT_SIZE}px Arial`;
    this.ctx.fillStyle = COLORS.text[num] || '#000';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(
      num.toString(),
      x + CELL_SIZE / 2,
      y + CELL_SIZE / 2
    );
  }

  getPositionFromClick(event: MouseEvent): { row: number; col: number } | null {
    const col = Math.floor(event.offsetX / CELL_SIZE);
    const row = Math.floor(event.offsetY / CELL_SIZE);

    if (row < 0 || row >= this.config.rows || col < 0 || col >= this.config.cols) {
      return null;
    }

    return { row, col };
  }
}