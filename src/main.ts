import { createRoom, joinRoom } from './api';
import socket from './socket';
import {
  initRoomBoard,
  setRoomInfo,
  handleCellClick,
  handleCellRightClick,
  getGameState,
  updateGameFromServer,
  hideResultModal,
  updateRematchStatus,
  handleRematchVotesUpdate,
  showDisconnectModal,
  showToast,
} from './game';
import { drawBoard, enableGodMode } from './renderer';
import { startUIUpdates } from './ui';
import { CELL_SIZE, getDynamicCellSize, DIFFICULTY_PRESETS, DIFF_VALID, type DifficultyKey } from './constants';
import { GameStatus } from './types';
import './style.css';
import { startSoloGame } from './solo';
import { toggleFlagMode, bindCanvasInputEvents } from './input';

const lobbyDiv = document.getElementById('lobby')!;
const waitingDiv = document.getElementById('waiting-room')!;
const gameUIDiv = document.getElementById('game-ui')!;

const createBtn = document.getElementById('create-room-btn')!;
const joinBtn = document.getElementById('join-room-btn')!;
const roomIdInput = document.getElementById('room-id-input') as HTMLInputElement;

const roomCodeWaiting = document.getElementById('room-code-waiting')!;
const waitingMessage = document.getElementById('waiting-message')!;

const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;

// 当前棋盘 cell 尺寸（对战/单机共用，通过 getDynamicCellSize 计算）
let currentCellSize = CELL_SIZE;
export function getCurrentCellSize() { return currentCellSize; }

function resizeCanvasForMode(rows: number, cols: number) {
  currentCellSize = getDynamicCellSize(rows, cols);
  gameCanvas.width = cols * currentCellSize;
  gameCanvas.height = rows * currentCellSize;
}
// 默认 9x9
resizeCanvasForMode(9, 9);

waitingDiv.style.display = 'none';
gameUIDiv.style.display = 'none';

let gameStarted = false;

export function startGameUI() {
  if (gameStarted) return;
  gameStarted = true;
  waitingDiv.style.display = 'none';
  gameUIDiv.style.display = 'block';
  // 显示旗子模式按钮
  const flagBar = document.getElementById('flag-mode-bar');
  if (flagBar) flagBar.style.display = '';

  // 隐蔽上帝模式开关：点击雷数图标（只有房主生效，对手点击无变化）
  const mineCountEl = document.getElementById('mine-count');
  if (mineCountEl && !(mineCountEl as any).__godModeBound) {
    (mineCountEl as any).__godModeBound = true;
    mineCountEl.addEventListener('click', () => toggleGodMode());
  }

  drawBoard();
  startUIUpdates();
  bindCanvasEventsOnce();
  getGameState().status = GameStatus.Playing;
}

function showWaitingRoom(roomId: string) {
  lobbyDiv.style.display = 'none';
  waitingDiv.style.display = 'block';
  gameUIDiv.style.display = 'none';
  roomCodeWaiting.innerText = roomId;
  waitingMessage.innerText = '等待对手加入...';
}

// ---- 创建房间难度选择逻辑 ----
let selectedCreateDiff: DifficultyKey = 'easy';
let isCreateCustom = false;

const createModal = document.getElementById('create-room-modal')!;
const createDiffBar = document.getElementById('create-diff-bar')!;
const createCustomPanel = document.getElementById('create-custom-panel')!;
const createError = document.getElementById('create-diff-error')!;

// 预设难度按钮
createDiffBar.querySelectorAll('.diff-btn[data-diff]').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedCreateDiff = btn.getAttribute('data-diff') as DifficultyKey;
    isCreateCustom = false;
    createCustomPanel.style.display = 'none';
    hideCreateError();
    updateCreateDiffHighlight();
  });
});

// 自定义切换
document.getElementById('create-custom-toggle')?.addEventListener('click', () => {
  isCreateCustom = true;
  updateCreateDiffHighlight();
  if (createCustomPanel.style.display === 'none' || !createCustomPanel.style.display) {
    // 预填当前预设值
    const preset = DIFFICULTY_PRESETS[selectedCreateDiff];
    (document.getElementById('create-custom-rows') as HTMLInputElement).value = String(preset.rows);
    (document.getElementById('create-custom-cols') as HTMLInputElement).value = String(preset.cols);
    (document.getElementById('create-custom-mines') as HTMLInputElement).value = String(preset.mines);
    createCustomPanel.style.display = '';
  } else {
    createCustomPanel.style.display = 'none';
    isCreateCustom = false;
    updateCreateDiffHighlight();
  }
  hideCreateError();
});

function updateCreateDiffHighlight() {
  createDiffBar.querySelectorAll('.diff-btn[data-diff]').forEach(btn => {
    const diff = btn.getAttribute('data-diff');
    btn.classList.toggle('active', diff === selectedCreateDiff && !isCreateCustom);
  });
  const customBtn = document.getElementById('create-custom-toggle');
  if (customBtn) {
    customBtn.classList.toggle('active', isCreateCustom);
  }
}

function hideCreateError() {
  createError.style.display = 'none';
  createError.innerText = '';
}

function validateCreateParams(): { valid: true; rows: number; cols: number; mines: number } | { valid: false; error: string } {
  let rows: number, cols: number, mines: number;
  if (isCreateCustom) {
    rows = parseInt((document.getElementById('create-custom-rows') as HTMLInputElement)?.value) || 0;
    cols = parseInt((document.getElementById('create-custom-cols') as HTMLInputElement)?.value) || 0;
    mines = parseInt((document.getElementById('create-custom-mines') as HTMLInputElement)?.value) || 0;
  } else {
    const p = DIFFICULTY_PRESETS[selectedCreateDiff];
    rows = p.rows;
    cols = p.cols;
    mines = p.mines;
  }

  if (!Number.isInteger(rows) || rows < DIFF_VALID.ROWS_MIN || rows > DIFF_VALID.ROWS_MAX) {
    return { valid: false, error: `行数必须在 ${DIFF_VALID.ROWS_MIN}~${DIFF_VALID.ROWS_MAX} 之间` };
  }
  if (!Number.isInteger(cols) || cols < DIFF_VALID.COLS_MIN || cols > DIFF_VALID.COLS_MAX) {
    return { valid: false, error: `列数必须在 ${DIFF_VALID.COLS_MIN}~${DIFF_VALID.COLS_MAX} 之间` };
  }
  const maxMines = rows * cols - DIFF_VALID.SAFE_ZONE;
  if (!Number.isInteger(mines) || mines < 1 || mines > maxMines) {
    return { valid: false, error: `雷数必须在 1~${maxMines} 之间（保证首次点击安全）` };
  }
  return { valid: true, rows, cols, mines };
}

// 确认创建
document.getElementById('create-confirm-btn')?.addEventListener('click', async () => {
  const v = validateCreateParams();
  if (!v.valid) {
    createError.innerText = v.error;
    createError.style.display = 'block';
    return;
  }

  hideCreateError();
  createModal.style.display = 'none';

  try {
    const data = await createRoom({ rows: v.rows, cols: v.cols, mineCount: v.mines });
    console.log('创建房间成功', data);

    initRoomBoard(data.board, data.rows, data.cols, data.mines);
    setRoomInfo(data.room_id, data.token, 'host');

    // 动态调整 Canvas 尺寸
    const r = data.rows || 9;
    const c = data.cols || 9;
    resizeCanvasForMode(r, c);

    showWaitingRoom(data.room_id);

    if (socket.connected) {
      socket.emit('join_room_event', { room_id: data.room_id, token: data.token });
    } else {
      socket.once('connect', () => {
        socket.emit('join_room_event', { room_id: data.room_id, token: data.token });
      });
    }
  } catch (err: any) {
    showToast('创建房间失败: ' + (err.message || '网络异常，请稍后重试'));
    returnToLobby();
  }
});

// 取消
document.getElementById('create-cancel-btn')?.addEventListener('click', () => {
  createModal.style.display = 'none';
  hideCreateError();
});

createBtn.addEventListener('click', () => {
  // 重置状态
  selectedCreateDiff = 'easy';
  isCreateCustom = false;
  createCustomPanel.style.display = 'none';
  hideCreateError();
  updateCreateDiffHighlight();
  createModal.style.display = 'flex';
});

joinBtn.addEventListener('click', async () => {
  const roomId = roomIdInput.value.trim().toUpperCase();
  if (!roomId) { showToast('请输入房间码'); return; }
  try {
    const data = await joinRoom(roomId);
    console.log('加入房间成功', data);

    initRoomBoard(data.board, data.rows, data.cols, data.mines);
    setRoomInfo(roomId, data.token, 'guest');

    // 动态调整 Canvas 尺寸
    const r = data.rows || 9;
    const c = data.cols || 9;
    resizeCanvasForMode(r, c);

    showWaitingRoom(roomId);

    if (socket.connected) {
      socket.emit('join_room_event', { room_id: roomId, token: data.token });
    } else {
      socket.once('connect', () => {
        socket.emit('join_room_event', { room_id: roomId, token: data.token });
      });
    }
  } catch (err: any) {
    const msg = err.message || '网络异常，请稍后重试';
    showToast('加入失败: ' + msg);
    // 房间不存在或已满时自动回大厅
    returnToLobby();
  }
});

const soloBtn = document.getElementById('solo-btn');
if (soloBtn) {
  soloBtn.addEventListener('click', () => {
    startSoloGame();
  });
}

// 旗子模式按钮
document.getElementById('flag-mode-btn')?.addEventListener('click', () => {
  toggleFlagMode();
});

socket.on('game_started', (data) => {
  console.log('游戏开始！', data);
  updateGameFromServer({ type: 'game_started', payload: data });
  resizeCanvasForMode(data.rows || 9, data.cols || 9);
  startGameUI();
});

socket.on('cell_revealed', (data: any) => {
  updateGameFromServer({ type: 'cell_revealed', payload: data });
});

socket.on('game_over', (data: any) => {
  updateGameFromServer({ type: 'game_over', payload: data });
});

socket.on('opponent_disconnected', (data: any) => {
  showDisconnectModal(!!data?.votes_cleared);
});

socket.on('turn_changed', (data: any) => {
  updateGameFromServer({ type: 'turn_changed', payload: data });
});

socket.on('rematch_waiting', (data: any) => {
  const isOpponent = data?.voter_sid !== socket.id;
  if (isOpponent) {
    updateRematchStatus('对手已发起再来一局', true);
  } else {
    updateRematchStatus(data.message || '等待中...');
  }
});

socket.on('rematch_votes_update', (data: any) => {
  handleRematchVotesUpdate(data?.votes || 0);
});

socket.on('game_restarted', (data: { board: number[][], current_turn: string, host_sid?: string, rows?: number, cols?: number, mines?: number, total_safe_cells?: number }) => {
  const r = data.rows || 9;
  const c = data.cols || 9;
  const m = data.mines || 10;
  initRoomBoard(data.board, r, c, m);
  const state = getGameState();
  state.status = GameStatus.Playing;
  state.gameMode = 'playing';
  state.startTime = Date.now() + state.serverTimeOffset;
  state.myTurn = data.current_turn === socket.id;
  state.lastResult = null;
  state.myProgress = 0;
  state.opponentProgress = 0;
  state.totalMines = m;
  state.rows = r;
  state.cols = c;
  state.isHost = data.host_sid === socket.id;
  state.godMode = false;
  state.totalSafeCells = data.total_safe_cells ?? (r * c - m);
  // 动态调整 Canvas 尺寸
  resizeCanvasForMode(r, c);
  waitingDiv.style.display = 'none';
  gameUIDiv.style.display = 'block';

  hideResultModal();

  drawBoard();
  startUIUpdates();
});

socket.on('player_joined', (data: any) => {
  console.log('玩家加入:', data.message);
  if (waitingMessage) {
    waitingMessage.innerText = data.message;
  }
});

socket.on('waiting_for_opponent', (data: any) => {
  console.log('等待对手...', data.message);
});

socket.on('error', (msg: any) => {
  console.error('Socket error:', msg);
  const errMsg = msg?.msg || '连接出错';
  showToast(errMsg, 3000);
  // 对于严重错误（房间不存在、凭据无效等），自动回大厅
  if (errMsg.includes('房间不存在') || errMsg.includes('凭据无效') || errMsg.includes('刷新')) {
    setTimeout(() => returnToLobby(), 1500);
  }
});

let canvasBound = false;
function bindCanvasEventsOnce() {
  if (canvasBound) return;
  canvasBound = true;

  bindCanvasInputEvents(
    handleCellClick,
    handleCellRightClick,
    () => currentCellSize,
  );
}

/** 返回大厅：隐藏所有游戏 UI，回到 lobby */
export function returnToLobby() {
  hideResultModal();
  gameStarted = false;
  canvasBound = false;
  waitingDiv.style.display = 'none';
  gameUIDiv.style.display = 'none';
  const flagBar = document.getElementById('flag-mode-bar');
  if (flagBar) flagBar.style.display = 'none';
  const dfBar = document.getElementById('solo-difficulty-bar');
  if (dfBar) dfBar.style.display = 'none';
  const custPanel = document.getElementById('custom-difficulty-panel');
  if (custPanel) custPanel.style.display = 'none';
  lobbyDiv.style.display = '';
}

// ---- 上帝模式：仅房主可用，纯本地视觉效果，无网络通信 ----

export function toggleGodMode() {
  const state = getGameState();
  if (!state.isHost) {
    console.log('[GodMode] 仅房主可用');
    return;
  }
  enableGodMode();
}

// 挂载到全局供控制台调用（同样受 isHost 限制）
(window as any).toggleGodMode = toggleGodMode;

// 快捷键 Ctrl+Shift+G（同样受 isHost 限制）
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'G' || e.code === 'KeyG')) {
    e.preventDefault();
    e.stopPropagation();
    toggleGodMode();
  }
});

// ---- Socket 事件列表（用于离开房间时清理） ----
const socketEvents = [
  'game_started', 'cell_revealed', 'game_over', 'opponent_disconnected',
  'turn_changed', 'rematch_waiting', 'rematch_votes_update', 'game_restarted',
  'player_joined', 'waiting_for_opponent', 'error'
];

export function cleanupSocket() {
  socketEvents.forEach(ev => socket.off(ev));
  console.log('[Socket] 所有对战事件已解绑');
}