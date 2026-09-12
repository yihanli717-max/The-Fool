import assert from "node:assert/strict";
import test from "node:test";

import { runTarotHappyPathHarness } from "../harness/demoScript.ts";
import type { TarotPlayer, TarotRoomState } from "./domain.ts";
import {
  applyTarotAction,
  createTarotRoom,
  projectTarotPlayerView,
  TarotDomainError,
} from "./engine.ts";
import {
  DeterministicContinuationGenerator,
  DeterministicEventGenerator,
  generateContinuationWithFallback,
  generateEventsWithFallback,
} from "./generators.ts";
import {
  pixelCharacterIds,
  tarotCardById,
} from "./fixtures.ts";
import { assertTarotRoomInvariants } from "./invariants.ts";

const host: TarotPlayer = {
  id: "host",
  displayName: "Host",
  isHost: true,
  connected: true,
  characterId: "female",
};
const member: TarotPlayer = {
  id: "member",
  displayName: "Member",
  isHost: false,
  connected: true,
  characterId: "male",
};
const cardIds = ["fool", "magician", "lovers", "hermit"];

function lobby(): TarotRoomState {
  return createTarotRoom(
    { id: "test-room", code: "TEST" },
    {
      id: host.id,
      displayName: host.displayName,
      connected: host.connected,
      characterId: host.characterId,
    },
  );
}

function joinedLobby(): TarotRoomState {
  return applyTarotAction(lobby(), { type: "player.join", player: member });
}

async function answeringRoom(): Promise<TarotRoomState> {
  let state = applyTarotAction(joinedLobby(), {
    type: "stage1.start",
    actorPlayerId: "host",
    roundId: "round-test",
    cardIds,
  });
  const generated = await generateEventsWithFallback(
    new DeterministicEventGenerator(),
    {
      roundId: "round-test",
      cards: cardIds.map((cardId) => {
        const card = tarotCardById(cardId);
        if (!card) throw new Error("Missing test card");
        return card;
      }),
    },
  );
  state = applyTarotAction(state, {
    type: "round.events.generated",
    roundId: "round-test",
    ...generated,
  });
  return state;
}

test("Shared Mind harness is deterministic and reaches both prediction branches", async () => {
  const first = await runTarotHappyPathHarness();
  const second = await runTarotHappyPathHarness();

  assert.deepEqual(first.finalState, second.finalState);
  assert.equal(first.finalState.phase, "predictions");
  assert.equal(first.finalState.rounds.length, 2);
  assert.equal(first.views.ari?.predictionResults[0]?.status, "conversation-ready");
  assert.equal(first.views.mei?.predictionResults[0]?.status, "matched");
});

test("room capacity and unique pixel characters are enforced", () => {
  let state = lobby();
  assert.throws(
    () =>
      applyTarotAction(state, {
        type: "player.join",
        player: { ...member, characterId: "female" },
      }),
    /Pixel characters must be unique/,
  );

  for (const [index, characterId] of pixelCharacterIds.slice(1).entries()) {
    state = applyTarotAction(state, {
      type: "player.join",
      player: {
        id: `member-${index}`,
        displayName: `Member ${index}`,
        isHost: false,
        connected: true,
        characterId,
      },
    });
  }
  assert.equal(state.players.length, 10);
  assertTarotRoomInvariants(state);
  assert.throws(
    () =>
      applyTarotAction(state, {
        type: "player.join",
        player: {
          id: "eleventh",
          displayName: "Eleventh",
          isHost: false,
          connected: true,
          characterId: "female",
        },
      }),
    /at most ten/,
  );
});

test("host authority and duplicate-answer rules are enforced", async () => {
  assert.throws(
    () =>
      applyTarotAction(joinedLobby(), {
        type: "stage1.start",
        actorPlayerId: "member",
        roundId: "round-test",
        cardIds,
      }),
    TarotDomainError,
  );

  let state = await answeringRoom();
  const eventId = state.rounds[0]?.events[0]?.id;
  if (!eventId) throw new Error("Missing test event");
  state = applyTarotAction(state, {
    type: "event.answer",
    actorPlayerId: "host",
    eventId,
    optionId: "A",
  });
  assert.throws(
    () =>
      applyTarotAction(state, {
        type: "event.answer",
        actorPlayerId: "host",
        eventId,
        optionId: "B",
      }),
    /already answered/,
  );
});

test("invalid model-shaped output falls back without using live services", async () => {
  const cards = cardIds.map((cardId) => {
    const card = tarotCardById(cardId);
    if (!card) throw new Error("Missing test card");
    return card;
  });
  const eventResult = await generateEventsWithFallback(
    new DeterministicEventGenerator("invalid"),
    { roundId: "fallback-round", cards },
  );
  assert.equal(eventResult.source, "fallback");
  assert.equal(eventResult.events.length, 4);

  const event = eventResult.events[0];
  const option = event?.options[0];
  const card = cards[0];
  if (!event || !option || !card) throw new Error("Missing fallback fixture");
  const continuationResult = await generateContinuationWithFallback(
    new DeterministicContinuationGenerator("invalid"),
    {
      card,
      originalEvent: event,
      targetActualOption: { id: option.id, text: option.text },
      targetScore: option.score,
      predictedScore: option.score === 1 ? 2 : 1,
      usedTopics: [],
    },
  );
  assert.equal(continuationResult.source, "fallback");
  assert.equal(continuationResult.continuation.options.length, 3);
});

test("a disconnected player blocks until the host explicitly continues", async () => {
  let state = await answeringRoom();
  const eventId = state.rounds[0]?.events[0]?.id;
  if (!eventId) throw new Error("Missing test event");
  state = applyTarotAction(state, {
    type: "event.answer",
    actorPlayerId: "host",
    eventId,
    optionId: "A",
  });
  state = applyTarotAction(state, {
    type: "player.connection.set",
    actorPlayerId: "member",
    connected: false,
  });
  assert.equal(state.phase, "answering");
  state = applyTarotAction(state, {
    type: "round.continue-without-player",
    actorPlayerId: "host",
    playerId: "member",
  });
  assert.equal(state.phase, "event-reveal");
});

test("self-target prediction is rejected and another player's result stays private", async () => {
  const { finalState } = await runTarotHappyPathHarness();
  assert.throws(
    () =>
      applyTarotAction(finalState, {
        type: "prediction.submit",
        predictionId: "self",
        actorPlayerId: "ari",
        targetPlayerId: "ari",
        cardId: "fool",
        predictedScore: 1,
      }),
    /cannot predict themselves/,
  );
  const meiView = projectTarotPlayerView(finalState, "mei");
  assert.equal(
    meiView.predictionResults.some(
      (result) => result.predictionId === "ari-explores-mei-fool",
    ),
    false,
  );
});
