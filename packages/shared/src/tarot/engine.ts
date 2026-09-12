import type {
  CompletedEventReveal,
  TarotCard,
  TarotEvent,
  TarotPlayer,
  TarotPlayerView,
  TarotPrediction,
  TarotResponse,
  TarotRoomAction,
  TarotRoomPhase,
  TarotRoomState,
  TarotRound,
  VisibleTarotEvent,
  ViewerPredictionResult,
} from "./domain.ts";
import { pixelCharacterIds, tarotCardById } from "./fixtures.ts";
import {
  assertContinuationCopySafe,
} from "./generators.ts";
import { parseContinuation, parseEventBatch, isTarotScore } from "./schemas.ts";

export class TarotDomainError extends Error {
  override readonly name = "TarotDomainError";
}

export function tarotPredictionKey(
  predictorId: string,
  targetPlayerId: string,
  cardId: string,
): string {
  return `${predictorId}::${targetPlayerId}::${cardId}`;
}

export function createTarotRoom(
  room: { id: string; code: string },
  host: Omit<TarotPlayer, "isHost">,
): TarotRoomState {
  if (!pixelCharacterIds.includes(host.characterId as (typeof pixelCharacterIds)[number])) {
    throw new TarotDomainError("Unknown pixel character");
  }
  return {
    ...room,
    phase: "lobby",
    players: [{ ...host, isHost: true }],
    rounds: [],
    currentRoundId: null,
    responses: {},
    latestResponses: {},
    predictions: {},
    revision: 0,
  };
}

function nextRevision(state: TarotRoomState): number {
  return state.revision + 1;
}

function requirePhase(
  state: TarotRoomState,
  expected: TarotRoomPhase,
): void {
  if (state.phase !== expected) {
    throw new TarotDomainError(
      `Expected phase ${expected}, received action during ${state.phase}`,
    );
  }
}

function requirePlayer(state: TarotRoomState, playerId: string): TarotPlayer {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new TarotDomainError(`Unknown player ${playerId}`);
  return player;
}

function requireConnectedPlayer(
  state: TarotRoomState,
  playerId: string,
): TarotPlayer {
  const player = requirePlayer(state, playerId);
  if (!player.connected) {
    throw new TarotDomainError("A disconnected player cannot perform this action");
  }
  return player;
}

function requireHost(state: TarotRoomState, playerId: string): void {
  if (!requireConnectedPlayer(state, playerId).isHost) {
    throw new TarotDomainError("Only the host can perform this action");
  }
}

function validateCardIds(cardIds: string[]): void {
  if (cardIds.length !== 4 || new Set(cardIds).size !== 4) {
    throw new TarotDomainError("A round requires four distinct Tarot cards");
  }
  for (const cardId of cardIds) {
    if (!tarotCardById(cardId)) {
      throw new TarotDomainError(`Unknown Tarot card ${cardId}`);
    }
  }
}

export function currentTarotRound(state: TarotRoomState): TarotRound {
  const round = state.rounds.find(
    (candidate) => candidate.id === state.currentRoundId,
  );
  if (!round) throw new TarotDomainError("The room has no active Tarot round");
  return round;
}

function currentTarotEvent(state: TarotRoomState): TarotEvent {
  const round = currentTarotRound(state);
  const event = round.events[round.currentEventIndex];
  if (!event) throw new TarotDomainError("The round has no current event");
  return event;
}

function replaceRound(
  state: TarotRoomState,
  replacement: TarotRound,
): TarotRound[] {
  return state.rounds.map((round) =>
    round.id === replacement.id ? replacement : round,
  );
}

function createRound(
  state: TarotRoomState,
  roundId: string,
  cardIds: string[],
): TarotRound {
  validateCardIds(cardIds);
  if (state.rounds.some((round) => round.id === roundId)) {
    throw new TarotDomainError(`Round ${roundId} already exists`);
  }
  const activePlayerIds = state.players
    .filter((player) => player.connected)
    .map((player) => player.id);
  if (activePlayerIds.length < 2) {
    throw new TarotDomainError("At least two connected players are required");
  }
  return {
    id: roundId,
    index: state.rounds.length + 1,
    cardIds: [...cardIds],
    events: [],
    eventSource: null,
    currentEventIndex: 0,
    activePlayerIds,
  };
}

function responseFor(
  state: TarotRoomState,
  eventId: string,
  playerId: string,
): TarotResponse | undefined {
  return state.responses[eventId]?.[playerId];
}

function allActivePlayersAnswered(
  state: TarotRoomState,
  round: TarotRound,
  eventId: string,
): boolean {
  return round.activePlayerIds.every((playerId) =>
    Boolean(responseFor(state, eventId, playerId)),
  );
}

function eventById(state: TarotRoomState, eventId: string): TarotEvent | undefined {
  return state.rounds
    .flatMap((round) => round.events)
    .find((event) => event.id === eventId);
}

function optionTextForResponse(
  state: TarotRoomState,
  response: TarotResponse,
): string {
  const event = eventById(state, response.eventId);
  const option = event?.options.find(
    (candidate) => candidate.id === response.optionId,
  );
  if (!option) throw new TarotDomainError("Unable to resolve response option");
  return option.text;
}

export function applyTarotAction(
  state: TarotRoomState,
  action: TarotRoomAction,
): TarotRoomState {
  switch (action.type) {
    case "player.join": {
      requirePhase(state, "lobby");
      if (state.players.length >= 10) {
        throw new TarotDomainError("A room supports at most ten players");
      }
      if (state.players.some((player) => player.id === action.player.id)) {
        throw new TarotDomainError(`Player ${action.player.id} already joined`);
      }
      if (action.player.isHost) {
        throw new TarotDomainError("A member cannot replace the room host");
      }
      if (
        !pixelCharacterIds.includes(
          action.player.characterId as (typeof pixelCharacterIds)[number],
        )
      ) {
        throw new TarotDomainError("Unknown pixel character");
      }
      if (
        state.players.some(
          (player) => player.characterId === action.player.characterId,
        )
      ) {
        throw new TarotDomainError("Pixel characters must be unique in a room");
      }
      return {
        ...state,
        players: [...state.players, action.player],
        revision: nextRevision(state),
      };
    }

    case "player.connection.set": {
      requirePlayer(state, action.actorPlayerId);
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === action.actorPlayerId
            ? { ...player, connected: action.connected }
            : player,
        ),
        revision: nextRevision(state),
      };
    }

    case "stage1.start": {
      requirePhase(state, "lobby");
      requireHost(state, action.actorPlayerId);
      const round = createRound(state, action.roundId, action.cardIds);
      return {
        ...state,
        phase: "generating",
        rounds: [...state.rounds, round],
        currentRoundId: round.id,
        revision: nextRevision(state),
      };
    }

    case "round.events.generated": {
      requirePhase(state, "generating");
      const round = currentTarotRound(state);
      if (round.id !== action.roundId) {
        throw new TarotDomainError("Generated events target the wrong round");
      }
      const events = parseEventBatch(
        { events: action.events },
        round.id,
        round.cardIds,
      );
      const replacement = {
        ...round,
        events,
        eventSource: action.source,
        currentEventIndex: 0,
      };
      return {
        ...state,
        phase: "answering",
        rounds: replaceRound(state, replacement),
        revision: nextRevision(state),
      };
    }

    case "event.answer": {
      requirePhase(state, "answering");
      requireConnectedPlayer(state, action.actorPlayerId);
      const round = currentTarotRound(state);
      if (!round.activePlayerIds.includes(action.actorPlayerId)) {
        throw new TarotDomainError("This player is not active in the round");
      }
      const event = currentTarotEvent(state);
      if (event.id !== action.eventId) {
        throw new TarotDomainError("An answer must target the current event");
      }
      if (responseFor(state, event.id, action.actorPlayerId)) {
        throw new TarotDomainError("This event was already answered");
      }
      const option = event.options.find(
        (candidate) => candidate.id === action.optionId,
      );
      if (!option) throw new TarotDomainError("Unknown event option");
      const response: TarotResponse = {
        playerId: action.actorPlayerId,
        eventId: event.id,
        roundId: round.id,
        roundIndex: round.index,
        eventIndex: round.currentEventIndex,
        cardId: event.cardId,
        optionId: option.id,
        score: option.score,
      };
      const responses = {
        ...state.responses,
        [event.id]: {
          ...state.responses[event.id],
          [action.actorPlayerId]: response,
        },
      };
      const latestResponses = {
        ...state.latestResponses,
        [action.actorPlayerId]: {
          ...state.latestResponses[action.actorPlayerId],
          [event.cardId]: response,
        },
      };
      const nextState = { ...state, responses, latestResponses };
      return {
        ...nextState,
        phase: allActivePlayersAnswered(nextState, round, event.id)
          ? "event-reveal"
          : state.phase,
        revision: nextRevision(state),
      };
    }

    case "event.advance": {
      requirePhase(state, "event-reveal");
      requireHost(state, action.actorPlayerId);
      const round = currentTarotRound(state);
      const nextEventIndex = round.currentEventIndex + 1;
      const hasNextEvent = nextEventIndex < round.events.length;
      const replacement = {
        ...round,
        currentEventIndex: hasNextEvent
          ? nextEventIndex
          : round.currentEventIndex,
      };
      return {
        ...state,
        phase: hasNextEvent ? "answering" : "discussion",
        rounds: replaceRound(state, replacement),
        revision: nextRevision(state),
      };
    }

    case "round.continue-without-player": {
      requirePhase(state, "answering");
      requireHost(state, action.actorPlayerId);
      const excluded = requirePlayer(state, action.playerId);
      if (excluded.connected) {
        throw new TarotDomainError(
          "The host can only continue without a disconnected player",
        );
      }
      const round = currentTarotRound(state);
      if (!round.activePlayerIds.includes(excluded.id)) {
        throw new TarotDomainError("The player is already inactive in this round");
      }
      const replacement = {
        ...round,
        activePlayerIds: round.activePlayerIds.filter(
          (playerId) => playerId !== excluded.id,
        ),
      };
      const event = currentTarotEvent(state);
      return {
        ...state,
        phase: allActivePlayersAnswered(state, replacement, event.id)
          ? "event-reveal"
          : state.phase,
        rounds: replaceRound(state, replacement),
        revision: nextRevision(state),
      };
    }

    case "round.revise": {
      requirePhase(state, "discussion");
      requireHost(state, action.actorPlayerId);
      const round = createRound(state, action.roundId, action.cardIds);
      return {
        ...state,
        phase: "generating",
        rounds: [...state.rounds, round],
        currentRoundId: round.id,
        revision: nextRevision(state),
      };
    }

    case "stage2.start": {
      requirePhase(state, "discussion");
      requireHost(state, action.actorPlayerId);
      if (state.players.filter((player) => player.connected).length < 2) {
        throw new TarotDomainError(
          "At least two connected players are required for predictions",
        );
      }
      return {
        ...state,
        phase: "predictions",
        revision: nextRevision(state),
      };
    }

    case "prediction.submit": {
      requirePhase(state, "predictions");
      requireConnectedPlayer(state, action.actorPlayerId);
      requireConnectedPlayer(state, action.targetPlayerId);
      if (action.actorPlayerId === action.targetPlayerId) {
        throw new TarotDomainError("A player cannot predict themselves");
      }
      if (!tarotCardById(action.cardId)) {
        throw new TarotDomainError("Unknown Tarot card");
      }
      if (!isTarotScore(action.predictedScore)) {
        throw new TarotDomainError("Prediction score must be 1, 2, or 3");
      }
      const groundTruth =
        state.latestResponses[action.targetPlayerId]?.[action.cardId];
      if (!groundTruth) {
        throw new TarotDomainError(
          "The target has no ground truth for this Tarot card",
        );
      }
      if (
        Object.values(state.predictions).some(
          (prediction) =>
            prediction.id === action.predictionId &&
            tarotPredictionKey(
              prediction.predictorId,
              prediction.targetPlayerId,
              prediction.cardId,
            ) !==
              tarotPredictionKey(
                action.actorPlayerId,
                action.targetPlayerId,
                action.cardId,
              ),
        )
      ) {
        throw new TarotDomainError("Prediction ID already belongs to another key");
      }
      const prediction: TarotPrediction = {
        id: action.predictionId,
        predictorId: action.actorPlayerId,
        targetPlayerId: action.targetPlayerId,
        cardId: action.cardId,
        predictedScore: action.predictedScore,
        actualScore: groundTruth.score,
        matches: action.predictedScore === groundTruth.score,
        continuation: null,
        continuationSource: null,
      };
      const key = tarotPredictionKey(
        prediction.predictorId,
        prediction.targetPlayerId,
        prediction.cardId,
      );
      return {
        ...state,
        predictions: { ...state.predictions, [key]: prediction },
        revision: nextRevision(state),
      };
    }

    case "continuation.generated": {
      requirePhase(state, "predictions");
      requireConnectedPlayer(state, action.actorPlayerId);
      const entry = Object.entries(state.predictions).find(
        ([, prediction]) => prediction.id === action.predictionId,
      );
      if (!entry) throw new TarotDomainError("Unknown prediction");
      const [key, prediction] = entry;
      if (prediction.predictorId !== action.actorPlayerId) {
        throw new TarotDomainError(
          "Only the predictor can receive this continuation",
        );
      }
      if (prediction.matches) {
        throw new TarotDomainError(
          "A matching prediction does not need a continuation",
        );
      }
      if (prediction.continuation) {
        throw new TarotDomainError("Continuation was already generated");
      }
      const groundTruth =
        state.latestResponses[prediction.targetPlayerId]?.[prediction.cardId];
      if (!groundTruth) throw new TarotDomainError("Ground truth is unavailable");
      const continuation = parseContinuation(action.continuation);
      assertContinuationCopySafe(
        continuation,
        optionTextForResponse(state, groundTruth),
      );
      return {
        ...state,
        predictions: {
          ...state.predictions,
          [key]: {
            ...prediction,
            continuation,
            continuationSource: action.source,
          },
        },
        revision: nextRevision(state),
      };
    }
  }
}

function visibleEvent(event: TarotEvent): VisibleTarotEvent {
  return {
    ...event,
    options: event.options.map(({ id, text }) => ({ id, text })),
  };
}

function completedRevealsForRound(
  state: TarotRoomState,
  round: TarotRound,
): CompletedEventReveal[] {
  return round.events.flatMap((event) => {
    if (!allActivePlayersAnswered(state, round, event.id)) return [];
    const choices = state.players.flatMap((player) => {
      const response = responseFor(state, event.id, player.id);
      if (!response) return [];
      return [
        {
          playerId: player.id,
          displayName: player.displayName,
          optionId: response.optionId,
          optionText: optionTextForResponse(state, response),
        },
      ];
    });
    return [{ eventId: event.id, cardId: event.cardId, title: event.title, choices }];
  });
}

function viewerPredictionResult(
  prediction: TarotPrediction,
  card: TarotCard,
): ViewerPredictionResult {
  if (prediction.matches) {
    return {
      predictionId: prediction.id,
      targetPlayerId: prediction.targetPlayerId,
      cardId: prediction.cardId,
      status: "matched",
      message: `You know them in this Tarot domain: you noticed a similar approach to ${card.scoreAxis.label.toLowerCase()}.`,
    };
  }
  if (!prediction.continuation) {
    return {
      predictionId: prediction.id,
      targetPlayerId: prediction.targetPlayerId,
      cardId: prediction.cardId,
      status: "continuation-loading",
    };
  }
  return {
    predictionId: prediction.id,
    targetPlayerId: prediction.targetPlayerId,
    cardId: prediction.cardId,
    status: "conversation-ready",
    continuation: prediction.continuation,
  };
}

export function projectTarotPlayerView(
  state: TarotRoomState,
  viewerPlayerId: string,
): TarotPlayerView {
  requirePlayer(state, viewerPlayerId);
  const round =
    state.currentRoundId === null
      ? null
      : state.rounds.find((candidate) => candidate.id === state.currentRoundId) ??
        null;
  const event = round?.events[round.currentEventIndex] ?? null;
  const viewerResponse = event
    ? responseFor(state, event.id, viewerPlayerId)
    : undefined;
  const currentRound = round
    ? {
        id: round.id,
        index: round.index,
        cardIds: [...round.cardIds],
        currentEventIndex: round.currentEventIndex,
        activePlayerCount: round.activePlayerIds.length,
        event: event ? visibleEvent(event) : null,
        viewerOptionId: viewerResponse?.optionId ?? null,
        submittedCount: event
          ? Object.keys(state.responses[event.id] ?? {}).filter((playerId) =>
              round.activePlayerIds.includes(playerId),
            ).length
          : 0,
        completedReveals: completedRevealsForRound(state, round),
      }
    : null;
  const predictionResults = Object.values(state.predictions)
    .filter((prediction) => prediction.predictorId === viewerPlayerId)
    .map((prediction) => {
      const card = tarotCardById(prediction.cardId);
      if (!card) throw new TarotDomainError("Prediction references an unknown card");
      return viewerPredictionResult(prediction, card);
    });
  return {
    id: state.id,
    code: state.code,
    phase: state.phase,
    players: state.players.map((player) => ({ ...player })),
    revision: state.revision,
    currentRound,
    predictionResults,
  };
}
