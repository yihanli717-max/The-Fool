import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { z } from "zod";

import {
  applyAction,
  createRoom,
  DomainError,
  projectPublicRoom,
  strandedIsland,
  type ItemChoice,
  type RoomAction,
  type RoomState,
} from "@common-ground/shared";

const port = Number(process.env.PORT ?? 3001);
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const app = express();
app.use(cors({ origin: clientOrigin }));
app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: clientOrigin },
});

const rooms = new Map<string, RoomState>();

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name is required")
  .max(24, "Display name must be 24 characters or fewer");
const codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,8}$/);
const itemChoiceSchema = z.object({
  itemId: z.string(),
  priorityId: z.string(),
});
const choicesSchema = z.array(itemChoiceSchema);

type Session = {
  roomCode: string;
  playerId: string;
};

function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 5 }, () =>
      alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join("");
  } while (rooms.has(code));
  return code;
}

function emitRoomState(room: RoomState): void {
  io.to(room.code).emit("room.state", projectPublicRoom(room));
}

function sendError(socket: { emit: (event: string, message: string) => void }, error: unknown): void {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  socket.emit("room.error", message);
}

function currentSession(socket: { data: { session?: Session } }): Session {
  const session = socket.data.session;
  if (!session) {
    throw new DomainError("Join a room before taking part in the game");
  }
  return session;
}

function submitAction(
  socket: Parameters<typeof io.on>[1] extends (socket: infer SocketType) => unknown
    ? SocketType
    : never,
  action: RoomAction,
): void {
  try {
    const session = currentSession(socket);
    const room = rooms.get(session.roomCode);
    if (!room) {
      throw new DomainError("This room no longer exists");
    }
    const nextRoom = applyAction(room, action);
    rooms.set(nextRoom.code, nextRoom);
    emitRoomState(nextRoom);
  } catch (error) {
    sendError(socket, error);
  }
}

io.on("connection", (socket) => {
  socket.on("room.create", (payload: unknown) => {
    const parsed = z.object({ displayName: displayNameSchema }).safeParse(payload);
    if (!parsed.success) {
      sendError(socket, parsed.error.issues[0]?.message ?? "Invalid room request");
      return;
    }

    const code = generateRoomCode();
    const playerId = randomUUID();
    const room = createRoom(
      { id: randomUUID(), code },
      { id: playerId, displayName: parsed.data.displayName, connected: true },
      strandedIsland,
    );
    rooms.set(code, room);
    socket.data.session = { roomCode: code, playerId } satisfies Session;
    socket.join(code);
    socket.emit("room.joined", { roomCode: code, playerId, state: projectPublicRoom(room) });
    emitRoomState(room);
  });

  socket.on("room.join", (payload: unknown) => {
    const parsed = z
      .object({ roomCode: codeSchema, displayName: displayNameSchema })
      .safeParse(payload);
    if (!parsed.success) {
      sendError(socket, parsed.error.issues[0]?.message ?? "Invalid join request");
      return;
    }

    const room = rooms.get(parsed.data.roomCode);
    if (!room) {
      sendError(socket, "Room not found");
      return;
    }

    const playerId = randomUUID();
    try {
      const nextRoom = applyAction(room, {
        type: "player.join",
        player: {
          id: playerId,
          displayName: parsed.data.displayName,
          isHost: false,
          connected: true,
        },
      });
      rooms.set(nextRoom.code, nextRoom);
      socket.data.session = { roomCode: nextRoom.code, playerId } satisfies Session;
      socket.join(nextRoom.code);
      socket.emit("room.joined", {
        roomCode: nextRoom.code,
        playerId,
        state: projectPublicRoom(nextRoom),
      });
      emitRoomState(nextRoom);
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("room.resume", (payload: unknown) => {
    const parsed = z
      .object({ roomCode: codeSchema, playerId: z.string().uuid() })
      .safeParse(payload);
    if (!parsed.success) {
      sendError(socket, "Invalid resume request");
      return;
    }
    const room = rooms.get(parsed.data.roomCode);
    if (!room || !room.players.some((player) => player.id === parsed.data.playerId)) {
      sendError(socket, "Room session not found");
      return;
    }

    const nextRoom = applyAction(room, {
      type: "player.connection.set",
      actorPlayerId: parsed.data.playerId,
      connected: true,
    });
    rooms.set(nextRoom.code, nextRoom);
    socket.data.session = {
      roomCode: nextRoom.code,
      playerId: parsed.data.playerId,
    } satisfies Session;
    socket.join(nextRoom.code);
    socket.emit("room.joined", {
      roomCode: nextRoom.code,
      playerId: parsed.data.playerId,
      state: projectPublicRoom(nextRoom),
    });
    emitRoomState(nextRoom);
  });

  socket.on("game.start", () => {
    try {
      const { playerId } = currentSession(socket);
      submitAction(socket, { type: "game.start", actorPlayerId: playerId });
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("game.restart", () => {
    try {
      const { playerId } = currentSession(socket);
      submitAction(socket, { type: "game.restart", actorPlayerId: playerId });
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("private-choice.submit", (payload: unknown) => {
    const parsed = z
      .object({ choices: choicesSchema, primaryPriorityId: z.string() })
      .safeParse(payload);
    if (!parsed.success) {
      sendError(socket, "Invalid private-choice submission");
      return;
    }
    try {
      const { playerId } = currentSession(socket);
      submitAction(socket, {
        type: "private-choice.submit",
        actorPlayerId: playerId,
        choices: parsed.data.choices as ItemChoice[],
        primaryPriorityId: parsed.data.primaryPriorityId,
      });
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("group-choice.submit", (payload: unknown) => {
    const parsed = z.object({ choices: choicesSchema }).safeParse(payload);
    if (!parsed.success) {
      sendError(socket, "Invalid group-choice submission");
      return;
    }
    try {
      const { playerId } = currentSession(socket);
      submitAction(socket, {
        type: "group-choice.submit",
        actorPlayerId: playerId,
        choices: parsed.data.choices as ItemChoice[],
      });
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("peer-prediction.submit", (payload: unknown) => {
    const parsed = z
      .object({ targetPlayerId: z.string().uuid(), predictedPriorityId: z.string() })
      .safeParse(payload);
    if (!parsed.success) {
      sendError(socket, "Invalid peer-prediction submission");
      return;
    }
    try {
      const { playerId } = currentSession(socket);
      submitAction(socket, {
        type: "peer-prediction.submit",
        actorPlayerId: playerId,
        targetPlayerId: parsed.data.targetPlayerId,
        predictedPriorityId: parsed.data.predictedPriorityId,
      });
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("disconnect", () => {
    const session = socket.data.session as Session | undefined;
    if (!session) {
      return;
    }
    const room = rooms.get(session.roomCode);
    if (!room || !room.players.some((player) => player.id === session.playerId)) {
      return;
    }
    const nextRoom = applyAction(room, {
      type: "player.connection.set",
      actorPlayerId: session.playerId,
      connected: false,
    });
    rooms.set(nextRoom.code, nextRoom);
    emitRoomState(nextRoom);
  });
});

httpServer.listen(port, () => {
  console.log(`Common Ground server listening on http://localhost:${port}`);
});
