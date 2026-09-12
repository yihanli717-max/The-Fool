import type {
  ItemChoice,
  Player,
  PublicRoomView,
  RoomAction,
  RoomState,
  Scenario,
} from "./domain.ts";
import { calculateReveal } from "./reveal.ts";

export class DomainError extends Error {
  override readonly name = "DomainError";
}

export function createRoom(
  room: { id: string; code: string },
  host: Omit<Player, "isHost">,
  scenario: Scenario,
): RoomState {
  return {
    ...room,
    phase: "lobby",
    scenario,
    players: [{ ...host, isHost: true }],
    privateSelections: {},
    groupSelection: null,
    peerPredictions: {},
    reveal: null,
    revision: 0,
  };
}

function requirePhase(state: RoomState, expected: RoomState["phase"]): void {
  if (state.phase !== expected) {
    throw new DomainError(
      `Expected phase ${expected}, received action during ${state.phase}`,
    );
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

function validateChoices(
  choices: ItemChoice[],
  expectedCount: number,
  scenario: Scenario,
): void {
  if (choices.length !== expectedCount) {
    throw new DomainError(`Exactly ${expectedCount} choices are required`);
  }

  const validItems = new Set(scenario.items.map((item) => item.id));
  const validPriorities = new Set(
    scenario.priorities.map((priority) => priority.id),
  );
  const selectedItems = new Set<string>();

  for (const choice of choices) {
    if (!validItems.has(choice.itemId)) {
      throw new DomainError(`Unknown item ${choice.itemId}`);
    }
    if (!validPriorities.has(choice.priorityId)) {
      throw new DomainError(`Unknown priority ${choice.priorityId}`);
    }
    if (selectedItems.has(choice.itemId)) {
      throw new DomainError(`Duplicate item ${choice.itemId}`);
    }
    selectedItems.add(choice.itemId);
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
        throw new DomainError("A room supports at most four players");
      }
      if (state.players.some((player) => player.id === action.player.id)) {
        throw new DomainError(`Player ${action.player.id} already joined`);
      }
      if (action.player.isHost) {
        throw new DomainError("A joined player cannot replace the room host");
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

    case "game.start": {
      requirePhase(state, "lobby");
      requireHost(state, action.actorPlayerId);
      if (state.players.length < 2) {
        throw new DomainError("At least two players are required");
      }
      return {
        ...state,
        phase: "private-choice",
        revision: nextRevision(state),
      };
    }

    case "game.restart": {
      requirePhase(state, "reveal");
      requireHost(state, action.actorPlayerId);
      return {
        ...state,
        phase: "lobby",
        privateSelections: {},
        groupSelection: null,
        peerPredictions: {},
        reveal: null,
        revision: nextRevision(state),
      };
    }

    case "private-choice.submit": {
      requirePhase(state, "private-choice");
      requirePlayer(state, action.actorPlayerId);
      validateChoices(
        action.choices,
        state.scenario.privateSelectionCount,
        state.scenario,
      );
      if (
        !state.scenario.priorities.some(
          (priority) => priority.id === action.primaryPriorityId,
        )
      ) {
        throw new DomainError(`Unknown priority ${action.primaryPriorityId}`);
      }
      if (state.privateSelections[action.actorPlayerId]) {
        throw new DomainError("Private choice was already submitted");
      }

      const privateSelections = {
        ...state.privateSelections,
        [action.actorPlayerId]: {
          playerId: action.actorPlayerId,
          choices: action.choices,
          primaryPriorityId: action.primaryPriorityId,
        },
      };
      const allSubmitted =
        Object.keys(privateSelections).length === state.players.length;

      return {
        ...state,
        privateSelections,
        phase: allSubmitted ? "group-choice" : state.phase,
        revision: nextRevision(state),
      };
    }

    case "group-choice.submit": {
      requirePhase(state, "group-choice");
      requireHost(state, action.actorPlayerId);
      validateChoices(
        action.choices,
        state.scenario.groupSelectionCount,
        state.scenario,
      );
      return {
        ...state,
        groupSelection: { choices: action.choices },
        phase: "peer-prediction",
        revision: nextRevision(state),
      };
    }

    case "peer-prediction.submit": {
      requirePhase(state, "peer-prediction");
      requirePlayer(state, action.actorPlayerId);
      requirePlayer(state, action.targetPlayerId);
      if (action.actorPlayerId === action.targetPlayerId) {
        throw new DomainError("A player cannot predict their own priority");
      }
      if (
        !state.scenario.priorities.some(
          (priority) => priority.id === action.predictedPriorityId,
        )
      ) {
        throw new DomainError(`Unknown priority ${action.predictedPriorityId}`);
      }
      if (state.peerPredictions[action.actorPlayerId]) {
        throw new DomainError("Peer prediction was already submitted");
      }

      const peerPredictions = {
        ...state.peerPredictions,
        [action.actorPlayerId]: {
          authorPlayerId: action.actorPlayerId,
          targetPlayerId: action.targetPlayerId,
          predictedPriorityId: action.predictedPriorityId,
        },
      };
      const allSubmitted =
        Object.keys(peerPredictions).length === state.players.length;
      const nextState: RoomState = {
        ...state,
        peerPredictions,
        phase: allSubmitted ? "reveal" : state.phase,
        revision: nextRevision(state),
      };

      return allSubmitted
        ? { ...nextState, reveal: calculateReveal(nextState) }
        : nextState;
    }
  }
}

export function projectPublicRoom(state: RoomState): PublicRoomView {
  const { privateSelections, peerPredictions, ...publicState } = state;
  return {
    ...publicState,
    privateSubmissionPlayerIds: Object.keys(privateSelections),
    predictionSubmissionPlayerIds: Object.keys(peerPredictions),
  };
}
