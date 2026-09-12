import { io, type Socket } from "socket.io-client";

export const socket: Socket = io(
  import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001",
  { autoConnect: true },
);
