# Shared Mind Harness Loop

## Purpose

The harness proves the Shared Mind multiplayer contract before React,
Socket.IO, image rendering, or a live OpenAI request are involved.

```text
CREATE ROOM -> JOIN -> GROUND TRUTH -> DISCUSS -> REVISE OR FINISH
-> PREDICT -> KEEP TALKING
```

`npm run harness` must be deterministic: no network, no OpenAI call, no token
cost, and no read of `.env`. It injects validated fake generator results and
records them as domain actions, so the same action log always replays to the
same final state.

## Engine and effects boundary

The game engine stays pure:

```ts
nextState = applyAction(currentState, action);
```

Random card selection, OpenAI generation, Socket.IO, and timers are effects.
Their validated results become explicit domain actions:

```text
effect requests generation
  -> validate structured output
  -> dispatch generated payload action
  -> engine updates deterministically
```

Replay uses the recorded generated payload. It never makes a second model
request or assumes a model will reproduce the same wording.

## Rules under test

### Room and players

- A room accepts 2–10 players with exactly one host.
- Each player receives a unique pixel-character ID.
- An eleventh player and duplicate character assignment are rejected.
- Only the host can start Stage 1, request a revision, continue without a
  disconnected player, or open Stage 2.
- Invalid and out-of-phase actions do not mutate the prior room state.

### Ground-truth events

- A seeded selector chooses four distinct cards from the eight-card catalog.
- Each event has exactly three options with explicit scores `1`, `2`, and `3`
  once each; A/B/C order is never treated as score order.
- Each active player can answer an event once.
- Before all active players submit, each player view shows only their own
  status and an aggregate completion count.
- After all active players submit, all player views show every nickname plus
  selected option text. Numeric scores remain server-only.
- Revision rounds use fresh event IDs and fresh situations.
- When a card is revisited, the latest `playerId + cardId` answer is the
  ground truth used in predictions.

### Prediction and continuation

- A player can target any other player, never themselves.
- Predictions are private and keyed by
  `predictorId + targetParticipantId + cardId`.
- A later prediction for the same key replaces the earlier one.
- A correct prediction produces a private positive confirmation without a
  continuation-generator call.
- An incorrect prediction is private routing only. The viewer must not see
  “wrong,” “mismatch,” “score,” “hidden answer,” or “you do not know them.”
- An incorrect prediction gives only the predictor exactly three directions:
  `new-situation`, `different-angle`, and `future-bridge`.
- The target's actual option, score, and comparison result never leak to
  another player or into generated display copy.

## Generator contracts

Production will have two server-side generators:

| Generator | Input | Validated output | Fallback |
| --- | --- | --- | --- |
| `EventGenerator` | four Tarot cards plus round context | one scored event per card | safe event fixture |
| `ContinuationGenerator` | Tarot domain, original event, private comparison context | opening plus three directions | three static directions |

The harness injects:

- `DeterministicEventGenerator`, returning known schema-valid events;
- `DeterministicContinuationGenerator`, returning known directions and
  recording every request;
- malformed and timed-out fake results, to exercise fallback behavior.

All generator output passes through the production Zod schemas before reaching
the engine. A continuation request may include the target option and score as
private server context, but never display names, room codes, contact details,
or other personal data.

For the eventual live integration, use the Responses API with Structured
Outputs, validate the response on the server, and set `store: false`. The API
supports JSON output formats and fixed system rules through `instructions`.
[OpenAI Responses API reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)

## Per-player privacy projection

Clients receive only:

```ts
projectPlayerView(room, viewerPlayerId);
```

| Phase | Visible to a player | Server-only |
| --- | --- | --- |
| Answering | card, question, own status, completion count | other answers and all scores |
| Event reveal | every selected option text | numeric scores and latest indexes |
| Discussion break | completed-card summary and neutral prompt | private response fields |
| Prediction | own target and own submission state | other predictions, comparison, target score |
| Continuation | requesting player's three directions | target answer/score and mismatch flag |

The host is also a participant; it gets no privileged access to private
predictions or numeric scores.

## Primary deterministic fixture

Two players use the provided 64×64 demo assets:

- **Ari** — host, `female.png`;
- **Mei** — member, `male.png`.

Capacity, character uniqueness, and private-view behavior beyond two players
remain focused engine tests.

The seeded selector returns:

```text
The Fool -> The Magician -> The Lovers -> The Hermit
```

1. Ari creates room `SM26`. Mei joins.
2. The host starts Stage 1. The engine verifies both characters are
   unique.
3. The fake event generator returns one valid event for each selected card.
4. For every event, each player submits once. The harness verifies the other
   choices remain hidden until the final submission, then become visible as
   option text to everyone.
5. The room enters the 10-minute discussion-break state.
6. Ari requests a revision round. The fake returns new event IDs for the same
   domains; at least one Fool answer changes.
7. The harness confirms the newer Fool answer is used as ground truth.
8. Ari opens Stage 2.
9. Mei predicts Ari's latest Fool score correctly. She receives a private
   confirmation and the continuation fake has zero calls.
10. Ari predicts a different score for Mei. Only Ari receives three
    continuation directions.
11. The recorded continuation request has card/event/private-score context but
    no nickname or room code. Its display copy contains no target option text
    and no banned evaluation terms.
12. The complete action log, including generated payloads, replays to an
    identical room state and identical per-player views.

## Focused cases

| Case | Expected result |
| --- | --- |
| Host starts alone | rejected |
| Eleventh player joins | rejected |
| Duplicate character | rejected |
| Member starts, revises, or finishes | rejected |
| Duplicate answer for one event | rejected |
| View before all answers | no other answer text |
| Invalid event result | fallback event is used and recorded |
| Invalid/timeout continuation | fallback directions shown privately |
| Self-target prediction | rejected |
| Correct prediction | no continuation request |
| Incorrect prediction | three directions, no error wording |
| Revisited card | latest answer and prediction win |
| Disconnect mid-event | explicit host action decides whether to continue |
| Replay | identical final state and player views |

## Disconnect policy

For the MVP, a disconnected player remains in the room but stops blocking the
current event only after the host records `continue without them`. A
reconnecting player can view completed reveals but cannot answer a closed
event. This avoids hidden timeouts changing outcomes.

## Commands

```bash
# Deterministic: no network, no API key, no .env read.
npm run harness
npm test

# Added only after the deterministic suite passes:
# one manual server-side smoke test with OPENAI_API_KEY from .env.
npm run harness:live
```

`harness:live` is never part of CI or the default harness command. It reports
only success/failure and schema validity; it must not print an API key, full
request body, nickname, or hidden response score.

## Implementation order

1. Replace the old Common Ground domain with Shared Mind room, Tarot, event,
   response, prediction, and player-view types.
2. Add seeded card selection, unique character assignment, Zod schemas, and
   fake generators.
3. Implement Stage 1 answer/reveal actions and per-player projections.
4. Add revision rounds and latest-by-Tarot indexes.
5. Add Stage 2 predictions, continuation routing, and static fallback.
6. Build the action-log harness and focused unit tests.
7. Add the optional live API smoke test only after deterministic tests pass.

## Exit criteria

The harness is ready to support Socket.IO and UI work when:

- the fixture completes both correct and incorrect prediction branches;
- all focused cases pass;
- no private answer, score, prediction, or continuation leaks between player
  projections;
- generated content is a validated, replayable action;
- generator failures still let the activity continue safely; and
- `npm run harness`, `npm test`, and `npm run typecheck` pass without
  `OPENAI_API_KEY`.
