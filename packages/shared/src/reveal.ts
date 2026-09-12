import type {
  Misread,
  PeerPrediction,
  Priority,
  Reveal,
  RoomState,
} from "./domain.ts";

function priorityOrder(priorities: Priority[]): Map<string, number> {
  return new Map(priorities.map((priority, index) => [priority.id, index]));
}

function sortByScenarioOrder(ids: string[], priorities: Priority[]): string[] {
  const order = priorityOrder(priorities);
  return [...ids].sort(
    (left, right) => (order.get(left) ?? Infinity) - (order.get(right) ?? Infinity),
  );
}

function primaryPriorityForPlayer(state: RoomState, playerId: string): string {
  const selection = state.privateSelections[playerId];
  if (!selection) {
    throw new Error(`Missing private selection for player ${playerId}`);
  }
  return selection.primaryPriorityId;
}

function toMisread(
  state: RoomState,
  prediction: PeerPrediction,
): Misread | null {
  const actualPriorityId = primaryPriorityForPlayer(
    state,
    prediction.targetPlayerId,
  );

  if (actualPriorityId === prediction.predictedPriorityId) {
    return null;
  }

  return {
    authorPlayerId: prediction.authorPlayerId,
    targetPlayerId: prediction.targetPlayerId,
    predictedPriorityId: prediction.predictedPriorityId,
    actualPriorityId,
  };
}

export function calculateReveal(state: RoomState): Reveal {
  if (!state.groupSelection) {
    throw new Error("Cannot calculate a reveal without a group selection");
  }

  const playersByPriority = new Map<string, Set<string>>();
  for (const selection of Object.values(state.privateSelections)) {
    for (const priorityId of new Set(
      selection.choices.map((choice) => choice.priorityId),
    )) {
      const players = playersByPriority.get(priorityId) ?? new Set<string>();
      players.add(selection.playerId);
      playersByPriority.set(priorityId, players);
    }
  }

  const largestGroup = Math.max(
    ...[...playersByPriority.values()].map((players) => players.size),
  );
  const commonGroundPriorityIds = sortByScenarioOrder(
    [...playersByPriority.entries()]
      .filter(([, players]) => players.size === largestGroup)
      .map(([priorityId]) => priorityId),
    state.scenario.priorities,
  );

  const expressedPriorities = new Set(
    state.groupSelection.choices.map((choice) => choice.priorityId),
  );
  const hiddenAgreementPriorityIds = sortByScenarioOrder(
    [...playersByPriority.entries()]
      .filter(
        ([priorityId, players]) =>
          players.size >= 2 && !expressedPriorities.has(priorityId),
      )
      .map(([priorityId]) => priorityId),
    state.scenario.priorities,
  );

  const biggestMisread = Object.values(state.peerPredictions)
    .map((prediction) => toMisread(state, prediction))
    .find((misread): misread is Misread => misread !== null) ?? null;

  return {
    commonGroundPriorityIds,
    hiddenAgreementPriorityIds,
    biggestMisread,
  };
}
