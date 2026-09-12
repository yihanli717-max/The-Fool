# Harness Loop Design

## Purpose

The harness proves Common Ground’s multiplayer social loop before depending on
sockets, React state, or deployment infrastructure. It runs a deterministic
three-person activity in one process and fails immediately when a transition,
privacy boundary, or group calculation is violated.

The flow under test is:

```text
JOIN -> PREFERENCE CARD -> CONVERSATION PROMPT -> REFLECTION -> FOLLOW-UP -> REVEAL
```

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

The Socket.IO server must validate an incoming event, convert it into a domain
action, call this same engine, and broadcast only the projected public state.

## Fixture Story

Alex creates a balanced Hackathon Mixer. Mei and Sam join. Each privately
submits interests and an optional interaction preference. The host reveals an
anonymized **Creative play** prompt. After talking, each participant privately
reflects on what actually connected the table. Finally, Alex and Mei both opt
into an Indie game night while Sam chooses not to continue.

The group reveal contains the aggregate actual theme and **Indie game night**.
It never names who chose a preference, theme, or follow-up option.

## What the Harness Owns

- deterministic participants, preferences, and local connection fixtures;
- a complete happy-path action log;
- phase-transition and room-invariant assertions;
- public-view privacy checks after every action;
- deterministic initial-theme and follow-up calculations;
- deterministic replay verification;
- concise terminal output for debugging.

## Privacy Boundary

The authoritative state contains three private maps:

- `preferenceCards`;
- `reflectionVotes`;
- `followUpSelections`.

Clients receive `PublicRoomView`, which excludes all three maps. It includes
only submission counts, an anonymized initial theme once the host opens the
conversation, and a final group reveal. A follow-up appears only when at least
two people selected the same non-opt-out option.

## Domain Boundary

The transition engine is pure:

```ts
nextState = applyAction(currentState, action);
```

An invalid action throws `DomainError` without mutating the previous state. A
valid action increments the revision once. This supports tests, event replay,
refresh recovery, and later persistence without duplicating rules in the UI.

## Commands

```bash
npm install
npm run harness
npm test
npm run typecheck
npm run build
```

Expected harness completion:

```text
PASS: invariants, privacy projection, mutual follow-up, and deterministic replay
```
