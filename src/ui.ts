import { getGameState } from './game';
import { GameStatus, CellState } from './types';

let timerInterval: number | null = null;

export function startUIUpdates() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = window.setInterval(updateUI, 200);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function updateUI() {
  const state = getGameState();

  // 计时器
  const timerEl = document.getElementById('timer');
  if (timerEl) {
    if (state.startTime && state.status === GameStatus.Playing) {
      const elapsed = (Date.now() - state.startTime) / 1000;
      timerEl.innerText = `⏱ ${formatTime(elapsed)}`;
    } else {
      timerEl.innerText = `⏱ 0:00`;
    }
  }

  // 进度条
  const myBar = document.getElementById('my-progress');
  if (myBar && state.totalNonMine > 0) {
    const pct = Math.min(100, (state.myProgress / state.totalNonMine) * 100);
    myBar.style.width = `${pct}%`;
    myBar.classList.toggle('pulse-high', pct > 80);
  }

  const opBar = document.getElementById('opponent-progress');
  if (opBar && state.totalNonMine > 0) {
    const pct = Math.min(100, (state.opponentProgress / state.totalNonMine) * 100);
    opBar.style.width = `${pct}%`;
    opBar.classList.toggle('pulse-high', pct > 80);
  }

  // 房间码
  const roomEl = document.getElementById('room-code-display');
  if (roomEl && state.roomId) {
    roomEl.innerText = `🔑 ${state.roomId}`;
  }

  // 剩余雷数
  const mineEl = document.getElementById('mine-count');
  if (mineEl) {
    const flagCount = state.board.flat().filter(c => c.state === CellState.Flagged).length;
    mineEl.innerText = `💣 ${state.totalMines - flagCount}`;
  }

  // ---- 回合指示器（色块指示灯） ----
  const turnEl = document.getElementById('turn-indicator');
  if (turnEl) {
    turnEl.className = 'turn-badge';
    if (state.gameMode !== 'playing') {
      turnEl.textContent = '⚪ 等待';
      turnEl.classList.add('turn-neutral');
    } else if (state.myTurn) {
      turnEl.textContent = '🟢 你的回合';
      turnEl.classList.add('turn-mine');
    } else {
      turnEl.textContent = '🔴 对手回合';
      turnEl.classList.add('turn-opponent');
    }
  }
}