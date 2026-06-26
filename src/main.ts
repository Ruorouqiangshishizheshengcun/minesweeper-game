import { initGame, handleLeftClick, handleRightClick, updateTimer, resetGame } from './game';
import { Cell } from './types';
import { DEFAULT_CONFIG, CELL_SIZE } from './constants';
import { Renderer } from './renderer';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateTimerDisplay(elapsed: number): void {
  const timerEl = document.getElementById('timer')!;
  timerEl.textContent = `⏱ ${formatTime(elapsed)}`;
}

function updateMineDisplay(count: number): void {
  const mineEl = document.getElementById('mine-count')!;
  mineEl.textContent = `💣 ${count}`;
}

function render(board: Cell[][]): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const renderer = new Renderer(canvas, DEFAULT_CONFIG);
  renderer.drawBoard(board);
}

function init(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div id="header">
      <span id="mine-count">💣 ${DEFAULT_CONFIG.mines}</span>
      <span id="timer">⏱ 00:00</span>
    </div>
    <canvas id="game-canvas"></canvas>
    <button id="restart">重新开始</button>
  `;

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  canvas.width = DEFAULT_CONFIG.cols * CELL_SIZE;
  canvas.height = DEFAULT_CONFIG.rows * CELL_SIZE;

  const gameState = initGame(DEFAULT_CONFIG);

  canvas.addEventListener('click', (e) => {
    const col = Math.floor(e.offsetX / CELL_SIZE);
    const row = Math.floor(e.offsetY / CELL_SIZE);
    handleLeftClick(gameState, row, col);
    render(gameState.board);
    updateMineDisplay(gameState.config.mines - gameState.flagCount);
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const col = Math.floor(e.offsetX / CELL_SIZE);
    const row = Math.floor(e.offsetY / CELL_SIZE);
    handleRightClick(gameState, row, col);
    render(gameState.board);
    updateMineDisplay(gameState.config.mines - gameState.flagCount);
  });

  setInterval(() => {
    updateTimer(gameState);
    updateTimerDisplay(gameState.elapsedTime);
    updateMineDisplay(gameState.config.mines - gameState.flagCount);
  }, 100);

  const restartBtn = document.getElementById('restart')!;
  restartBtn.addEventListener('click', () => {
    resetGame(gameState);
    render(gameState.board);
    updateTimerDisplay(0);
    updateMineDisplay(gameState.config.mines);
  });

  render(gameState.board);
}

init();