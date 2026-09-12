# Common Ground

**Common Ground turns a room of strangers into a group with a next step.**

It is a realtime, browser-based experience for orientations, hackathon mixers,
student events, and team retreats. An organizer sets the purpose of a small
activity; participants share a few low-stakes interaction preferences; the
group receives a privacy-safe conversation prompt; and, after talking, people
can anonymously opt into a concrete follow-up.

> We do not decide who a person is from a profile. We help a group discover
> what actually connects them.

Common Ground is built for HackCMU's **Multiplayer** track. The multiplayer
interaction is the product: the value emerges only when people in the same
room respond, talk, reflect, and choose what to do next together.

## Product Thesis

Most event tools optimize logistics: registration, calendars, rooms, and
attendance. The harder problem starts after people arrive: how do strangers
move from being placed near one another to forming a real connection?

Common Ground addresses that transition with one short, facilitated loop:

```text
MATCH -> CONNECT -> UNDERSTAND -> CONTINUE
```

| Stage | Participant experience | Product purpose |
| --- | --- | --- |
| **MATCH** | Share a short, optional preference card and join a small group. | Give an organizer a starting point without reducing people to labels. |
| **CONNECT** | Receive an anonymized shared theme and a tailored conversation starter. | Make the first interaction less awkward. |
| **UNDERSTAND** | Lightly mark what the group actually clicked on after the conversation. | Separate predicted similarity from real connection. |
| **CONTINUE** | Privately opt into a next activity; reveal it only when interest is mutual. | Close the intention-to-action gap. |

The intended moment of delight is:

> We matched you because of anime. But you actually connected over game design.

## The Hackathon MVP

The MVP supports **one organizer and a single group of two to four
participants**. It is deliberately focused on an end-to-end social loop, not a
full event-management system.

### 1. Create an activity — organizer

The organizer creates a room and provides:

- activity name, such as *Hackathon Mixer* or *International Student Welcome*;
- one event goal: meet people comfortably, discover new perspectives, or form
  a small follow-up group;
- a grouping mode:
  - **Comfort** — prioritize obvious common ground;
  - **Discovery** — surface a bridge between different interests;
  - **Balanced** — include both familiarity and novelty.

The organizer receives a room code to share. In the MVP, a room represents one
table; automatic grouping across a large attendee list is explicitly out of
scope.

### 2. Join and set the tone — participant

Each participant joins with a display name and completes a short preference
card. The card uses behavioral, event-specific prompts rather than MBTI,
ethnicity, diagnoses, or personality claims:

- interests they would be happy to discuss;
- preferred interaction style: small-group conversation or a more structured
  activity;
- desired depth: meet many people or get to know a few people well;
- what they hope to get from this event.

All prompts are optional except a display name. The app stores only the
choices needed for the current session.

### 3. Discover actual common ground — group

Once at least two people have joined, Common Ground aggregates the group’s
preferences without showing who selected what. It presents:

- an **initial shared theme** (for example, *games and Japanese pop culture*);
- one low-pressure conversation starter suited to the event goal and grouping
  mode;
- a short prompt that asks the group to mark the topic that genuinely created
  energy or curiosity.

The reveal makes the distinction clear:

```text
Predicted common ground: Japanese pop culture
Actual common ground: Creative game design
```

This protects participants from being locked into their questionnaire labels
and supports perspective-taking without pretending to assess personality.

### 4. Turn connection into action — group

At the end, each person can privately choose one optional follow-up, such as:

- coffee next week;
- an indie game night;
- a study or co-working session;
- no follow-up today.

Individual responses remain private. The room sees a follow-up only when at
least two people choose the same option; otherwise the app simply thanks the
group. This lowers the social friction of being the first person to ask.

## Why This Is Psychology-Informed

The experience draws on cognitive and developmental psychology without making
clinical or trait-based claims.

- **Lower cognitive load:** the preference card is short, concrete, and
  optional.
- **Progressive disclosure:** people reflect individually before the group is
  shown an aggregate theme.
- **Perspective-taking:** the group compares an initial prediction with what
  actually made the conversation meaningful.
- **Agency and privacy:** participants choose what to share and whether to opt
  into any continuation.
- **Intention to action:** mutual, anonymous interest makes a next step easier
  than an unstructured “we should hang out sometime.”

The experience is informed by the team’s perspective as Asian students
navigating cross-cultural conversations. Culture is never inferred or treated
as a fixed type; sharing a cultural perspective is always voluntary.

## Data and Privacy

This project does **not** require a public dataset or a trained matching model.
The MVP uses local fixtures for starter prompts and follow-up options, plus
temporary choices created during the live session.

- Room and preference data live only in server memory for the current demo.
- No account, legal name, audio recording, transcript, ethnicity, MBTI, or
  mental-health data is collected.
- The organizer sees group-level themes, never a participant’s individual
  preferences or follow-up choice.
- Restarting the local server expires all rooms.

## Current Build Plan

The repository initially contained a **Stranded Island** group-decision game.
That was a useful realtime technical prototype, but it is not the final product
described above. The implementation is being replaced in this order:

1. Define the Common Ground product contract in this README.
2. Replace the old game domain with event, preference-card, group-theme, and
   mutual-follow-up types.
3. Replace Socket.IO events and server transitions with the four-stage flow.
4. Replace the browser screens with organizer and participant experiences.
5. Add deterministic tests for anonymization, theme selection, and mutual
   follow-up reveals.
6. Run a two-to-four-person local and multi-device demo.

The first phase is intentionally a single table of two to four participants.
Large-event auto-grouping, QR generation, persistent accounts, calendar
integration, catering, venue planning, and AI profiling are post-hackathon
extensions.

## Technology

- **Editor:** Visual Studio Code
- **Language:** TypeScript
- **Frontend:** React with Vite
- **Backend:** Node.js with Express
- **Realtime transport:** Socket.IO
- **Validation:** Zod
- **Testing:** Node.js test runner with `tsx`
- **Formatting and linting:** Prettier and ESLint

```text
common-ground/
├── apps/
│   ├── web/                 # Organizer and participant browser experience
│   └── server/              # Express and Socket.IO room server
├── packages/
│   └── shared/              # Domain types, matching, and privacy-safe reveal rules
├── docs/
│   ├── HARNESS_LOOP.md
│   └── PR_PLAN.md
├── README.md
└── package.json
```

## Run Locally

### Prerequisites

- Node.js 22.12 or newer
- npm 10 or newer
- Two to four browser tabs, phones, or browser windows for a multiplayer demo

### Install and start

From the repository root:

```bash
npm install
npm run dev
```

This starts both processes:

- web client: `http://localhost:5173`
- Socket.IO server: `http://localhost:3001`

Open `http://localhost:5173` in two to four browser tabs. Keep the terminal
running; `Ctrl+C` stops both services. The current server state is in memory,
so server restarts clear active rooms.

### Test with several local participants

1. In tab one, enter a display name and create an activity room.
2. Copy its room code.
3. In every other tab, enter a **new display name** and that room code before
   selecting **Join room**.
4. Use an incognito window if a tab restores an old session.

Each tab creates a separate realtime connection. A second participant must
enter both a display name and a room code; the first tab’s name is not shared
automatically.

### Test from other devices with Tailscale

Install and sign in to Tailscale on the host computer and every test device.
On the host, find its Tailscale IPv4 address:

```bash
tailscale ip -4
```

With `npm run dev` running on the host, open
`http://<tailscale-ip>:5173` from the other devices. The web client connects to
the Socket.IO server on the same host at port `3001`.

If a firewall blocks it, allow inbound TCP ports `5173` and `3001`. The
development CORS configuration accepts Tailscale IPv4 addresses; for another
hostname or proxy, add it to `CLIENT_ORIGIN` as a comma-separated origin in a
local `.env` file based on [.env.example](.env.example).

### Checks

```bash
npm run harness
npm test
npm run typecheck
npm run build
```

## Team

Built by a two-person HackCMU team combining product development, cognitive
psychology, developmental psychology, and cross-cultural experience.
