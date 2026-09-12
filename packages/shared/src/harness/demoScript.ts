import type { Player, RoomAction, RoomState } from "../domain.ts";
import { applyAction, createRoom, projectPublicRoom } from "../engine.ts";
import { assertRoomInvariants } from "../invariants.ts";
import { strandedIsland } from "../scenarios/strandedIsland.ts";

const players: Player[] = [
  { id: "alex", displayName: "Alex", isHost: true, connected: true },
  { id: "mei", displayName: "Mei", isHost: false, connected: true },
  { id: "sam", displayName: "Sam", isHost: false, connected: true },
  { id: "priya", displayName: "Priya", isHost: false, connected: true },
];

export const happyPathActions: RoomAction[] = [
  ...players.slice(1).map(
    (player): RoomAction => ({ type: "player.join", player }),
  ),
  { type: "game.start", actorPlayerId: "alex" },
  {
    type: "private-choice.submit",
    actorPlayerId: "alex",
    primaryPriorityId: "rescue",
    choices: [
      { itemId: "water", priorityId: "survival" },
      { itemId: "radio", priorityId: "rescue" },
      { itemId: "rope", priorityId: "long-term" },
    ],
  },
  {
    type: "private-choice.submit",
    actorPlayerId: "mei",
    primaryPriorityId: "helping",
    choices: [
      { itemId: "medicine", priorityId: "helping" },
      { itemId: "water", priorityId: "survival" },
      { itemId: "food", priorityId: "comfort" },
    ],
  },
  {
    type: "private-choice.submit",
    actorPlayerId: "sam",
    primaryPriorityId: "rescue",
    choices: [
      { itemId: "radio", priorityId: "rescue" },
      { itemId: "lighter", priorityId: "survival" },
      { itemId: "medicine", priorityId: "helping" },
    ],
  },
  {
    type: "private-choice.submit",
    actorPlayerId: "priya",
    primaryPriorityId: "long-term",
    choices: [
      { itemId: "map", priorityId: "long-term" },
      { itemId: "rope", priorityId: "long-term" },
      { itemId: "medicine", priorityId: "helping" },
    ],
  },
  {
    type: "group-choice.submit",
    actorPlayerId: "alex",
    choices: [
      { itemId: "water", priorityId: "survival" },
      { itemId: "radio", priorityId: "rescue" },
      { itemId: "medicine", priorityId: "helping" },
    ],
  },
  {
    type: "peer-prediction.submit",
    actorPlayerId: "alex",
    targetPlayerId: "mei",
    predictedPriorityId: "comfort",
  },
  {
    type: "peer-prediction.submit",
    actorPlayerId: "mei",
    targetPlayerId: "sam",
    predictedPriorityId: "rescue",
  },
  {
    type: "peer-prediction.submit",
    actorPlayerId: "sam",
    targetPlayerId: "priya",
    predictedPriorityId: "rescue",
  },
  {
    type: "peer-prediction.submit",
    actorPlayerId: "priya",
    targetPlayerId: "alex",
    predictedPriorityId: "survival",
  },
];

export type HarnessTraceEntry = {
  step: number;
  action: RoomAction["type"];
  phase: RoomState["phase"];
  revision: number;
};

function initialState(): RoomState {
  const [host] = players;
  if (!host) {
    throw new Error("Harness requires a host fixture");
  }
  return createRoom(
    { id: "demo-room", code: "CG26" },
    {
      id: host.id,
      displayName: host.displayName,
      connected: host.connected,
    },
    strandedIsland,
  );
}

export function runHappyPathHarness(): {
  finalState: RoomState;
  trace: HarnessTraceEntry[];
} {
  let state = initialState();
  const trace: HarnessTraceEntry[] = [];
  assertRoomInvariants(state);

  happyPathActions.forEach((action, index) => {
    state = applyAction(state, action);
    assertRoomInvariants(state);

    const publicView = projectPublicRoom(state);
    if ("privateSelections" in publicView || "peerPredictions" in publicView) {
      throw new Error("Public room projection leaked private session data");
    }

    trace.push({
      step: index + 1,
      action: action.type,
      phase: state.phase,
      revision: state.revision,
    });
  });

  const replayed = happyPathActions.reduce(applyAction, initialState());
  if (JSON.stringify(replayed) !== JSON.stringify(state)) {
    throw new Error("Action replay was not deterministic");
  }

  return { finalState: state, trace };
}
