# Shared Mind

**Shared Mind is a multiplayer conversation experience that helps people learn how they understand one another.**

Players respond to short, everyday decision scenarios. Each scenario belongs
to a Tarot card used as a narrative conversation domain, not as a diagnosis or
a personality test. After discussing their choices, players predict how other
people tend to approach a domain. The application then turns each prediction
into a private, low-pressure opportunity to continue talking.

Shared Mind is designed for HackCMU's **Multiplayer** track. Its value comes
from several people making choices in the same room, seeing one another's
responses, discussing the reasons behind them, and testing whether a later
prediction reflects real understanding.

> Tarot gives the conversation a memorable language. It does not define who a
> person is.

## Product thesis

Many social experiences stop after people exchange names or answer a few
icebreaker questions. Shared Mind creates a more meaningful loop:

```text
ANSWER TOGETHER -> DISCUSS -> PREDICT -> KEEP TALKING
```

The product is not trying to rank people or produce a psychological profile.
It makes differences in interpretation visible, then gives the group a more
natural next topic.

## Target experience

The MVP supports **2–10 participants** in one room:

- one participant is the host;
- all other participants join as members;
- every participant receives a unique 2D pixel character;
- no account or login is required;
- the host controls when the group advances or revises a round.

The room code is the entry point for the session. A participant enters a
nickname, joins with the code, and receives a character that is not assigned
to anyone else in that room. Characters and nicknames remain visible as the
lightweight social map for the session.

## End-to-end flow

### 1. Team up

The host enters a nickname and creates a room. The server generates a room
code and assigns the host a pixel character. Members enter their nicknames and
the room code; the server assigns each member another unused character.

The room can start only when at least two participants are present. The host
is the only person who can start the activity or decide whether to run another
round.

### 2. Activity Stage 1: establish ground-truth choices

The server randomly selects four Tarot cards from the card catalog. Each card
has an image, a title, and a general-meaning description stored in the card
data.

For each selected card, the server asks the OpenAI API to generate one
everyday event question with three choices that express different positions on
that card's conversation domain. The generated event is shown in a two-column
layout:

- **left:** Tarot image, card title, and general meaning;
- **right:** event title, question, and three choices.

Every participant makes exactly one choice. After everyone has answered that
event, the room sees the participants' selected choices before moving to the
next event. The group repeats this process for all four cards.

The options have an internal domain score from 1 to 3. The score is not a
personality score and is not shown as a judgment. It records the participant's
position on the particular decision axis represented by that event. The order
of the choices must not be treated as the score; each choice stores its own
explicit score.

Example internal mapping:

```text
The Fool — comfort with uncertainty
1 = prefers preparation and familiar paths
2 = balances preparation with exploration
3 = welcomes experimentation despite uncertainty
```

The application stores the selected option and its domain score as the
participant's ground truth for that Tarot event.

### 3. Conversation break

After the four events, the application announces a **10-minute conversation
break**. Participants discuss why they chose their answers offline or in the
room. The application may show a neutral reminder such as:

> Take a few minutes to compare the situations that shaped your choices.

The application should not coach participants toward a supposedly correct
interpretation. The purpose of this break is to let people explain themselves
in their own words.

### 4. Host-controlled revision rounds

After the break, the host chooses whether to:

1. run another ground-truth round with four fresh event questions based on the
   Tarot domains already selected; or
2. continue to the prediction stage.

A revision round keeps the social rhythm but changes the situation. It is not
the same question repeated. If a Tarot appears in more than one round, the
server keeps the latest relevant response for that Tarot when it prepares the
prediction stage. The host can repeat this decision after each round.

This gives the group a way to say, “let's explore this domain from another
angle,” without forcing the session to run longer than the group wants.

### 5. Activity Stage 2: predict another participant

The prediction stage shows each participant the other participants' pixel
characters and nicknames. The characters occupy stable positions on the
screen, with unused positions removed for smaller rooms.

This stage is presented as a small pixel-world conversation scene rather than
a list or scoreboard. The interface reserves nine fixed character positions
for the other possible participants, keeps the viewer's own character at the
bottom of the scene, and animates that character walking toward the selected
person. The conversation dialog opens only after the character arrives.

For each target participant:

1. the predictor clicks the target's character;
2. a white conversation dialog opens at the bottom of the scene;
3. the predictor chooses a previously explored Tarot lens;
4. the dialog presents exactly three positions using the Tarot title, general
   meaning, and the domain's three non-judgmental approaches;
5. the predictor chooses the position that they believe best matches how the
   target approaches the relevant kind of situation;
6. the server records the prediction privately for that predictor-target-card
   pair.

Predictions are grouped by Tarot. If the same Tarot was explored in multiple
rounds, the latest prediction is the one retained for the session result. The
target's actual choice and domain score remain server-side evaluation data.

### 6. Continue the conversation

After a prediction, the application compares the predicted domain position
with the target participant's recorded ground-truth position.

#### If the prediction matches

The participant receives a warm confirmation, for example:

> You know them in this Tarot domain: you noticed a similar way of approaching uncertainty.

This branch can lead to a simple positive follow-up message or another
optional conversation direction.

#### If the prediction does not match

The mismatch is a **private routing signal**, not a result shown to the user.
The interface must not say that the predictor was wrong, that they do not know
the target, or that the target has a hidden score.

The server calls the Tarot-domain conversation continuation generator. It uses
the target's actual response internally and returns exactly three new ways to
talk in the same broad domain:

- **new situation:** a fresh, relatable situation;
- **different angle:** another tradeoff, value, constraint, or perspective;
- **future bridge:** a low-pressure imagined variation or possible next step.

These directions should not ask, “Why did you choose the original answer?”
They should not repeat the original event, expose the hidden comparison, or
turn the conversation into an assessment. The goal is to help the pair keep
talking about the domain from a new angle, so the interaction feels like
discovery rather than correction.

The three directions remain inside the selected character's bottom dialog.
When the predictor selects one, the interface expands it into a shared
“Start this conversation with …” prompt while both pixel characters remain
part of the scene. This visual handoff is the final product action: the prompt
leads back to human conversation, and there is no additional answer to submit
or score.

Example for a mismatch in **The Fool** domain:

```text
A smaller first step
If you wanted to try something unfamiliar without changing your whole routine,
what small version would feel worth trying?

What is worth keeping
When you make room for something new, what part of the familiar plan would you
want to preserve?

Making change easier
What kind of support, information, or timing would make an unfamiliar choice
feel more approachable?
```

The generated directions are sent only to the participant who requested that
conversation branch. The target's answer, score, and the prediction result
must never be included in the generated text or sent to the other participant.

## Data model

The MVP needs a small, explicit data model rather than a public dataset or a
trained matching model.

### Tarot card catalog

The card catalog contains eight cards. Each card should provide:

- stable `id`;
- image asset or image URL;
- display name;
- general meaning text;
- narrative archetype and themes;
- a domain score axis with meanings for scores 1, 2, and 3.

The card catalog describes conversation domains. It must not contain claims
that a card reveals a participant's personality, culture, mental state, or
future.

### Generated event

Each event belongs to one card and one activity round:

```text
eventId
roundId
cardId
title
question
options: [{ id, text, score: 1 | 2 | 3 }]
```

The event generator must produce exactly three meaningful choices, with one
explicit score per choice. Choices should represent a spectrum or meaningful
tradeoff, not an obviously correct answer.

### Ground truth response

For each participant and event, the server records:

```text
participantId
eventId
cardId
optionId
score
```

This is session data. It is used to evaluate predictions and to guide a
continuation prompt, not to construct a permanent user profile.

### Prediction

The server records predictions by predictor, target, and Tarot domain:

```text
predictorId
targetParticipantId
cardId
predictedScore
```

If a Tarot is revisited, the latest prediction for that domain replaces the
earlier one for the current session.

### Conversation continuation

The continuation generator returns a structured object with an opening and
exactly three directions. The three directions have the modes
`new-situation`, `different-angle`, and `future-bridge`.

The generator receives the target's actual option and score only as private
server-side context. The client receives only safe conversational copy.

## AI and implementation boundaries

There are two separate generation tasks:

1. **Event generation:** create the four ground-truth scenarios for the
   selected Tarot domains.
2. **Conversation continuation:** after a private mismatch, create three new
   directions in the same domain without revealing the mismatch.

Both calls belong on the server. The browser must never receive
`OPENAI_API_KEY`, the target's hidden answer, or the numeric comparison data.
The integration should use structured JSON output and validate the response
before showing it. If the API is unavailable, times out, refuses a request, or
returns invalid data, the activity should use a safe static fallback and keep
the multiplayer session moving.

The current implementation plan intentionally treats the card catalog as
static data and the event/continuation generation as replaceable services.
The existing demo event fixture is not part of this README reset; its content
should not constrain the new game flow.

## Psychology-informed design

The team combines developmental psychology, cognitive psychology, software
implementation, and lived experience as Asian students navigating
cross-cultural conversations.

The psychology background informs interaction design rather than diagnosis:

- **Lower cognitive load:** each event asks for one concrete decision;
- **Progressive disclosure:** answer privately before the group reveal, then
  discuss before predicting;
- **Perspective-taking:** predict another person's approach after hearing the
  reasons behind their choices;
- **Agency:** participants may choose how much to explain and whether to follow
  a generated direction;
- **New-angle continuation:** a mismatch opens another topic instead of
  labeling either person;
- **Cultural humility:** cultural sharing is invited, never inferred or
  treated as a fixed category.

The application must not use ethnicity, nationality, MBTI, diagnoses, or
family assumptions to determine a participant's behavior. An Asian identity
can inform the team's motivation for building the experience, but it is never
used as a prediction feature or a stereotype.

## Privacy and safety

- No login is required for the MVP.
- Use nicknames and temporary room identifiers only.
- Keep room state in server memory or another short-lived local store during
  the demo.
- Do not send names, contact details, or sensitive personal data to the model.
- Do not store the target's hidden score in the browser.
- Do not expose prediction correctness as a public score or leaderboard.
- Treat Tarot as narrative framing, not fortune-telling or scientific
  assessment.
- Avoid medical, clinical, sexual, illegal, self-harm, and highly sensitive
  prompts.
- Make cultural examples optional and non-stereotyping.

## Technology and repository

The current repository uses a TypeScript monorepo:

- **Frontend:** React and Vite;
- **Backend:** Node.js, Express, and Socket.IO;
- **Shared domain:** TypeScript types, deterministic rules, and validation;
- **Testing:** Node.js test runner with `tsx`;
- **Editor:** Visual Studio Code.

```text
hackcmu-2026/
├── apps/
│   ├── web/                  # Multiplayer browser experience
│   └── server/               # Room state, rules, and AI calls
├── packages/
│   └── shared/               # Shared domain types and deterministic logic
├── pixel characters/         # Ten unique 64x64 participant sprites
├── Tarot Images/             # Tarot artwork
├── tarot_event_prompt_pack/  # Four-event structured generator prompt
├── tarot_continuation_prompt_pack/
├── docs/                     # Implementation plans and harness notes
├── README.md
└── package.json
```

The browser receives a player-specific room projection. Numeric ground truth,
prediction comparisons, other players' private results, and
`OPENAI_API_KEY` stay on the server.

## Run locally

### Prerequisites

- Node.js 22.12 or newer;
- npm 10 or newer;
- two browser tabs, windows, or devices for a local multiplayer demo.

### Install and start

From the repository root:

```bash
npm install
npm run dev
```

This starts:

- web client: `http://localhost:5173`;
- Socket.IO server: `http://localhost:3001`.

Open the web client in two or more separate tabs. In the first tab, create a
room as the host. In each other tab, use a different nickname and join with
the room code. Each tab represents a separate participant connection.

Each tab uses `sessionStorage`, so its room identity is independent. Use
**Leave this tab** if a tab resumes an old participant and you want it to act
as someone new.

### Public demo

Play the deployed application at
[`https://the-fool-web.vercel.app/`](https://the-fool-web.vercel.app/).

To test multiplayer, open the public link in two or more separate browser
tabs, windows, or devices. Create a room in the first tab, then join it from
the other tabs with different nicknames and the room code.

The public web client connects to the Socket.IO server at
[`https://the-fool-s0ub.onrender.com`](https://the-fool-s0ub.onrender.com).
The backend's health check is available at
[`https://the-fool-s0ub.onrender.com/health`](https://the-fool-s0ub.onrender.com/health);
the backend root is not a web page and may return `Cannot GET /`.

The backend uses Render's free instance for the demo. If it has been idle, the
first request may take up to about a minute while the service wakes up.

To enable live scenario and continuation generation, put the key in the root
`.env` file:

```dotenv
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.4-mini
```

The key is optional. Without it—or if a request fails or returns invalid
output—the server uses the validated local fallback and the activity keeps
moving. Never put the key in a `VITE_` variable; those values are exposed to
the browser. Both `.env` and `tarot_demo_events.json` are intentionally
ignored by Git.

To demo from another laptop on the same network, keep `npm run dev` running
on the host laptop and open `http://HOST_LAN_IP:5173` on the teammate's
device. Both devices connect to the host's port 3001 automatically. Allow the
two ports through the host firewall if prompted.

Room state is temporary. Restarting the server clears active rooms; accounts
and permanent profiles are outside the MVP.

### Checks

```bash
npm run harness
npm test
npm run typecheck
npm run build
```

## Status

The feature branch implements the end-to-end Shared Mind MVP:

- two-to-ten-player rooms with unique pixel characters and refresh recovery;
- four-card generated or fallback event rounds with private answers;
- all-player reveals, conversation break, and host revision controls;
- private predictions using the latest ground truth for each Tarot domain;
- structured continuation generation with a privacy-safe fallback;
- a nine-position pixel conversation scene with a bottom dialog and selectable
  future-communication paths;
- deterministic harness, domain tests, type checking, and production build.

## Team

Built by a two-person HackCMU team combining developmental and cognitive
psychology, software implementation, and Asian cross-cultural lived
experience.
