import { GameState, Cell, CellState, GameStatus } from './types';
import { drawBoard } from './renderer';
import { updateUI } from './ui';
import socket from './socket';

const gameState: GameState = {
  board: [],
  roomId: null,
  token: null,
  role: null,
  status: GameStatus.Idle,
  flagCount: 0,
  totalMines: 10,
  startTime: null,
  elapsedTime: 0,
  opponentProgress: 0,
  myProgress: 0,
  totalNonMine: 0,
  socketConnected: false,
  currentTurn: null,
  gameMode: 'lobby',
  myTurn: false,
  lastResult: null,
  serverTimeOffset: 0,
  rows: 9,
  cols: 9,
  isHost: false,
  godMode: false,
};

export function getGameState() {
  return gameState;
}

export function initRoomBoard(boardData: number[][], rows?: number, cols?: number, totalMines?: number) {
  const board: Cell[][] = [];
  let nonMineCount = 0;
  for (let r = 0; r < boardData.length; r++) {
    board[r] = [];
    for (let c = 0; c < boardData[r].length; c++) {
      const val = boardData[r][c];
      board[r][c] = {
        row: r,
        col: c,
        hasMine: val === -2,
        adjacentMines: val,
        state: CellState.Hidden,
      };
      if (val !== -2) nonMineCount++;
    }
  }
  gameState.board = board;
  gameState.totalNonMine = nonMineCount;
  gameState.myProgress = 0;
  gameState.opponentProgress = 0;
  if (rows !== undefined) gameState.rows = rows;
  if (cols !== undefined) gameState.cols = cols;
  if (totalMines !== undefined) gameState.totalMines = totalMines;
}

export function setRoomInfo(roomId: string, token: string, role: 'host' | 'guest') {
  gameState.roomId = roomId;
  gameState.token = token;
  gameState.role = role;
  gameState.gameMode = 'room';
  gameState.status = GameStatus.Waiting;
}

export function updateGameFromServer(event: { type: string; payload?: any }) {
  const { type, payload } = event;
  console.log('收到事件:', type, payload);

  switch (type) {
    case 'game_started':
      gameState.status = GameStatus.Playing;
      gameState.serverTimeOffset = (payload.start_time || Date.now()) - Date.now();
      gameState.startTime = Date.now() + gameState.serverTimeOffset;
      gameState.currentTurn = payload.current_turn || null;
      gameState.myTurn = payload.current_turn === socket.id;
      gameState.gameMode = 'playing';
      gameState.lastResult = null;
      gameState.totalMines = payload.mines || 10;
      gameState.rows = payload.rows || 9;
      gameState.cols = payload.cols || 9;
      gameState.isHost = payload.host_sid === socket.id;
      gameState.godMode = false;  // 新游戏重置上帝模式
      break;

    case 'turn_changed':
      gameState.currentTurn = payload.current_turn || null;
      gameState.myTurn = payload.current_turn === socket.id;
      updateUI();
      break;

    case 'cell_revealed': {
      const { row, col, value, by } = payload;
      const cell = gameState.board[row]?.[col];
      if (!cell || cell.state === CellState.Revealed) return;

      cell.state = CellState.Revealed;
      cell.adjacentMines = value;
      cell.revealedBy = by;  // 记录揭开者，区分己方/对手格子

      if (by === socket.id) {
        gameState.myProgress++;
      } else {
        gameState.opponentProgress++;
      }
      drawBoard([{ row, col }]);
      updateUI();
      break;
    }

    case 'game_over': {
      // 新协议：winner_sid / loser_sid 明确标识胜负双方
      const iWon = payload.winner_sid === socket.id;
      gameState.status = iWon ? GameStatus.Won : GameStatus.Lost;
      gameState.gameMode = 'finished';
      gameState.myTurn = false;
      gameState.lastResult = {
        isWin: iWon,
        elapsed: gameState.startTime ? (Date.now() - gameState.startTime) / 1000 : 0,
        myProgress: gameState.myProgress,
        opponentProgress: gameState.opponentProgress,
      };
      drawBoard();
      showResultModal(gameState.lastResult);
      break;
    }

    case 'opponent_disconnected':
      // 已由 main.ts 直接处理，此处为兜底
      showDisconnectModal(true);
      break;

    default:
      break;
  }
}

export function handleCellClick(row: number, col: number) {
  if (gameState.gameMode !== 'playing') return;
  if (!gameState.myTurn) {
    showToast('⏳ 请等待对手操作');
    return;
  }
  const cell = gameState.board[row]?.[col];
  if (!cell || cell.state !== CellState.Hidden) return;
  socket.emit('cell_click', { row, col });
}

export function handleCellRightClick(row: number, col: number) {
  if (gameState.gameMode !== 'playing') return;
  if (!gameState.myTurn) {
    showToast('⏳ 请等待对手操作');
    return;
  }
  const cell = gameState.board[row]?.[col];
  if (!cell || cell.state === CellState.Revealed) return;
  // 本地切换标记状态，不发送网络请求
  cell.state = cell.state === CellState.Flagged ? CellState.Hidden : CellState.Flagged;
  drawBoard([{ row, col }]);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function showResultModal(result: { isWin: boolean; elapsed: number; myProgress: number; opponentProgress: number }) {
  gameState.lastResult = result;
  const modal = document.getElementById('game-over-modal')!;
  const title = document.getElementById('result-title')!;
  const detail = document.getElementById('result-detail')!;
  const rematchStatus = document.getElementById('rematch-status')!;
  const rematchBtn = document.getElementById('modal-rematch-btn')!;
  const cancelRematchBtn = document.getElementById('modal-cancel-rematch-btn')!;

  title.innerText = result.isWin ? '🎉 胜利！' : '💥 失败';
  detail.innerHTML =
    `⏱ 用时 <b>${formatTime(result.elapsed)}</b><br>` +
    `🔍 你已揭开 <b>${result.myProgress}</b> / ${gameState.totalNonMine} 格<br>` +
    `👤 对手揭开 <b>${result.opponentProgress}</b> / ${gameState.totalNonMine} 格`;
  rematchStatus.style.display = 'none';
  modal.style.display = 'flex';

  // 再来一局按钮
  rematchBtn.style.display = '';
  rematchBtn.onclick = () => {
    socket.emit('request_rematch', {});
    rematchBtn.style.display = 'none';
    cancelRematchBtn.style.display = '';
    rematchStatus.innerText = '⏳ 等待对手同意...';
    rematchStatus.style.display = 'block';
  };

  // 取消投票按钮（默认隐藏）
  cancelRematchBtn.style.display = 'none';
  cancelRematchBtn.onclick = () => {
    socket.emit('cancel_rematch', {});
    rematchBtn.style.display = '';
    cancelRematchBtn.style.display = 'none';
    rematchStatus.style.display = 'none';
  };

  const backBtn = document.getElementById('back-lobby-btn');
  if (backBtn) {
    backBtn.onclick = () => {
      modal.style.display = 'none';
      // 离开时刷新页面重置所有 Socket 状态
      location.reload();
    };
  }
}

export function hideResultModal() {
  const modal = document.getElementById('game-over-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

export function updateRematchStatus(message: string, isOpponentVote = false) {
  const rematchStatus = document.getElementById('rematch-status');
  const rematchBtn = document.getElementById('modal-rematch-btn')!;
  const cancelRematchBtn = document.getElementById('modal-cancel-rematch-btn')!;
  if (rematchStatus) {
    rematchStatus.innerHTML = isOpponentVote
      ? `✅ ${message}`
      : message;
    rematchStatus.style.display = 'block';
  }
  // 如果对手也投票了（但还不够2票），保留取消按钮
  if (!isOpponentVote) {
    rematchBtn.style.display = 'none';
    cancelRematchBtn.style.display = '';
  }
}

export function handleRematchVotesUpdate(votes: number) {
  const rematchStatus = document.getElementById('rematch-status');
  const rematchBtn = document.getElementById('modal-rematch-btn')!;
  const cancelRematchBtn = document.getElementById('modal-cancel-rematch-btn')!;
  const modal = document.getElementById('game-over-modal');
  if (!modal || modal.style.display === 'none') return;

  if (votes === 0) {
    // 所有投票被清除（对手取消或断线）
    rematchBtn.style.display = '';
    cancelRematchBtn.style.display = 'none';
    if (rematchStatus) rematchStatus.style.display = 'none';
  }
}

/** 刷新页面（离开房间的推荐方式） */
export function leaveRoom() {
  location.reload();
}

export function showToast(msg: string, duration = 2500) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerText = msg;
  toast.style.display = 'block';
  toast.style.opacity = '1';
  clearTimeout((toast as any)._timeout);
  (toast as any)._timeout = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 300);
  }, duration);
}

export function showDisconnectModal(votesCleared = false) {
  const modal = document.getElementById('game-over-modal')!;
  const title = document.getElementById('result-title')!;
  const detail = document.getElementById('result-detail')!;
  const rematchStatus = document.getElementById('rematch-status')!;
  const rematchBtn = document.getElementById('modal-rematch-btn')!;
  const cancelRematchBtn = document.getElementById('modal-cancel-rematch-btn')!;
  const backBtn = document.getElementById('back-lobby-btn')!;

  title.innerText = '🔌 对手已断开连接';
  let info = '对方离开了房间';
  if (votesCleared) {
    info += '<br>🔄 投票已自动清除';
  }
  detail.innerHTML = info;
  rematchStatus.style.display = 'none';
  rematchBtn.style.display = 'none';
  cancelRematchBtn.style.display = 'none';
  modal.style.display = 'flex';

  // 保留房间，等待对手重连或返回大厅
  backBtn.innerText = '返回大厅';
  backBtn.onclick = () => {
    modal.style.display = 'none';
    location.reload();
  };
}