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