import { ROOM_PHASES, type RoomState } from "./domain.ts";

export function assertRoomInvariants(state: RoomState): void {
  if (!ROOM_PHASES.includes(state.phase)) {
    throw new Error(`Invalid room phase: ${String(state.phase)}`);
  }
  if (state.players.length < 1 || state.players.length > 4) {
    throw new Error("Room must contain between one and four players");
  }
  if (state.players.filter((player) => player.isHost).length !== 1) {
    throw new Error("Room must contain exactly one host");
  }
  if (new Set(state.players.map((player) => player.id)).size !== state.players.length) {
    throw new Error("Player IDs must be unique");
  }

  const playerIds = new Set(state.players.map((player) => player.id));
  for (const playerId of Object.keys(state.privateSelections)) {
    if (!playerIds.has(playerId)) {
      throw new Error(`Private selection belongs to unknown player ${playerId}`);
    }
  }
  for (const prediction of Object.values(state.peerPredictions)) {
    if (!playerIds.has(prediction.authorPlayerId)) {
      throw new Error("Prediction author must belong to the room");
    }
    if (!playerIds.has(prediction.targetPlayerId)) {
      throw new Error("Prediction target must belong to the room");
    }
    if (prediction.authorPlayerId === prediction.targetPlayerId) {
      throw new Error("Prediction author and target must differ");
    }
  }

  if (state.phase === "reveal" && !state.reveal) {
    throw new Error("Reveal phase requires a computed reveal");
  }
  if (state.phase !== "reveal" && state.reveal) {
    throw new Error("Reveal data cannot exist before reveal phase");
  }
}
