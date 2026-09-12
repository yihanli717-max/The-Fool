import type { Player, RoomAction, RoomState } from "../domain.ts";
import { applyAction, createRoom, projectPublicRoom } from "../engine.ts";
import { assertRoomInvariants } from "../invariants.ts";

const players: Player[] = [
  { id: "alex", displayName: "Alex", isHost: true, connected: true },
  { id: "mei", displayName: "Mei", isHost: false, connected: true },
  { id: "sam", displayName: "Sam", isHost: false, connected: true },
];

export const happyPathActions: RoomAction[] = [
  ...players.slice(1).map((player): RoomAction => ({ type: "player.join", player })),
  { type: "activity.start", actorPlayerId: "alex" },
  {
    type: "preferences.submit",
    actorPlayerId: "alex",
    card: {
      interestIds: ["games", "anime", "tech"],
      interactionStyle: "small-group",
      connectionStyle: "depth",
      eventIntent: "new-perspectives",
    },
  },
  {
    type: "preferences.submit",
    actorPlayerId: "mei",
    card: {
      interestIds: ["anime", "art", "food"],
      interactionStyle: "small-group",
      connectionStyle: "depth",
      eventIntent: "keep-in-touch",
    },
  },
  {
    type: "preferences.submit",
    actorPlayerId: "sam",
    card: {
      interestIds: ["games", "art", "music"],
      interactionStyle: "structured",
      connectionStyle: "breadth",
      eventIntent: "casual",
    },
  },
  { type: "conversation.begin", actorPlayerId: "alex" },
  { type: "reflection.open", actorPlayerId: "alex" },
  { type: "reflection.submit", actorPlayerId: "alex", themeId: "creative-play" },
  { type: "reflection.submit", actorPlayerId: "mei", themeId: "creative-play" },
  { type: "reflection.submit", actorPlayerId: "sam", themeId: "ideas-impact" },
  { type: "follow-up.submit", actorPlayerId: "alex", followUpOptionId: "game-night" },
  { type: "follow-up.submit", actorPlayerId: "mei", followUpOptionId: "game-night" },
  { type: "follow-up.submit", actorPlayerId: "sam", followUpOptionId: "not-today" },
];

export type HarnessTraceEntry = {
  step: number;
  action: RoomAction["type"];
  phase: RoomState["phase"];
  revision: number;
};

function initialState(): RoomState {
  const [host] = players;
  if (!host) throw new Error("Harness requires a host fixture");
  return createRoom(
    { id: "demo-room", code: "CG26" },
    { id: host.id, displayName: host.displayName, connected: host.connected },
    {
      title: "Hackathon mixer",
      eventGoal: "discovery",
      groupingMode: "balanced",
    },
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
    if (
      "preferenceCards" in publicView ||
      "reflectionVotes" in publicView ||
      "followUpSelections" in publicView
    ) {
      throw new Error("Public room projection leaked a private response");
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
