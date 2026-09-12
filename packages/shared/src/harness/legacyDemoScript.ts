import type { Player, RoomAction, RoomState } from "../domain.ts";
import { applyAction, createRoom, projectPublicRoom } from "../engine.ts";
import { assertRoomInvariants } from "../invariants.ts";

const players: Player[] = [
  { id: "alex", displayName: "Alex", isHost: true, connected: true },
  { id: "mei", displayName: "Mei", isHost: false, connected: true },
  { id: "sam", displayName: "Sam", isHost: false, connected: true },
];

const actions: RoomAction[] = [
  ...players.slice(1).map((player): RoomAction => ({
    type: "player.join",
    player,
  })),
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
  {
    type: "reflection.submit",
    actorPlayerId: "alex",
    themeId: "creative-play",
  },
  {
    type: "reflection.submit",
    actorPlayerId: "mei",
    themeId: "creative-play",
  },
  {
    type: "reflection.submit",
    actorPlayerId: "sam",
    themeId: "ideas-impact",
  },
  {
    type: "follow-up.submit",
    actorPlayerId: "alex",
    followUpOptionId: "game-night",
  },
  {
    type: "follow-up.submit",
    actorPlayerId: "mei",
    followUpOptionId: "game-night",
  },
  {
    type: "follow-up.submit",
    actorPlayerId: "sam",
    followUpOptionId: "not-today",
  },
];

function initialState(): RoomState {
  const host = players[0];
  if (!host) throw new Error("Legacy harness requires a host");
  return createRoom(
    { id: "legacy-room", code: "CG26" },
    { id: host.id, displayName: host.displayName, connected: host.connected },
    {
      title: "Hackathon mixer",
      eventGoal: "discovery",
      groupingMode: "balanced",
    },
  );
}

export function runLegacyHappyPathHarness(): {
  finalState: RoomState;
} {
  let state = initialState();
  assertRoomInvariants(state);
  for (const action of actions) {
    state = applyAction(state, action);
    assertRoomInvariants(state);
    const publicView = projectPublicRoom(state);
    if (
      "preferenceCards" in publicView ||
      "reflectionVotes" in publicView ||
      "followUpSelections" in publicView
    ) {
      throw new Error("Legacy public view leaked private data");
    }
  }
  const replayed = actions.reduce(applyAction, initialState());
  if (JSON.stringify(replayed) !== JSON.stringify(state)) {
    throw new Error("Legacy action replay was not deterministic");
  }
  return { finalState: state };
}
