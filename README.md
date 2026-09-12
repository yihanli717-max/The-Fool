# Common Ground

Common Ground is a browser-based multiplayer social experience that helps strangers understand how they make decisions together.

Players enter a room, make a private choice in a short scenario, negotiate a shared answer, predict one another's priorities, and receive a group reveal. The reveal highlights shared values, hidden agreement, and moments where a player's intention was misunderstood.

> We do not break the ice by asking people to describe themselves. We let them discover one another by making a decision together.

## Why It Exists

Most event tools optimize logistics: registration, schedules, rooms, and attendance. They do not solve the harder problem of helping the people in the room form a meaningful connection.

Common Ground gives organizers a lightweight, reusable activity while giving participants a structured reason to talk. Its core interaction is designed around three perspectives:

- **Meant:** what a player privately valued.
- **Expressed:** what the group eventually chose.
- **Heard:** what other players believed that person valued.

The differences between those perspectives create the final insight.

## MVP Flow

1. An organizer selects a scenario and creates a room.
2. Two to four players join with a short room code or QR code.
3. Each player privately selects three options and the reasons behind them.
4. The group has 90 seconds to agree on three shared options.
5. Each player predicts another player's strongest priority.
6. The application reveals common ground, hidden agreement, and the largest misread.
7. Players can anonymously express interest in a follow-up activity.

The first scenario is **Stranded Island**:

> Your group is stranded on an island. You may bring only three of eight items.

The interaction engine is scenario-independent. Future scenarios can reuse the same mechanics for student orientation, team building, hackathons, and cross-cultural events.

## Hackathon Scope

The first release intentionally excludes:

- account creation and authentication;
- participant profiling, MBTI, or identity-based clustering;
- automated seating and floor-plan optimization;
- catering and venue management;
- transcript recording or conversation surveillance;
- a general-purpose AI event planner;
- production persistence and analytics.

This scope keeps the product focused on one complete, demonstrable social loop.

## Psychology-Informed Design

Common Ground uses behavioral choices instead of personality labels. Players show their priorities through decisions, negotiation, and peer perception rather than being categorized by a questionnaire.

The MVP follows four design principles:

- **Low cognitive load:** choices are short, visual, and bounded.
- **Progressive disclosure:** private reflection happens before group discussion.
- **Perspective-taking:** players actively predict what another person valued.
- **Participant agency:** players may skip sensitive prompts and are not assigned psychological diagnoses.

The reveal describes behavior within one activity. It does not claim to measure personality, mental health, or stable psychological traits.

## Cross-Cultural Design

The project is informed by the team's experience as Asian students navigating cross-cultural communication. It addresses universal situations such as uncertainty around indirect communication, hesitation to enter an unfamiliar conversation, and difficulty turning a pleasant interaction into a concrete follow-up.

Culture is never treated as a fixed personality type. The application does not infer ethnicity or expose identity information. Future scenarios may invite players to share cultural perspectives voluntarily and on their own terms.

## Technology

### Development environment

- **Editor:** Visual Studio Code
- **Language:** TypeScript
- **Frontend:** React with Vite
- **Backend:** Node.js with Express
- **Realtime transport:** Socket.IO
- **Validation:** Zod
- **Testing:** Node.js test runner with `tsx`
- **Editor support:** ESLint and Prettier VS Code extensions

VS Code is the recommended editor, not the compiler. TypeScript is compiled by `tsc`, while Vite handles the development and production web builds.

### Repository layout

```text
common-ground/
├── apps/
│   ├── web/                 # React participant interface
│   └── server/              # Express and Socket.IO room server
├── packages/
│   └── shared/              # Events, schemas, scenario types, and reveal logic
├── docs/
│   ├── HARNESS_LOOP.md
│   └── PR_PLAN.md
├── README.md
└── package.json
```

## Data Strategy

The MVP does not require a public dataset. It uses:

- scenario definitions stored as local fixtures;
- temporary player and room state kept in server memory;
- choices generated during the live session;
- deterministic reveal calculations derived from those choices.

Sample players may be used for development and judge demos. They must be clearly labeled as demo data. No sensitive participant profile data is needed.

## Reveal Logic

The first release uses transparent deterministic scoring rather than an opaque AI judgment.

- **Strongest common ground:** the priority selected by the greatest number of players.
- **Hidden agreement:** two or more players privately shared a priority that was not represented in the final group choice.
- **Biggest misread:** the largest difference between peer predictions and a player's stated private priority.
- **Group choice:** the three options submitted during the negotiation round.

AI-generated wording may be added later, but the underlying result should remain reproducible and explainable.

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

`npm run dev` starts both processes through the root workspace script:

- Web client: `http://localhost:5173`
- Socket.IO server: `http://localhost:3001`

Open `http://localhost:5173` in two to four browser tabs or phones. In the first tab, create a room. In the other tabs, enter the room code and join. The host can start once at least two players have joined.

Use `Ctrl+C` in the terminal to stop both processes.

### Run the multiplayer demo

1. Open the web client in two to four browser tabs.
2. Create a room in the first tab and copy the displayed room code.
3. Join that room from the remaining tabs using different display names.
4. Start **Stranded Island** from the host tab.
5. Each player selects three private items and submits them.
6. Discuss the options, then have the host submit the group decision.
7. Each player predicts another player's top priority.
8. Compare the group reveal: common ground, hidden agreement, and the biggest misread.

### Check the server

In another terminal, run:

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{"status":"ok"}
```

### Run the checks

These commands do not start the web server:

```bash
npm run harness
npm test
npm run typecheck
npm run build
```

The harness design is documented in [docs/HARNESS_LOOP.md](docs/HARNESS_LOOP.md).

Rooms are intentionally held in memory for the hackathon MVP. A browser refresh can resume an active room, but restarting the server expires all local rooms.

### Optional configuration

Copy [.env.example](.env.example) to `.env` only when changing the default local ports or the browser-to-server URL. The default setup requires no API keys or external datasets.

## Demo Story

The three-minute demo should show one uninterrupted session:

1. Create a room.
2. Join from two to four browser windows or phones.
3. Make private choices.
4. Submit a group choice.
5. Predict another player's priority.
6. Reveal one shared value, one hidden agreement, and one misread.

The central demo line is:

> We matched through a decision, but connected through what the decision revealed.

## Project Status

PR 1 MVP is implemented. The roadmap is organized in [docs/PR_PLAN.md](docs/PR_PLAN.md).

## Team

Built by a two-person HackCMU team combining product development, game design, cognitive psychology, and developmental psychology.
