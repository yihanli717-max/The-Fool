import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { z } from "zod";

import {
  applyTarotAction,
  assertTarotRoomInvariants,
  createTarotRoom,
  demoPixelCharacterAssets,
  generateContinuationWithFallback,
  generateEventsWithFallback,
  pixelCharacterIds,
  projectTarotPlayerView,
  selectTarotCardIds,
  tarotCardById,
  type TarotEvent,
  type TarotRoomAction,
  type TarotRoomState,
} from "@common-ground/shared";

import { createRuntimeGenerators } from "./openaiGenerators.ts";

const port = Number(process.env.PORT ?? 3001);
const configuredOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const localNetworkOrigin =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}):5173$/;

function isAllowedOrigin(origin: string | undefined): boolean {
  return !origin || configuredOrigins.includes(origin) || localNetworkOrigin.test(origin);
}

const corsOrigin = (
  origin: string | undefined,
  callback: (error: Error | null, allowed?: boolean) => void,
) => {
  const allowed = isAllowedOrigin(origin);
  callback(allowed ? null : new Error("Origin is not allowed"), allowed);
};

const runtime = createRuntimeGenerators();
const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(
  "/assets/tarot",
  express.static(fileURLToPath(new URL("../../../Tarot Images/", import.meta.url))),
);
app.use(
  "/assets/characters",
  express.static(fileURLToPath(new URL("../../../pixel characters/", import.meta.url))),
);
app.get("/health", (_request, response) => {
  response.json({ status: "ok", aiMode: runtime.mode, model: runtime.model });
});

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: corsOrigin } });
const rooms = new Map<string, TarotRoomState>();

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Nickname is required")
  .max(24, "Nickname must be 24 characters or fewer");
const codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,8}$/);
const optionIdSchema = z.enum(["A", "B", "C"]);
const scoreSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

type Session = { roomCode: string; playerId: string };
type AppSocket = Parameters<Parameters<typeof io.on>[1]>[0];

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

function availableCharacterId(room?: TarotRoomState): string {
  const assigned = new Set(room?.players.map((player) => player.characterId) ?? []);
  const available = pixelCharacterIds.find((characterId) => !assigned.has(characterId));
  if (!available) throw new Error("This room has no available pixel characters");
  return available;
}

function emitRoomState(room: TarotRoomState): void {
  for (const client of io.sockets.sockets.values()) {
    const session = client.data.session as Session | undefined;
    if (session?.roomCode === room.code) {
      client.emit("room.state", projectTarotPlayerView(room, session.playerId));
    }
  }
}

function sendError(socket: AppSocket, error: unknown): void {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "Unexpected server error";
  socket.emit("room.error", message);
}

function currentSession(socket: AppSocket): Session {
  const session = socket.data.session as Session | undefined;
  if (!session) throw new Error("Join a room before taking part");
  return session;
}

function roomForSession(socket: AppSocket): {
  session: Session;
  room: TarotRoomState;
} {
  const session = currentSession(socket);
  const room = rooms.get(session.roomCode);
  if (!room) throw new Error("This room no longer exists");
  return { session, room };
}

function commitAction(room: TarotRoomState, action: TarotRoomAction): TarotRoomState {
  const nextRoom = applyTarotAction(room, action);
  assertTarotRoomInvariants(nextRoom);
  rooms.set(nextRoom.code, nextRoom);
  emitRoomState(nextRoom);
  return nextRoom;
}

function eventById(room: TarotRoomState, eventId: string): TarotEvent {
  const event = room.rounds
    .flatMap((round) => round.events)
    .find((candidate) => candidate.id === eventId);
  if (!event) throw new Error("The original event is unavailable");
  return event;
}

async function populateRound(roomCode: string, roundId: string): Promise<void> {
  const room = rooms.get(roomCode);
  const round = room?.rounds.find((candidate) => candidate.id === roundId);
  if (!room || !round || room.phase !== "generating") return;
  const cards = round.cardIds.map((cardId) => {
    const card = tarotCardById(cardId);
    if (!card) throw new Error(`Unknown Tarot card ${cardId}`);
    return card;
  });
  const generated = await generateEventsWithFallback(runtime.eventGenerator, {
    roundId,
    cards,
  });
  console.log(`[room ${roomCode}] round ${roundId}: ${generated.source} events`);
  const latestRoom = rooms.get(roomCode);
  if (
    !latestRoom ||
    latestRoom.phase !== "generating" ||
    latestRoom.currentRoundId !== roundId
  ) {
    return;
  }
  commitAction(latestRoom, {
    type: "round.events.generated",
    roundId,
    ...generated,
  });
}

async function buildContinuation(
  roomCode: string,
  predictorId: string,
  predictionId: string,
): Promise<void> {
  const room = rooms.get(roomCode);
  const prediction = Object.values(room?.predictions ?? {}).find(
    (candidate) => candidate.id === predictionId,
  );
  if (!room || !prediction || prediction.matches) return;
  const response = room.latestResponses[prediction.targetPlayerId]?.[prediction.cardId];
  const card = tarotCardById(prediction.cardId);
  if (!response || !card) return;
  const originalEvent = eventById(room, response.eventId);
  const targetActualOption = originalEvent.options.find(
    (option) => option.id === response.optionId,
  );
  if (!targetActualOption) return;
  const usedTopics = room.rounds
    .flatMap((round) => round.events)
    .filter((event) => event.cardId === prediction.cardId)
    .flatMap((event) => [event.title, event.question]);
  const generated = await generateContinuationWithFallback(
    runtime.continuationGenerator,
    {
      card,
      originalEvent,
      targetActualOption: {
        id: targetActualOption.id,
        text: targetActualOption.text,
      },
      targetScore: response.score,
      predictedScore: prediction.predictedScore,
      usedTopics,
    },
  );
  console.log(
    `[room ${roomCode}] prediction ${predictionId}: ${generated.source} continuation`,
  );
  const latestRoom = rooms.get(roomCode);
  const stillCurrent = Object.values(latestRoom?.predictions ?? {}).some(
    (candidate) => candidate.id === predictionId && !candidate.continuation,
  );
  if (!latestRoom || !stillCurrent) return;
  commitAction(latestRoom, {
    type: "continuation.generated",
    actorPlayerId: predictorId,
    predictionId,
    ...generated,
  });
}

io.on("connection", (socket) => {
  socket.on("room.create", (payload: unknown) => {
    const parsed = z.object({ displayName: displayNameSchema }).safeParse(payload);
    if (!parsed.success) {
      sendError(socket, parsed.error.issues[0]?.message ?? "Invalid room request");
      return;
    }
    try {
      const code = generateRoomCode();
      const playerId = randomUUID();
      const room = createTarotRoom(
        { id: randomUUID(), code },
        {
          id: playerId,
          displayName: parsed.data.displayName,
          connected: true,
          characterId: availableCharacterId(),
        },
      );
      assertTarotRoomInvariants(room);
      rooms.set(code, room);
      socket.data.session = { roomCode: code, playerId } satisfies Session;
      socket.join(code);
      socket.emit("room.joined", {
        roomCode: code,
        playerId,
        state: projectTarotPlayerView(room, playerId),
      });
      emitRoomState(room);
    } catch (error) {
      sendError(socket, error);
    }
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
    try {
      const playerId = randomUUID();
      const nextRoom = commitAction(room, {
        type: "player.join",
        player: {
          id: playerId,
          displayName: parsed.data.displayName,
          isHost: false,
          connected: true,
          characterId: availableCharacterId(room),
        },
      });
      socket.data.session = {
        roomCode: nextRoom.code,
        playerId,
      } satisfies Session;
      socket.join(nextRoom.code);
      socket.emit("room.joined", {
        roomCode: nextRoom.code,
        playerId,
        state: projectTarotPlayerView(nextRoom, playerId),
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
    try {
      const nextRoom = commitAction(room, {
        type: "player.connection.set",
        actorPlayerId: parsed.data.playerId,
        connected: true,
      });
      socket.data.session = parsed.data satisfies Session;
      socket.join(nextRoom.code);
      socket.emit("room.joined", {
        roomCode: nextRoom.code,
        playerId: parsed.data.playerId,
        state: projectTarotPlayerView(nextRoom, parsed.data.playerId),
      });
      emitRoomState(nextRoom);
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("stage1.start", async () => {
    try {
      const { session, room } = roomForSession(socket);
      const roundId = `round_${randomUUID().replaceAll("-", "")}`;
      commitAction(room, {
        type: "stage1.start",
        actorPlayerId: session.playerId,
        roundId,
        cardIds: selectTarotCardIds(4),
      });
      await populateRound(room.code, roundId);
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("event.answer", (payload: unknown) => {
    const parsed = z
      .object({ eventId: z.string().min(1), optionId: optionIdSchema })
      .safeParse(payload);
    if (!parsed.success) {
      sendError(socket, "Invalid event answer");
      return;
    }
    try {
      const { session, room } = roomForSession(socket);
      commitAction(room, {
        type: "event.answer",
        actorPlayerId: session.playerId,
        ...parsed.data,
      });
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("event.advance", () => {
    try {
      const { session, room } = roomForSession(socket);
      commitAction(room, {
        type: "event.advance",
        actorPlayerId: session.playerId,
      });
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("round.continue-without-player", (payload: unknown) => {
    const parsed = z.object({ playerId: z.string().uuid() }).safeParse(payload);
    if (!parsed.success) {
      sendError(socket, "Invalid player selection");
      return;
    }
    try {
      const { session, room } = roomForSession(socket);
      commitAction(room, {
        type: "round.continue-without-player",
        actorPlayerId: session.playerId,
        playerId: parsed.data.playerId,
      });
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("round.revise", async () => {
    try {
      const { session, room } = roomForSession(socket);
      const currentRound = room.rounds.find(
        (round) => round.id === room.currentRoundId,
      );
      if (!currentRound) throw new Error("There is no round to revise");
      const roundId = `round_${randomUUID().replaceAll("-", "")}`;
      commitAction(room, {
        type: "round.revise",
        actorPlayerId: session.playerId,
        roundId,
        cardIds: currentRound.cardIds,
      });
      await populateRound(room.code, roundId);
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("stage2.start", () => {
    try {
      const { session, room } = roomForSession(socket);
      commitAction(room, {
        type: "stage2.start",
        actorPlayerId: session.playerId,
      });
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("prediction.submit", async (payload: unknown) => {
    const parsed = z
      .object({
        targetPlayerId: z.string().uuid(),
        cardId: z.string().regex(/^[a-z0-9_]+$/),
        predictedScore: scoreSchema,
      })
      .safeParse(payload);
    if (!parsed.success) {
      sendError(socket, "Invalid prediction");
      return;
    }
    try {
      const { session, room } = roomForSession(socket);
      const predictionId = randomUUID();
      const nextRoom = commitAction(room, {
        type: "prediction.submit",
        predictionId,
        actorPlayerId: session.playerId,
        ...parsed.data,
      });
      const prediction = Object.values(nextRoom.predictions).find(
        (candidate) => candidate.id === predictionId,
      );
      if (prediction && !prediction.matches) {
        await buildContinuation(room.code, session.playerId, predictionId);
      }
    } catch (error) {
      sendError(socket, error);
    }
  });

  socket.on("disconnect", () => {
    const session = socket.data.session as Session | undefined;
    const room = session ? rooms.get(session.roomCode) : undefined;
    if (!session || !room) return;
    try {
      commitAction(room, {
        type: "player.connection.set",
        actorPlayerId: session.playerId,
        connected: false,
      });
    } catch {
      // The room may have advanced while the transport was closing.
    }
  });
});

httpServer.listen(port, () => {
  console.log(
    `Shared Mind server listening on http://localhost:${port} (${runtime.mode} mode, ${runtime.model})`,
  );
  console.log(`Loaded ${demoPixelCharacterAssets.length} pixel characters.`);
});
