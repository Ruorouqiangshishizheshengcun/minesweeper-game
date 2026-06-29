import { io } from "socket.io-client";

// 开发环境走 Vite 代理（空字符串=同源），生产环境指向线上后端
const SOCKET_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_SOCKET_URL || 'https://minesweeper-backend-production.up.railway.app')
  : '';

const socket = io(SOCKET_URL, {
  path: '/socket.io',
  transports: ["websocket", "polling"],  // WebSocket 优先，减少 polling HMR 冲突
  forceNew: true,     // 每次初始化使用全新连接，避免 Vite HMR 导致旧连接回调崩溃
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

socket.on("connect", () => {
  console.log("✅ Socket 连接成功，sid：", socket.id);
});
socket.on("connect_error", (err) => {
  console.error("❌ Socket 连接失败：", err.message);
});
socket.on("reconnect_attempt", (attempt) => {
  console.log(`🔄 Socket 重连尝试 #${attempt}`);
});
socket.on("reconnect", () => {
  console.log("🔁 Socket 重连成功，sid：", socket.id);
});

// Vite HMR 清理：模块被替换时断开旧 Socket，防止 v[w] is not a function 报错
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    socket.removeAllListeners();
    socket.disconnect();
    console.log('[HMR] 旧 Socket 已清理');
  });
}

export default socket;