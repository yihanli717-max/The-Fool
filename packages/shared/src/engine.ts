import type {
  ActivityConfig,
  Player,
  PreferenceCard,
  PublicRoomView,
  RoomAction,
  RoomState,
} from "./domain.ts";
import {
  followUpById,
  interestById,
  themeById,
} from "./fixtures/connection.ts";
import { calculateGroupReveal, selectInitialTheme } from "./reveal.ts";

export class DomainError extends Error {
  override readonly name = "DomainError";
}

export function createRoom(
  room: { id: string; code: string },
  host: Omit<Player, "isHost">,
  activity: ActivityConfig,
): RoomState {
  return {
    ...room,
    phase: "lobby",
    activity,
    players: [{ ...host, isHost: true }],
    preferenceCards: {},
    initialTheme: null,
    reflectionVotes: {},
    followUpSelections: {},
    reveal: null,
    revision: 0,
  };
}

function requirePhase(state: RoomState, expected: RoomState["phase"]): void {
  if (state.phase !== expected) {
    throw new DomainError(`Expected phase ${expected}, received action during ${state.phase}`);
  }
}

function requirePlayer(state: RoomState, playerId: string): Player {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new DomainError(`Unknown player ${playerId}`);
  }
  return player;
}

function requireHost(state: RoomState, playerId: string): void {
  if (!requirePlayer(state, playerId).isHost) {
    throw new DomainError("Only the host can perform this action");
  }
}

function requireAllSubmitted(
  state: RoomState,
  submissions: Record<string, unknown>,
  stage: string,
): void {
  if (state.players.some((player) => !submissions[player.id])) {
    throw new DomainError(`Wait until everyone has completed ${stage}`);
  }
}

function validatePreferenceCard(card: PreferenceCard): void {
  if (card.interestIds.length > 3) {
    throw new DomainError("Choose up to three interests");
  }
  if (new Set(card.interestIds).size !== card.interestIds.length) {
    throw new DomainError("Choose each interest only once");
  }
  for (const interestId of card.interestIds) {
    if (!interestById(interestId)) {
      throw new DomainError(`Unknown interest ${interestId}`);
    }
  }
}

function nextRevision(state: RoomState): number {
  return state.revision + 1;
}

export function applyAction(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case "player.join": {
      requirePhase(state, "lobby");
      if (state.players.length >= 4) {
        throw new DomainError("A room supports at most four participants");
      }
      if (state.players.some((player) => player.id === action.player.id)) {
        throw new DomainError(`Player ${action.player.id} already joined`);
      }
      if (action.player.isHost) {
        throw new DomainError("A joined participant cannot replace the room host");
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

    case "activity.start": {
      requirePhase(state, "lobby");
      requireHost(state, action.actorPlayerId);
      if (state.players.length < 2) {
        throw new DomainError("At least two participants are required");
      }
      return { ...state, phase: "preferences", revision: nextRevision(state) };
    }

    case "preferences.submit": {
      requirePhase(state, "preferences");
      requirePlayer(state, action.actorPlayerId);
      validatePreferenceCard(action.card);
      if (state.preferenceCards[action.actorPlayerId]) {
        throw new DomainError("Your preference card was already submitted");
      }
      return {
        ...state,
        preferenceCards: {
          ...state.preferenceCards,
          [action.actorPlayerId]: action.card,
        },
        revision: nextRevision(state),
      };
    }

    case "conversation.begin": {
      requirePhase(state, "preferences");
      requireHost(state, action.actorPlayerId);
      requireAllSubmitted(state, state.preferenceCards, "the preference card");
      return {
        ...state,
        phase: "conversation",
        initialTheme: selectInitialTheme(
          state.activity,
          Object.values(state.preferenceCards),
        ),
        revision: nextRevision(state),
      };
    }

    case "reflection.open": {
      requirePhase(state, "conversation");
      requireHost(state, action.actorPlayerId);
      return { ...state, phase: "reflection", revision: nextRevision(state) };
    }

    case "reflection.submit": {
      requirePhase(state, "reflection");
      requirePlayer(state, action.actorPlayerId);
      if (!themeById(action.themeId)) {
        throw new DomainError(`Unknown connection theme ${action.themeId}`);
      }
      if (state.reflectionVotes[action.actorPlayerId]) {
        throw new DomainError("Your reflection was already submitted");
      }
      const reflectionVotes = {
        ...state.reflectionVotes,
        [action.actorPlayerId]: action.themeId,
      };
      const allSubmitted = state.players.every((player) => reflectionVotes[player.id]);
      return {
        ...state,
        reflectionVotes,
        phase: allSubmitted ? "follow-up" : state.phase,
        revision: nextRevision(state),
      };
    }

    case "follow-up.submit": {
      requirePhase(state, "follow-up");
      requirePlayer(state, action.actorPlayerId);
      if (!followUpById(action.followUpOptionId)) {
        throw new DomainError(`Unknown follow-up option ${action.followUpOptionId}`);
      }
      if (state.followUpSelections[action.actorPlayerId]) {
        throw new DomainError("Your follow-up choice was already submitted");
      }
      const followUpSelections = {
        ...state.followUpSelections,
        [action.actorPlayerId]: action.followUpOptionId,
      };
      const allSubmitted = state.players.every((player) => followUpSelections[player.id]);
      const nextState: RoomState = {
        ...state,
        followUpSelections,
        phase: allSubmitted ? "reveal" : state.phase,
        revision: nextRevision(state),
      };
      return allSubmitted
        ? { ...nextState, reveal: calculateGroupReveal(nextState) }
        : nextState;
    }

    case "activity.restart": {
      requirePhase(state, "reveal");
      requireHost(state, action.actorPlayerId);
      return {
        ...state,
        phase: "lobby",
        preferenceCards: {},
        initialTheme: null,
        reflectionVotes: {},
        followUpSelections: {},
        reveal: null,
        revision: nextRevision(state),
      };
    }
  }
}

export function projectPublicRoom(state: RoomState): PublicRoomView {
  const { preferenceCards, reflectionVotes, followUpSelections, ...publicState } = state;
  return {
    ...publicState,
    preferenceSubmissionPlayerIds: Object.keys(preferenceCards),
    reflectionSubmissionPlayerIds: Object.keys(reflectionVotes),
    followUpSubmissionPlayerIds: Object.keys(followUpSelections),
  };
}
