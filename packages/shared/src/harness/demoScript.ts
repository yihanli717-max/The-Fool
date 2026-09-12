import assert from "node:assert/strict";

import type {
  TarotCard,
  TarotEvent,
  TarotPlayer,
  TarotPlayerView,
  TarotRoomAction,
  TarotRoomState,
} from "../tarot/domain.ts";
import {
  applyTarotAction,
  createTarotRoom,
  projectTarotPlayerView,
} from "../tarot/engine.ts";
import {
  DeterministicContinuationGenerator,
  DeterministicEventGenerator,
  generateContinuationWithFallback,
  generateEventsWithFallback,
} from "../tarot/generators.ts";
import { assertTarotRoomInvariants } from "../tarot/invariants.ts";
import { tarotCardById } from "../tarot/fixtures.ts";

const players: TarotPlayer[] = [
  {
    id: "ari",
    displayName: "Ari",
    isHost: true,
    connected: true,
    characterId: "female",
  },
  {
    id: "mei",
    displayName: "Mei",
    isHost: false,
    connected: true,
    characterId: "male",
  },
];

const selectedCardIds = ["fool", "magician", "lovers", "hermit"];

function initialState(): TarotRoomState {
  const host = players[0];
  if (!host) throw new Error("Harness requires a host");
  return createTarotRoom(
    { id: "shared-mind-demo", code: "SM26" },
    {
      id: host.id,
      displayName: host.displayName,
      connected: host.connected,
      characterId: host.characterId,
    },
  );
}

function cardOrThrow(cardId: string): TarotCard {
  const card = tarotCardById(cardId);
  if (!card) throw new Error(`Missing harness card ${cardId}`);
  return card;
}

function eventOrThrow(state: TarotRoomState, eventId: string): TarotEvent {
  const event = state.rounds
    .flatMap((round) => round.events)
    .find((candidate) => candidate.id === eventId);
  if (!event) throw new Error(`Missing harness event ${eventId}`);
  return event;
}

function assertProjectionShape(view: TarotPlayerView): void {
  const serialized = JSON.stringify(view);
  for (const privateField of [
    "actualScore",
    "predictedScore",
    "matches",
    "continuationSource",
    "latestResponses",
    "responses",
    "predictions",
  ]) {
    assert.equal(
      serialized.includes(`"${privateField}":`),
      false,
      `Player view leaked private field ${privateField}`,
    );
  }
  if (view.currentRound?.event) {
    assert.equal(
      JSON.stringify(view.currentRound.event).includes('"score"'),
      false,
      "Visible event leaked option scores",
    );
  }
}

export type TarotHarnessTraceEntry = {
  step: number;
  action: TarotRoomAction["type"];
  phase: TarotRoomState["phase"];
  revision: number;
};

export async function runTarotHappyPathHarness(): Promise<{
  finalState: TarotRoomState;
  trace: TarotHarnessTraceEntry[];
  views: Record<string, TarotPlayerView>;
  actionLog: TarotRoomAction[];
}> {
  let state = initialState();
  const trace: TarotHarnessTraceEntry[] = [];
  const actionLog: TarotRoomAction[] = [];
  const eventGenerator = new DeterministicEventGenerator();
  const continuationGenerator = new DeterministicContinuationGenerator();

  const dispatch = (action: TarotRoomAction): void => {
    state = applyTarotAction(state, action);
    assertTarotRoomInvariants(state);
    actionLog.push(action);
    trace.push({
      step: trace.length + 1,
      action: action.type,
      phase: state.phase,
      revision: state.revision,
    });
    for (const player of state.players) {
      assertProjectionShape(projectTarotPlayerView(state, player.id));
    }
  };

  assertTarotRoomInvariants(state);
  dispatch({ type: "player.join", player: players[1]! });
  dispatch({
    type: "stage1.start",
    actorPlayerId: "ari",
    roundId: "round-1",
    cardIds: selectedCardIds,
  });

  const roundOne = await generateEventsWithFallback(eventGenerator, {
    roundId: "round-1",
    cards: selectedCardIds.map(cardOrThrow),
  });
  dispatch({
    type: "round.events.generated",
    roundId: "round-1",
    ...roundOne,
  });

  for (const [index, event] of roundOne.events.entries()) {
    dispatch({
      type: "event.answer",
      actorPlayerId: "ari",
      eventId: event.id,
      optionId: "A",
    });
    const meiBeforeReveal = projectTarotPlayerView(state, "mei");
    assert.equal(meiBeforeReveal.currentRound?.viewerOptionId, null);
    assert.equal(
      meiBeforeReveal.currentRound?.completedReveals.some(
        (reveal) => reveal.eventId === event.id,
      ),
      false,
    );
    dispatch({
      type: "event.answer",
      actorPlayerId: "mei",
      eventId: event.id,
      optionId: "B",
    });
    const reveal = projectTarotPlayerView(state, "mei").currentRound
      ?.completedReveals;
    assert.equal(
      reveal?.find((entry) => entry.eventId === event.id)?.choices.length,
      2,
    );
    assert.equal(state.phase, "event-reveal");
    dispatch({ type: "event.advance", actorPlayerId: "ari" });
    assert.equal(
      state.phase,
      index === roundOne.events.length - 1 ? "discussion" : "answering",
    );
  }

  dispatch({
    type: "round.revise",
    actorPlayerId: "ari",
    roundId: "round-2",
    cardIds: selectedCardIds,
  });
  const roundTwo = await generateEventsWithFallback(eventGenerator, {
    roundId: "round-2",
    cards: selectedCardIds.map(cardOrThrow),
  });
  dispatch({
    type: "round.events.generated",
    roundId: "round-2",
    ...roundTwo,
  });

  for (const [index, event] of roundTwo.events.entries()) {
    dispatch({
      type: "event.answer",
      actorPlayerId: "ari",
      eventId: event.id,
      optionId: index === 0 ? "B" : "C",
    });
    dispatch({
      type: "event.answer",
      actorPlayerId: "mei",
      eventId: event.id,
      optionId: index === 0 ? "C" : "A",
    });
    dispatch({ type: "event.advance", actorPlayerId: "ari" });
  }

  assert.equal(state.latestResponses.ari?.fool?.roundId, "round-2");
  assert.equal(state.latestResponses.ari?.fool?.score, 1);
  assert.equal(state.latestResponses.mei?.fool?.score, 2);

  dispatch({ type: "stage2.start", actorPlayerId: "ari" });
  dispatch({
    type: "prediction.submit",
    predictionId: "mei-knows-ari-fool",
    actorPlayerId: "mei",
    targetPlayerId: "ari",
    cardId: "fool",
    predictedScore: 1,
  });
  assert.equal(continuationGenerator.requests.length, 0);
  assert.equal(
    projectTarotPlayerView(state, "mei").predictionResults[0]?.status,
    "matched",
  );

  dispatch({
    type: "prediction.submit",
    predictionId: "ari-explores-mei-fool",
    actorPlayerId: "ari",
    targetPlayerId: "mei",
    cardId: "fool",
    predictedScore: 3,
  });
  assert.equal(
    projectTarotPlayerView(state, "ari").predictionResults[0]?.status,
    "continuation-loading",
  );

  const targetResponse = state.latestResponses.mei?.fool;
  if (!targetResponse) throw new Error("Missing target ground truth");
  const originalEvent = eventOrThrow(state, targetResponse.eventId);
  const targetOption = originalEvent.options.find(
    (option) => option.id === targetResponse.optionId,
  );
  if (!targetOption) throw new Error("Missing target option");
  const continuation = await generateContinuationWithFallback(
    continuationGenerator,
    {
      card: cardOrThrow("fool"),
      originalEvent,
      targetActualOption: {
        id: targetOption.id,
        text: targetOption.text,
      },
      targetScore: targetResponse.score,
      predictedScore: 3,
      usedTopics: roundTwo.events.map((event) => event.title),
    },
  );
  dispatch({
    type: "continuation.generated",
    actorPlayerId: "ari",
    predictionId: "ari-explores-mei-fool",
    ...continuation,
  });

  assert.equal(continuationGenerator.requests.length, 1);
  const recordedRequest = JSON.stringify(continuationGenerator.requests[0]);
  for (const privateIdentifier of ["Ari", "Mei", "SM26"]) {
    assert.equal(recordedRequest.includes(privateIdentifier), false);
  }
  assert.equal(
    projectTarotPlayerView(state, "ari").predictionResults[0]?.status,
    "conversation-ready",
  );
  assert.deepEqual(
    projectTarotPlayerView(state, "mei").predictionResults.map(
      (result) => result.predictionId,
    ),
    ["mei-knows-ari-fool"],
  );

  const replayed = actionLog.reduce(applyTarotAction, initialState());
  assert.deepEqual(replayed, state);
  const views = Object.fromEntries(
    state.players.map((player) => [
      player.id,
      projectTarotPlayerView(state, player.id),
    ]),
  );
  for (const player of state.players) {
    assert.deepEqual(
      projectTarotPlayerView(replayed, player.id),
      views[player.id],
    );
  }

  return { finalState: state, trace, views, actionLog };
}
