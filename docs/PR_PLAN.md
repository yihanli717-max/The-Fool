# Pull Request Plan

## Product Decision

The implementation will focus on a single multiplayer social game engine rather than a full event-management platform.

The MVP thesis is:

> A shared decision can reveal how people understand themselves and one another.

The critical path is:

```text
CREATE ROOM -> JOIN -> PRIVATE CHOICE -> GROUP CHOICE -> PREDICT -> REVEAL
```

Follow-up activity creation is a stretch feature and must not block the critical path.

## Recommended Development Setup

- Visual Studio Code for editing and debugging
- Node.js 22.12 or newer
- npm workspaces for dependency and script management
- TypeScript in strict mode
- React and Vite for the client
- Express and Socket.IO for the realtime server
- Shared Zod schemas for runtime validation
- Vitest for unit and component tests

This stack supports a fast browser-based multiplayer demo without requiring a database, cloud account, mobile SDK, or game engine.

## PR 1: Playable Realtime Vertical Slice

### Goal

Deliver one complete Stranded Island session that works across two to four browser clients.

### User-visible scope

- Organizer can create a room and receive a short code.
- Players can join with a display name and room code.
- Lobby shows connected players and host controls.
- Host starts the scenario.
- Players privately select three items and one priority for each item.
- Host submits the group's final three items after discussion.
- Players predict one other player's primary priority.
- All clients see the same reveal screen.
- The room can restart without restarting the server.

### Engineering scope

- npm workspace with `web`, `server`, and `shared` packages
- shared TypeScript event and state definitions
- in-memory room repository
- Socket.IO event handlers and reconnection by temporary player token
- server-authoritative phase transitions
- local Stranded Island scenario fixture
- deterministic reveal engine
- responsive card-based interface
- unit tests for room transitions and reveal calculations
- one automated happy-path integration test if time permits

The domain-first implementation begins with the deterministic harness described in [HARNESS_LOOP.md](HARNESS_LOOP.md). The realtime server and UI must reuse this engine rather than reimplementing game rules.

The initial implementation keeps rooms in server memory. Browser refresh is supported through a session-scoped room token; server restart is intentionally treated as room expiration for the hackathon MVP.

### Non-goals

- authentication or user accounts
- persistent database storage
- public matchmaking
- chat or audio capture
- AI-generated psychological analysis
- multiple production-ready scenarios
- complex organizer dashboards
- automated group assignment
- venue, equipment, or catering planning

### Acceptance criteria

- Two to four players can complete the entire flow without a page refresh.
- A player's private selections are not visible to other players before the reveal.
- Invalid actions are rejected by the server, including early phase transitions and excess selections.
- Every connected client observes the same room phase and final group choice.
- Reveal results are reproducible from stored round data.
- Refreshing a client restores that player's current room when the server is still running.
- `npm test` and `npm run build` pass from the repository root.

## PR 2: Event Framing and Scenario System

### Goal

Show that the same interaction mechanic can support different real-world event contexts.

### Scope

- scenario schema and scenario picker
- two additional fixtures, such as Mars Mission and Design the Perfect City
- organizer event-purpose selector
- scenario-specific copy, items, priorities, and timer duration
- QR code for room joining
- facilitator instructions and phase prompts
- accessibility and keyboard-navigation pass

### Acceptance criteria

- A scenario can be added through JSON without changing game components.
- Organizer can select a scenario before room creation.
- Player flow remains identical across scenarios.
- The room join URL can be opened from a generated QR code.

## PR 3: Connection Continuation

### Goal

Reduce the intention-to-action gap after a successful conversation.

### Scope

- anonymous follow-up interest selection
- reveal only when at least two players choose the same follow-up
- suggested follow-up formats such as coffee, game night, or another short activity
- privacy-safe consent copy
- organizer summary containing aggregate outcomes only

### Acceptance criteria

- Individual follow-up choices remain private unless a mutual match exists.
- The organizer cannot see individual private priorities or predictions.
- A mutual follow-up produces a clear, optional next action.

## Core Domain Model

```ts
type RoomPhase =
  | "lobby"
  | "private-choice"
  | "group-choice"
  | "peer-prediction"
  | "reveal";

type Player = {
  id: string;
  displayName: string;
  isHost: boolean;
  connected: boolean;
};

type PrivateSelection = {
  playerId: string;
  choices: Array<{ itemId: string; priorityId: string }>;
  primaryPriorityId: string;
};

type PeerPrediction = {
  authorPlayerId: string;
  targetPlayerId: string;
  predictedPriorityId: string;
};

type Scenario = {
  id: string;
  title: string;
  prompt: string;
  items: Array<{ id: string; label: string; emoji?: string }>;
  priorities: Array<{ id: string; label: string }>;
  privateSelectionCount: number;
  groupSelectionCount: number;
  discussionSeconds: number;
};
```

## Realtime Event Contract

### Client to server

- `room:create`
- `room:join`
- `room:resume`
- `game:start`
- `private-choice:submit`
- `group-choice:submit`
- `peer-prediction:submit`
- `game:restart`

### Server to client

- `room:state`
- `room:error`
- `phase:changed`
- `submission:accepted`
- `reveal:ready`

All event payloads must be validated against shared schemas. Clients request actions; the server owns room state and determines whether a transition is valid.

## Reveal Rules for PR 1

The reveal engine must remain deterministic and testable.

1. Count every priority selected during private choice.
2. Select the most frequent priority as common ground; report a tie when needed.
3. Find priorities shared by at least two players but absent from the submitted group choice metadata as hidden agreement.
4. Compare peer predictions with each target player's private priorities.
5. Report the target with the greatest number of incorrect predictions as the largest misread.
6. Use neutral language and avoid stable personality claims.

## Privacy and Safety Requirements

- Use display names only; do not request legal names, ethnicity, MBTI, or mental-health information.
- Keep private selections server-side until the reveal phase.
- Do not record conversation audio or transcripts.
- Do not infer personality, diagnosis, or cultural identity.
- Explain that insights describe one game session, not a player's character.
- Delete in-memory room data when the room expires or the process stops.

## Two-Person Work Split

### Developer A: Experience and psychology

- scenario wording and priority taxonomy
- player flow and facilitator prompts
- reveal language and interpretation boundaries
- accessibility, consent, and cross-cultural review
- user testing and demo narration

### Developer B: Realtime product implementation

- repository and build setup
- room state machine and Socket.IO events
- React screens and shared client state
- reveal algorithm implementation
- tests, deployment, and demo reliability

Both developers should review the reveal output and run the full multiplayer demo before merging.

## Suggested Implementation Order

1. Define shared scenario and room-state types.
2. Implement and test the room state machine without a UI.
3. Add create/join lobby screens.
4. Add private choice and server submission.
5. Add host-led group choice.
6. Add peer prediction.
7. Implement reveal calculations and screen.
8. Add reconnect and restart behavior.
9. Improve responsive layout and run multi-device testing.
10. Add one stretch feature only after the critical path is stable.

## Demo Reliability Checklist

- Prepare one host laptop and two participant phones or browser windows.
- Seed an optional demo room for recovery if live joining fails.
- Avoid dependencies on external datasets or AI APIs.
- Keep the reveal deterministic so the expected story can be rehearsed.
- Test on the venue network and one mobile hotspot.
- Verify timers, reconnect behavior, and mobile viewport sizes.
- Keep a screen recording as a fallback while demonstrating the live build first.

## Definition of Done

The MVP is complete when a judge can join a room, make a private choice, negotiate with the group, predict another player, and receive a meaningful reveal within three minutes.
