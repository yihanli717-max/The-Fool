import assert from "node:assert/strict";
import test from "node:test";

import { applyAction, createRoom, DomainError, projectPublicRoom } from "./engine.ts";
import { runLegacyHappyPathHarness } from "./harness/legacyDemoScript.ts";

function createTestRoom() {
  return createRoom(
    { id: "room", code: "TEST" },
    { id: "host", displayName: "Host", connected: true },
    { title: "Orientation", eventGoal: "comfort", groupingMode: "comfort" },
  );
}

function joinedRoom() {
  return applyAction(createTestRoom(), {
    type: "player.join",
    player: { id: "guest", displayName: "Guest", isHost: false, connected: true },
  });
}

test("happy path reaches a deterministic, mutual-only reveal", () => {
  const first = runLegacyHappyPathHarness().finalState;
  const second = runLegacyHappyPathHarness().finalState;

  assert.equal(first.phase, "reveal");
  assert.deepEqual(first, second);
  assert.deepEqual(first.reveal, {
    initialTheme: {
      id: "creative-play",
      label: "Creative play",
      description: "making, imagining, and exploring worlds together",
      starter: "What is one creative thing you enjoy, and one you are curious to try?",
    },
    actualTheme: {
      id: "creative-play",
      label: "Creative play",
      description: "making, imagining, and exploring worlds together",
    },
    mutualFollowUps: [
      { id: "game-night", label: "Indie game night", participantCount: 2 },
    ],
  });
});

test("only the host can start the activity or reveal the prompt", () => {
  const joined = joinedRoom();
  assert.throws(
    () => applyAction(joined, { type: "activity.start", actorPlayerId: "guest" }),
    DomainError,
  );

  let state = applyAction(joined, { type: "activity.start", actorPlayerId: "host" });
  for (const actorPlayerId of ["host", "guest"]) {
    state = applyAction(state, {
      type: "preferences.submit",
      actorPlayerId,
      card: { interestIds: ["games"] },
    });
  }
  assert.throws(
    () => applyAction(state, { type: "conversation.begin", actorPlayerId: "guest" }),
    DomainError,
  );
});

test("preference cards remain private in the public room projection", () => {
  let state = applyAction(joinedRoom(), { type: "activity.start", actorPlayerId: "host" });
  state = applyAction(state, {
    type: "preferences.submit",
    actorPlayerId: "host",
    card: { interestIds: ["anime", "games"], eventIntent: "keep-in-touch" },
  });
  const publicView = projectPublicRoom(state);

  assert.deepEqual(publicView.preferenceSubmissionPlayerIds, ["host"]);
  assert.equal("preferenceCards" in publicView, false);
  assert.equal(JSON.stringify(publicView).includes("anime"), false);
  assert.equal(JSON.stringify(publicView).includes("keep-in-touch"), false);
});

test("invalid cards and solo follow-ups are rejected or kept private", () => {
  let state = applyAction(joinedRoom(), { type: "activity.start", actorPlayerId: "host" });
  assert.throws(
    () =>
      applyAction(state, {
        type: "preferences.submit",
        actorPlayerId: "host",
        card: { interestIds: ["games", "games"] },
      }),
    /Choose each interest only once/,
  );

  for (const actorPlayerId of ["host", "guest"]) {
    state = applyAction(state, {
      type: "preferences.submit",
      actorPlayerId,
      card: { interestIds: ["games"] },
    });
  }
  state = applyAction(state, { type: "conversation.begin", actorPlayerId: "host" });
  state = applyAction(state, { type: "reflection.open", actorPlayerId: "host" });
  for (const actorPlayerId of ["host", "guest"]) {
    state = applyAction(state, {
      type: "reflection.submit",
      actorPlayerId,
      themeId: "creative-play",
    });
  }
  state = applyAction(state, {
    type: "follow-up.submit",
    actorPlayerId: "host",
    followUpOptionId: "coffee",
  });
  state = applyAction(state, {
    type: "follow-up.submit",
    actorPlayerId: "guest",
    followUpOptionId: "not-today",
  });

  assert.equal(state.phase, "reveal");
  assert.deepEqual(state.reveal?.mutualFollowUps, []);
});
