// 开发环境走 Vite proxy（同源不用带域名），生产环境指向线上后端
const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || 'https://minesweeper-backend-production.up.railway.app')
  : '';

export interface CreateRoomParams {
  rows?: number;
  cols?: number;
  mineCount?: number;
}

export async function createRoom(params: CreateRoomParams = {}): Promise<{
  room_id: string;
  board: number[][];
  token: string;
  rows?: number;
  cols?: number;
  mines?: number;
}> {
  const res = await fetch(`${API_BASE}/create_room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ detail: '创建失败，请检查网络' }));
    throw new Error(errData.detail || '创建房间失败');
  }
  return res.json();
}

export async function joinRoom(roomId: string): Promise<{
  board: number[][];
  token: string;
  rows?: number;
  cols?: number;
  mines?: number;
}> {
  const res = await fetch(`${API_BASE}/join_room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: roomId }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ detail: '网络异常，请检查后端是否启动' }));
    throw new Error(errData.detail || '加入房间失败');
  }
  return res.json();
}

export interface RoomStateResponse {
  room_id: string;
  board: number[][];
  rows: number;
  cols: number;
  mines: number;
  game_started: boolean;
  current_turn: string | null;
  player_count: number;
  revealed_cells: [number, number][];
}

/** 获取房间完整状态（用于刷新恢复） */
export async function getRoomState(roomId: string): Promise<RoomStateResponse> {
  const res = await fetch(`${API_BASE}/room_state/${roomId}`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ detail: '房间不存在或已过期' }));
    throw new Error(errData.detail || '获取房间状态失败');
  }
  // 防御：确保响应是 JSON，避免 Vite 返回 HTML 时 res.json() 崩掉
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('房间不存在或已过期');
  }
  return res.json();
}