import { io } from "socket.io-client";

// 开发环境走 Vite 代理（空字符串=同源），生产环境指向线上后端
const SOCKET_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_SOCKET_URL || 'https://minesweeper-backend-production.up.railway.app')
  : '';

const socket = io(SOCKET_URL, {
  path: '/socket.io',
  transports: ["polling", "websocket"],
});

socket.on("connect", () => {
  console.log("✅ Socket 连接成功，sid：", socket.id);
});
socket.on("connect_error", (err) => {
  console.error("❌ Socket 连接失败：", err.message);
});

export default socket;