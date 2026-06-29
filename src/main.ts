import { createRoom, joinRoom, getRoomState } from './api';
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
  showOpponentOfflineModal,
} from './game';
import { drawBoard, enableGodMode } from './renderer';
import { startUIUpdates } from './ui';
import { CELL_SIZE, getDynamicCellSize, DIFFICULTY_PRESETS, DIFF_VALID, type DifficultyKey } from './constants';
import { GameStatus, LS_KEYS, CellState } from './types';
import './style.css';
import { startSoloGame, initSoloUI, tryRestoreSoloGame, clearSoloSave, isSoloActive, goBackToLobby } from './solo';
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

// ---- 房间缓存工具 ----
function setRoomCache(roomId: string, token: string, role: 'host' | 'guest') {
  try {
    localStorage.setItem(LS_KEYS.ROOM_ID, roomId);
    localStorage.setItem(LS_KEYS.ROOM_TOKEN, token);
    localStorage.setItem('minesweeper_room_role', role);
    // URL 参数同步
    const url = new URL(window.location.href);
    url.searchParams.set('roomId', roomId);
    window.history.replaceState({}, '', url.toString());
  } catch { /* noop */ }
}

function clearRoomCache() {
  try {
    localStorage.removeItem(LS_KEYS.ROOM_ID);
    localStorage.removeItem(LS_KEYS.ROOM_TOKEN);
    localStorage.removeItem('minesweeper_room_role');
    // 清除 URL 参数
    const url = new URL(window.location.href);
    url.searchParams.delete('roomId');
    window.history.replaceState({}, '', url.toString());
  } catch { /* noop */ }
}

// ---- 多人房间恢复 ----
async function tryRestoreMultiplayerRoom(roomId: string): Promise<boolean> {
  try {
    const token = localStorage.getItem(LS_KEYS.ROOM_TOKEN);
    const role = localStorage.getItem('minesweeper_room_role');
    if (!token) {
      console.log('[Reconnect] 无有效 token，跳过多人恢复');
      return false;
    }

    // 请求后端获取房间当前状态
    console.log('[Reconnect] 请求房间状态:', roomId);
    const state = await getRoomState(roomId);
    if (!state) return false;

    // 重建棋盘
    initRoomBoard(state.board, state.rows, state.cols, state.mines);
    const gs = getGameState();
    gs.roomId = roomId;
    gs.token = token;
    gs.role = (role === 'host' || role === 'guest') ? role : 'guest';
    gs.isHost = role === 'host';
    gs.rows = state.rows;
    gs.cols = state.cols;
    gs.totalMines = state.mines;

    // 标记已翻开的格子
    for (const [r, c] of state.revealed_cells) {
      const cell = gs.board[r]?.[c];
      if (cell && cell.state !== CellState.Revealed) {
        cell.state = CellState.Revealed;
      }
    }
    // 重新计算进度（已翻开格子数对半分，实际由后续事件精确更新）
    gs.myProgress = Math.floor(state.revealed_cells.length / 2);
    gs.opponentProgress = state.revealed_cells.length - gs.myProgress;

    // 设置 Canvas 尺寸
    resizeCanvasForMode(state.rows, state.cols);

    if (state.game_started) {
      gs.status = GameStatus.Playing;
      gs.gameMode = 'playing';
      gs.currentTurn = state.current_turn;
      // myTurn 初始设为 false，由后端 reconnect 时广播的 turn_changed 事件修正
      // （state.current_turn 是旧 sid，无法和新的 socket.id 直接对比）
      gs.myTurn = false;

      // 显示游戏 UI
      waitingDiv.style.display = 'none';
      lobbyDiv.style.display = 'none';
      gameUIDiv.style.display = 'block';
      const flagBar = document.getElementById('flag-mode-bar');
      if (flagBar) flagBar.style.display = '';
      const mineCountEl = document.getElementById('mine-count');
      if (mineCountEl && !(mineCountEl as any).__godModeBound) {
        (mineCountEl as any).__godModeBound = true;
        mineCountEl.addEventListener('click', () => toggleGodMode());
      }

      gameStarted = true;
      drawBoard();
      startUIUpdates();
      bindCanvasEventsOnce();
    } else {
      // 游戏未开始，回到等待室
      gs.status = GameStatus.Waiting;
      gs.gameMode = 'room';
      showWaitingRoom(roomId);
    }

    // 重新加入 Socket 房间
    if (socket.connected) {
      socket.emit('join_room_event', { room_id: roomId, token });
    } else {
      socket.once('connect', () => {
        socket.emit('join_room_event', { room_id: roomId, token });
      });
    }

    console.log('[Reconnect] 多人房间恢复成功:', roomId);
    return true;
  } catch (err: any) {
    console.warn('[Reconnect] 多人房间恢复失败:', err?.message || err);
    clearRoomCache();
    return false;
  }
}

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
    setRoomCache(data.room_id, data.token, 'host');

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
    setRoomInfo(roomId, data.token, data.role || 'guest');
    setRoomCache(roomId, data.token, data.role || 'guest');

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
    clearRoomCache(); // 进入单机时清除多人缓存
    startSoloGame();
  });
}

// 旗子模式按钮
document.getElementById('flag-mode-btn')?.addEventListener('click', () => {
  toggleFlagMode();
});

// 返回大厅按钮
document.getElementById('back-to-lobby-btn')?.addEventListener('click', () => {
  if (isSoloActive) {
    // 单机模式：直接清空缓存回大厅
    goBackToLobby();
  } else {
    // 多人模式：通知后端退出房间
    const gs = getGameState();
    if (socket.connected && gs.roomId) {
      socket.emit('leave_room', { room_id: gs.roomId, token: gs.token });
    }
    // 清除缓存 + URL 参数
    clearRoomCache();
    clearSoloSave();
    returnToLobby();
  }
});

socket.on('game_started', (data) => {
  console.log('游戏开始！', data);
  // 重新初始化棋盘（支持玩家退局后重连二次开局场景）
  if (data.board) {
    initRoomBoard(data.board, data.rows, data.cols, data.mines);
  }
  updateGameFromServer({ type: 'game_started', payload: data });
  resizeCanvasForMode(data.rows || 9, data.cols || 9);
  // 允许二次触发 game_started（退局重连场景不卡死）
  gameStarted = false;
  canvasBound = false;
  hideResultModal();
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

// 对手主动点击「返回大厅」退出房间（区别于断线重连）
socket.on('opponent_offline', (data: any) => {
  console.log('[OpponentOffline] 对手已退出房间:', data);
  const msg = data?.message || '对手已退出房间';
  showOpponentOfflineModal(msg);
});

// ---- 玩家重连上线：对手刷新后重新加入房间 ----
socket.on('player_reonline', (data: any) => {
  console.log('[Reonline] 对手已重连上线:', data?.message);
  hideResultModal();
  showToast(data?.message || '对手已重新上线', 2000);
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

socket.on('game_restarted', (data: { board: number[][], current_turn: string, host_sid?: string, rows?: number, cols?: number, mines?: number }) => {
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
  state.godMode = false;  // 新一局重置上帝模式
  state.opponentOffline = false;  // 重置对手离线标记
  clearSoloSave(); // 清除单机缓存避免冲突
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
  // 检测房间已满（2/2），隐藏对手离线弹窗准备开局
  if (data.message && data.message.includes('2/2')) {
    hideResultModal();
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
  clearRoomCache();
  clearSoloSave();
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

// ---- 页面初始化：自动恢复对局状态 ----
(async function initPage() {
  // 短暂隐藏大厅避免闪屏
  lobbyDiv.style.display = 'none';

  // 1. 检测 URL 中的 roomId → 尝试恢复多人房间
  const params = new URLSearchParams(window.location.search);
  const urlRoomId = params.get('roomId');
  if (urlRoomId) {
    const restored = await tryRestoreMultiplayerRoom(urlRoomId);
    if (restored) return;
    // 恢复失败，清除残留缓存
    clearRoomCache();
  }

  // 2. 检测 localStorage 中的单机缓存 → 尝试恢复单机对局
  if (tryRestoreSoloGame()) {
    initSoloUI();
    return;
  }

  // 3. 没有可恢复的对局，显示大厅
  lobbyDiv.style.display = '';
})();

// ---- Socket 事件列表（用于离开房间时清理） ----
const socketEvents = [
  'game_started', 'cell_revealed', 'game_over', 'opponent_disconnected',
  'turn_changed', 'rematch_waiting', 'rematch_votes_update', 'game_restarted',
  'player_joined', 'waiting_for_opponent', 'error', 'player_reonline',
  'opponent_offline',
];

export function cleanupSocket() {
  socketEvents.forEach(ev => socket.off(ev));
  console.log('[Socket] 所有对战事件已解绑');
}