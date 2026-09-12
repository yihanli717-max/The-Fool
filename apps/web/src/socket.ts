import { io, type Socket } from "socket.io-client";

export const serverUrl =
  import.meta.env.VITE_SERVER_URL ?? `${window.location.protocol}//${window.location.hostname}:3001`;

export const socket: Socket = io(
  serverUrl,
  { autoConnect: true },
);
