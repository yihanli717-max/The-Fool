import { ROOM_PHASES, type RoomState } from "./domain.ts";
import { followUpById, interestById, themeById } from "./fixtures/connection.ts";

export function assertRoomInvariants(state: RoomState): void {
  if (!ROOM_PHASES.includes(state.phase)) {
    throw new Error(`Invalid room phase: ${String(state.phase)}`);
  }
  if (state.players.length < 1 || state.players.length > 4) {
    throw new Error("Room must contain between one and four participants");
  }
  if (state.players.filter((player) => player.isHost).length !== 1) {
    throw new Error("Room must contain exactly one host");
  }
  if (new Set(state.players.map((player) => player.id)).size !== state.players.length) {
    throw new Error("Player IDs must be unique");
  }

  const playerIds = new Set(state.players.map((player) => player.id));
  for (const [playerId, card] of Object.entries(state.preferenceCards)) {
    if (!playerIds.has(playerId)) {
      throw new Error("Preference card belongs to an unknown participant");
    }
    if (card.interestIds.some((interestId) => !interestById(interestId))) {
      throw new Error("Preference card contains an unknown interest");
    }
  }
  for (const [playerId, themeId] of Object.entries(state.reflectionVotes)) {
    if (!playerIds.has(playerId) || !themeById(themeId)) {
      throw new Error("Reflection vote is invalid");
    }
  }
  for (const [playerId, optionId] of Object.entries(state.followUpSelections)) {
    if (!playerIds.has(playerId) || !followUpById(optionId)) {
      throw new Error("Follow-up selection is invalid");
    }
  }

  const needsTheme = ["conversation", "reflection", "follow-up", "reveal"].includes(state.phase);
  if (needsTheme && !state.initialTheme) {
    throw new Error("An active connection stage requires an initial theme");
  }
  if (!needsTheme && state.initialTheme) {
    throw new Error("Initial theme cannot exist outside a connection stage");
  }
  if (state.phase === "reveal" && !state.reveal) {
    throw new Error("Reveal phase requires a computed group reveal");
  }
  if (state.phase !== "reveal" && state.reveal) {
    throw new Error("Reveal data cannot exist before reveal phase");
  }
}
