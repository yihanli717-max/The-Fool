import { TAROT_ROOM_PHASES, type TarotResponse, type TarotRoomState } from "./domain.ts";
import {
  pixelCharacterIds,
  tarotCardById,
} from "./fixtures.ts";
import { tarotPredictionKey } from "./engine.ts";

function responseOrder(response: TarotResponse): number {
  return response.roundIndex * 100 + response.eventIndex;
}

export function assertTarotRoomInvariants(state: TarotRoomState): void {
  if (!TAROT_ROOM_PHASES.includes(state.phase)) {
    throw new Error(`Invalid Tarot room phase: ${String(state.phase)}`);
  }
  if (state.players.length < 1 || state.players.length > 10) {
    throw new Error("A Tarot room must contain between one and ten players");
  }
  if (state.players.filter((player) => player.isHost).length !== 1) {
    throw new Error("A Tarot room must contain exactly one host");
  }
  if (new Set(state.players.map((player) => player.id)).size !== state.players.length) {
    throw new Error("Player IDs must be unique");
  }
  if (
    new Set(state.players.map((player) => player.characterId)).size !==
    state.players.length
  ) {
    throw new Error("Pixel characters must be unique");
  }
  for (const player of state.players) {
    if (
      !pixelCharacterIds.includes(
        player.characterId as (typeof pixelCharacterIds)[number],
      )
    ) {
      throw new Error("Every player must use a known pixel character");
    }
  }

  if (state.phase === "lobby" && state.currentRoundId !== null) {
    throw new Error("The lobby cannot have an active round");
  }
  if (state.phase !== "lobby" && state.currentRoundId === null) {
    throw new Error("An active game phase requires a current round");
  }
  if (
    state.currentRoundId !== null &&
    !state.rounds.some((round) => round.id === state.currentRoundId)
  ) {
    throw new Error("Current round ID must reference an existing round");
  }

  const playerIds = new Set(state.players.map((player) => player.id));
  const eventIds = new Set<string>();
  for (const [index, round] of state.rounds.entries()) {
    if (round.index !== index + 1) {
      throw new Error("Round indexes must be sequential");
    }
    if (round.cardIds.length !== 4 || new Set(round.cardIds).size !== 4) {
      throw new Error("Every round must reference four distinct cards");
    }
    if (round.cardIds.some((cardId) => !tarotCardById(cardId))) {
      throw new Error("A round references an unknown Tarot card");
    }
    if (
      new Set(round.activePlayerIds).size !== round.activePlayerIds.length ||
      round.activePlayerIds.some((playerId) => !playerIds.has(playerId))
    ) {
      throw new Error("Round active-player IDs must be unique known players");
    }
    if (round.events.length !== 0 && round.events.length !== 4) {
      throw new Error("A generated round must have four events");
    }
    if ((round.events.length === 0) !== (round.eventSource === null)) {
      throw new Error("Generated events and generation source must coexist");
    }
    if (
      round.events.length > 0 &&
      (round.currentEventIndex < 0 ||
        round.currentEventIndex >= round.events.length)
    ) {
      throw new Error("Current event index is outside the generated round");
    }
    for (const event of round.events) {
      if (eventIds.has(event.id)) {
        throw new Error("Event IDs must be unique across rounds");
      }
      eventIds.add(event.id);
      if (
        event.roundId !== round.id ||
        !round.cardIds.includes(event.cardId)
      ) {
        throw new Error("Event does not belong to its containing round");
      }
    }
  }

  const allResponses: TarotResponse[] = [];
  for (const [eventId, byPlayer] of Object.entries(state.responses)) {
    if (!eventIds.has(eventId)) {
      throw new Error("Response references an unknown event");
    }
    for (const [playerId, response] of Object.entries(byPlayer)) {
      if (!playerIds.has(playerId) || response.playerId !== playerId) {
        throw new Error("Response references an unknown player");
      }
      const event = state.rounds
        .flatMap((round) => round.events)
        .find((candidate) => candidate.id === eventId);
      const option = event?.options.find(
        (candidate) => candidate.id === response.optionId,
      );
      if (
        !event ||
        !option ||
        response.eventId !== event.id ||
        response.cardId !== event.cardId ||
        response.score !== option.score
      ) {
        throw new Error("Response does not match its event option");
      }
      allResponses.push(response);
    }
  }

  const expectedLatest = new Map<string, TarotResponse>();
  for (const response of allResponses) {
    const key = `${response.playerId}::${response.cardId}`;
    const previous = expectedLatest.get(key);
    if (!previous || responseOrder(response) > responseOrder(previous)) {
      expectedLatest.set(key, response);
    }
  }
  for (const [playerId, byCard] of Object.entries(state.latestResponses)) {
    for (const [cardId, response] of Object.entries(byCard)) {
      if (expectedLatest.get(`${playerId}::${cardId}`) !== response) {
        throw new Error("Latest response index is stale or inconsistent");
      }
    }
  }
  if (
    [...expectedLatest.values()].length !==
    Object.values(state.latestResponses).flatMap((byCard) =>
      Object.values(byCard),
    ).length
  ) {
    throw new Error("Latest response index is incomplete");
  }

  const predictionIds = new Set<string>();
  for (const [key, prediction] of Object.entries(state.predictions)) {
    if (predictionIds.has(prediction.id)) {
      throw new Error("Prediction IDs must be unique");
    }
    predictionIds.add(prediction.id);
    if (
      key !==
      tarotPredictionKey(
        prediction.predictorId,
        prediction.targetPlayerId,
        prediction.cardId,
      )
    ) {
      throw new Error("Prediction is stored under the wrong key");
    }
    if (
      !playerIds.has(prediction.predictorId) ||
      !playerIds.has(prediction.targetPlayerId) ||
      prediction.predictorId === prediction.targetPlayerId
    ) {
      throw new Error("Prediction participants are invalid");
    }
    const groundTruth =
      state.latestResponses[prediction.targetPlayerId]?.[prediction.cardId];
    if (
      !groundTruth ||
      prediction.actualScore !== groundTruth.score ||
      prediction.matches !==
        (prediction.predictedScore === prediction.actualScore)
    ) {
      throw new Error("Prediction comparison is inconsistent");
    }
    if (prediction.matches && prediction.continuation !== null) {
      throw new Error("A matching prediction cannot have a continuation");
    }
    if (
      (prediction.continuation === null) !==
      (prediction.continuationSource === null)
    ) {
      throw new Error("Continuation and generation source must coexist");
    }
  }
}
