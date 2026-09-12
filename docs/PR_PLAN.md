# Common Ground Implementation Plan

## Product Decision

Common Ground is not a Jackbox-style decision game and it is not an
event-logistics dashboard. It is a short, multiplayer connection loop for one
small group at an event.

Its thesis is:

> The best way to reduce social friction is to help people move from predicted
> similarity to an actual shared experience, then make the next step mutual.

The build must demonstrate this complete path:

```text
CREATE ACTIVITY -> JOIN -> PREFERENCE CARD -> CONVERSATION -> REFLECT -> CONTINUE
```

The room creator is the organizer/host and may also participate. A room is one
table of two to four people. This keeps the prototype demoable without a
database, a public dataset, or an unreliable AI matching claim.

## MVP User Flow

### 1. Organizer creates an activity

The host supplies:

- display name;
- activity name;
- event goal: `comfort`, `discovery`, or `continuation`;
- grouping mode: `comfort`, `discovery`, or `balanced`.

The host receives a short room code and waits for two to four people.

### 2. Participants join and set the tone

Every participant supplies a display name and a short preference card:

- one to three discussion interests;
- interaction style: `small-group` or `structured`;
- connection preference: `breadth` or `depth`;
- event intention: `casual`, `new-perspectives`, or `keep-in-touch`.

Only the participant and server see an individual card. The public room state
exposes a submitted/not-submitted indicator, never another person’s answers.

### 3. The group receives an initial connection prompt

When every connected participant has submitted, the server selects an
anonymized initial theme and a conversation starter from local fixtures.

- **Comfort mode:** choose the strongest obvious overlap.
- **Discovery mode:** choose a bridge theme that connects adjacent interests.
- **Balanced mode:** choose a shared theme, then use a broader prompt.

The UI shows a short facilitator prompt and a timer-free “talk together”
screen. The app does not record conversation audio or text.

### 4. Participants reflect on actual common ground

After the conversation, each person privately chooses the topic that actually
created energy or curiosity. The server aggregates votes and reveals only the
winning group-level actual theme.

```text
We predicted: Games and Japanese pop culture
You actually connected over: Creative game design
```

The language describes one interaction, not a stable personality trait.

### 5. Mutual continuation

Each person privately chooses one follow-up option:

- coffee next week;
- indie game night;
- study or co-working session;
- group chat;
- not today.

Only options selected by at least two people are revealed. Individual choices,
including a decision not to continue, remain private.

## Domain Model

```ts
type RoomPhase =
  | "lobby"
  | "preferences"
  | "conversation"
  | "reflection"
  | "follow-up"
  | "reveal";

type EventGoal = "comfort" | "discovery" | "continuation";
type GroupingMode = "comfort" | "discovery" | "balanced";

type PreferenceCard = {
  interestIds: string[];
  interactionStyle?: "small-group" | "structured";
  connectionStyle?: "breadth" | "depth";
  eventIntent?: "casual" | "new-perspectives" | "keep-in-touch";
};

type ActivityConfig = {
  title: string;
  eventGoal: EventGoal;
  groupingMode: GroupingMode;
};

type GroupTheme = {
  id: string;
  label: string;
  starter: string;
};

type RoomState = {
  phase: RoomPhase;
  activity: ActivityConfig;
  initialTheme?: GroupTheme;
  actualThemeId?: string;
  // Private preferences, reflections, and follow-ups remain server-only.
};
```

## Realtime Contract

### Client to server

- `room.create` — display name plus activity configuration
- `room.join` — display name plus room code
- `room.resume` — temporary room/player token after refresh
- `activity.start` — host starts the preference card stage
- `preferences.submit` — participant’s private card
- `conversation.begin` — host opens the initial group prompt
- `reflection.submit` — participant’s private actual-connection vote
- `follow-up.submit` — participant’s private follow-up choice
- `activity.restart` — host creates a fresh round in the same room

### Server to client

- `room.joined`
- `room.state` — privacy-safe public view
- `room.error`

All client payloads must be Zod-validated. The server owns phase transitions,
aggregate calculations, and privacy boundaries.

## Deterministic Matching and Reveal Rules

There is no external recommendation model in the MVP. Local fixtures map an
interest to one or more broad themes and starter prompts.

1. Count a theme once per participant card, even if they choose several
   interests that map to it.
2. Select the highest-count eligible theme; break ties deterministically by
   fixture order.
3. Select the prompt variant using the activity goal and grouping mode.
4. Count each participant’s reflection vote and reveal the highest-count theme
   as actual common ground.
5. Count follow-up choices; reveal only options with at least two selections.
6. Never put an individual preference, reflection, or follow-up choice in the
   public room view.

## Delivery Steps

### Step 1 — Product contract and docs

- Rewrite `README.md` around `MATCH -> CONNECT -> UNDERSTAND -> CONTINUE`.
- Replace this plan and the old game-specific acceptance criteria.

### Step 2 — Shared domain and deterministic harness

- Remove the Stranded Island scenario and private-choice/prediction types.
- Add activity configuration, preference card, interest/theme fixtures,
  aggregation, mutual follow-up, and privacy invariants.
- Replace the harness with a two-person happy path.
- Add unit tests for tie-breaking, anonymity, and mutual-only follow-ups.

### Step 3 — Realtime server

- Replace old Socket.IO actions with the event flow above.
- Maintain room-code joining and refresh recovery.
- Ensure every outgoing room state is a public projection.

### Step 4 — Organizer and participant UI

- Organizer creation form: activity title, event goal, and grouping mode.
- Participant join form and preference card.
- Lobby, conversation prompt, private reflection, private continuation, and
  group reveal screens.
- Explain what is private before each sensitive action.

### Step 5 — Demo verification

- Test locally in two to four tabs.
- Test from phones through Tailscale.
- Verify that no individual answers appear in another tab.
- Rehearse one three-minute story: create, join, connect, reflect, continue.

## Non-goals

- automated table assignment for a large attendee list;
- accounts, database persistence, or analytics;
- MBTI, ethnicity, diagnosis, or personality inference;
- audio capture, transcripts, or conversation surveillance;
- venue, catering, schedule, or equipment management;
- calendar invites or direct group-chat creation;
- external public datasets or opaque AI matching.

## Acceptance Criteria

- Two to four people can complete the full flow in one room without refresh.
- The host can create an activity and select its goal and grouping mode.
- Individual preference cards are never exposed to other participants or the
  organizer.
- All clients receive the same anonymized initial and actual group themes.
- A follow-up is shown only when at least two people selected it.
- Invalid actions and out-of-phase submissions are rejected by the server.
- Refreshing a client restores the participant’s active room while the server
  remains running.
- `npm run harness`, `npm test`, `npm run typecheck`, and `npm run build` pass.
