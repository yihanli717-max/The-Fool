# Harness Loop Design

## Purpose

The harness proves the multiplayer domain model before the project adds sockets, React state, timers, or deployment infrastructure. It runs a complete four-player session in one process and fails immediately when a rule, privacy boundary, or deterministic result is violated.

## Loop

```text
FIXTURE
   |
   v
DISPATCH ONE DOMAIN ACTION
   |
   v
ASSERT ROOM INVARIANTS
   |
   v
PROJECT A PUBLIC CLIENT VIEW
   |
   v
ASSERT NO PRIVATE DATA LEAKED
   |
   v
RECORD PHASE + REVISION
   |
   +---- repeat until REVEAL
   |
   v
REPLAY THE FULL ACTION LOG
   |
   v
COMPARE FINAL STATES
```

The loop tests the contract that the future Socket.IO server will expose. Network handlers should validate an incoming event, convert it into a domain action, call the same engine, and broadcast only a projected public state.

## What the Harness Owns

- deterministic player and scenario fixtures;
- a complete happy-path action log;
- phase-transition assertions;
- room invariants after every action;
- public-view privacy checks;
- deterministic replay verification;
- human-readable terminal output for fast debugging.

## What the Harness Does Not Own

- sockets or network timing;
- browser rendering;
- authentication;
- database persistence;
- AI-generated copy;
- production analytics.

Those layers should not duplicate game rules. They should call the shared domain engine.

## Domain Boundary

The engine is a pure transition:

```ts
nextState = applyAction(currentState, action);
```

An invalid action throws a `DomainError` without mutating the previous state. A valid action increments the room revision exactly once. This makes the engine suitable for unit tests, event replay, reconnect recovery, and later server persistence.

## Privacy Boundary

The authoritative state contains private choices and peer predictions. Clients receive a `PublicRoomView` that exposes only submission status until the reveal is calculated.

The reveal contains derived insights, not raw private answers. Future participant-specific reveal screens may require a separate projection function and explicit product review.

## Reveal Semantics

- **Common ground** counts how many distinct players used each priority at least once. Repeating one priority does not let one player dominate the group result.
- **Hidden agreement** is a priority shared privately by at least two players but absent from the group's expressed rationales.
- **Biggest misread** is a peer prediction that differs from the target player's explicitly selected primary priority.
- Ties are ordered using the scenario's declared priority order, keeping output stable across runs.

These are session-level observations. They are not personality measurements.

## Commands

```bash
npm install
npm run harness
npm test
npm run typecheck
```

Expected harness completion:

```text
PASS: invariants, privacy projection, and deterministic replay
```

## Next Integration Step

The server should own one in-memory `RoomState` per room code. Every Socket.IO command maps to a `RoomAction`, passes through `applyAction`, and broadcasts `projectPublicRoom(nextState)`. This keeps multiplayer transport replaceable and prevents UI code from becoming a second source of game rules.
