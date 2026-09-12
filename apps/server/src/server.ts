import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { z } from "zod";

import {
  applyAction,
  CONNECTION_STYLES,
  createRoom,
  DomainError,
  EVENT_GOALS,
  EVENT_INTENTS,
  GROUPING_MODES,
  INTERACTION_STYLES,
  projectPublicRoom,
  type RoomAction,
  type RoomState,
} from "@common-ground/shared";

const port = Number(process.env.PORT ?? 3001);
const configuredOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const tailscaleOrigin = /^https?:\/\/100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}:5173$/;

function isAllowedOrigin(origin: string | undefined): boolean {
  return !origin || configuredOrigins.includes(origin) || tailscaleOrigin.test(origin);
}

const corsOrigin = (
  origin: string | undefined,
  callback: (error: Error | null, allowed?: boolean) => void,
) => {
  const allowed = isAllowedOrigin(origin);
  callback(allowed ? null : new Error("Origin is not allowed"), allowed);
};

const app = express();
app.use(cors({ origin: corsOrigin }));
app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: corsOrigin } });
const rooms = new Map<string, RoomState>();

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name is required")
  .max(24, "Display name must be 24 characters or fewer");
const codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,8}$/);
const activitySchema = z.object({
  title: z.string().trim().min(1, "Activity name is required").max(60),
  eventGoal: z.enum(EVENT_GOALS),
  groupingMode: z.enum(GROUPING_MODES),
});
const preferenceCardSchema = z.object({
  interestIds: z.array(z.string()).max(3),
  interactionStyle: z.enum(INTERACTION_STYLES).optional(),
  connectionStyle: z.enum(CONNECTION_STYLES).optional(),
  eventIntent: z.enum(EVENT_INTENTS).optional(),
});

type Session = { roomCode: string; playerId: string };

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
  if (!session) throw new DomainError("Join an activity before taking part");
  return session;
}

type AppSocket = Parameters<Parameters<typeof io.on>[1]>[0];

function submitAction(socket: AppSocket, action: RoomAction): void {
  try {
    const session = currentSession(socket);
    const room = rooms.get(session.roomCode);
    if (!room) throw new DomainError("This activity room no longer exists");
    const nextRoom = applyAction(room, action);
    rooms.set(nextRoom.code, nextRoom);
    emitRoomState(nextRoom);
  } catch (error) {
    sendError(socket, error);
  }
}

io.on("connection", (socket) => {
  socket.on("room.create", (payload: unknown) => {
    const parsed = z
      .object({ displayName: displayNameSchema, activity: activitySchema })
      .safeParse(payload);
    if (!parsed.success) {
      sendError(socket, parsed.error.issues[0]?.message ?? "Invalid activity request");
      return;
    }

    const code = generateRoomCode();
    const playerId = randomUUID();
    const room = createRoom(
      { id: randomUUID(), code },
      { id: playerId, displayName: parsed.data.displayName, connected: true },
      parsed.data.activity,
    );
    rooms.set(code, room);
    socket.data.session = { roomCode: code, playerId } satisfies Session;
    socket.join(code);
    socket.emit("room.joined", {
      roomCode: code,
      playerId,
      state: projectPublicRoom(room),
    });
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

  socket.on("activity.start", () => {
    try {
      submitAction(socket, { type: "activity.start", actorPlayerId: currentSession(socket).playerId });
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("preferences.submit", (payload: unknown) => {
    const parsed = z.object({ card: preferenceCardSchema }).safeParse(payload);
    if (!parsed.success) {
      sendError(socket, "Invalid preference card");
      return;
    }
    try {
      const card = {
        interestIds: parsed.data.card.interestIds,
        ...(parsed.data.card.interactionStyle
          ? { interactionStyle: parsed.data.card.interactionStyle }
          : {}),
        ...(parsed.data.card.connectionStyle
          ? { connectionStyle: parsed.data.card.connectionStyle }
          : {}),
        ...(parsed.data.card.eventIntent
          ? { eventIntent: parsed.data.card.eventIntent }
          : {}),
      };
      submitAction(socket, {
        type: "preferences.submit",
        actorPlayerId: currentSession(socket).playerId,
        card,
      });
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("conversation.begin", () => {
    try {
      submitAction(socket, { type: "conversation.begin", actorPlayerId: currentSession(socket).playerId });
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("reflection.open", () => {
    try {
      submitAction(socket, { type: "reflection.open", actorPlayerId: currentSession(socket).playerId });
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("reflection.submit", (payload: unknown) => {
    const parsed = z.object({ themeId: z.string() }).safeParse(payload);
    if (!parsed.success) {
      sendError(socket, "Invalid reflection response");
      return;
    }
    try {
      submitAction(socket, {
        type: "reflection.submit",
        actorPlayerId: currentSession(socket).playerId,
        themeId: parsed.data.themeId,
      });
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("follow-up.submit", (payload: unknown) => {
    const parsed = z.object({ followUpOptionId: z.string() }).safeParse(payload);
    if (!parsed.success) {
      sendError(socket, "Invalid follow-up response");
      return;
    }
    try {
      submitAction(socket, {
        type: "follow-up.submit",
        actorPlayerId: currentSession(socket).playerId,
        followUpOptionId: parsed.data.followUpOptionId,
      });
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("activity.restart", () => {
    try {
      submitAction(socket, { type: "activity.restart", actorPlayerId: currentSession(socket).playerId });
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("disconnect", () => {
    const session = socket.data.session as Session | undefined;
    if (!session) return;
    const room = rooms.get(session.roomCode);
    if (!room || !room.players.some((player) => player.id === session.playerId)) return;
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
