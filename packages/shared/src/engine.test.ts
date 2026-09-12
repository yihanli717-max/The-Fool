import assert from "node:assert/strict";
import test from "node:test";

import { applyAction, createRoom, DomainError } from "./engine.ts";
import { runHappyPathHarness } from "./harness/demoScript.ts";
import { strandedIsland } from "./scenarios/strandedIsland.ts";

test("happy path reaches a deterministic reveal", () => {
  const first = runHappyPathHarness().finalState;
  const second = runHappyPathHarness().finalState;

  assert.equal(first.phase, "reveal");
  assert.deepEqual(first, second);
  assert.ok(first.reveal);
  assert.deepEqual(first.reveal.commonGroundPriorityIds, [
    "survival",
    "helping",
  ]);
  assert.deepEqual(first.reveal.hiddenAgreementPriorityIds, ["long-term"]);
  assert.deepEqual(first.reveal.biggestMisread, {
    authorPlayerId: "alex",
    targetPlayerId: "mei",
    predictedPriorityId: "comfort",
    actualPriorityId: "helping",
  });
});

test("a non-host cannot start the game", () => {
  const state = createRoom(
    { id: "room", code: "TEST" },
    { id: "host", displayName: "Host", connected: true },
    strandedIsland,
  );
  const joined = applyAction(state, {
    type: "player.join",
    player: {
      id: "guest",
      displayName: "Guest",
      isHost: false,
      connected: true,
    },
  });

  assert.throws(
    () =>
      applyAction(joined, {
        type: "game.start",
        actorPlayerId: "guest",
      }),
    DomainError,
  );
  assert.equal(joined.phase, "lobby");
});

test("private choices must contain exactly three unique items", () => {
  const state = createRoom(
    { id: "room", code: "TEST" },
    { id: "host", displayName: "Host", connected: true },
    strandedIsland,
  );
  const joined = applyAction(state, {
    type: "player.join",
    player: {
      id: "guest",
      displayName: "Guest",
      isHost: false,
      connected: true,
    },
  });
  const started = applyAction(joined, {
    type: "game.start",
    actorPlayerId: "host",
  });

  assert.throws(
    () =>
      applyAction(started, {
        type: "private-choice.submit",
        actorPlayerId: "host",
        primaryPriorityId: "survival",
        choices: [
          { itemId: "water", priorityId: "survival" },
          { itemId: "water", priorityId: "rescue" },
          { itemId: "radio", priorityId: "rescue" },
        ],
      }),
    /Duplicate item water/,
  );
});
