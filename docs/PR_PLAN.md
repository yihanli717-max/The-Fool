# Shared Mind Implementation Plan

## Product contract

Shared Mind is a multiplayer conversation experience, not a Jackbox-style
score game. The complete loop is:

```text
TEAM UP -> ANSWER -> REVEAL -> DISCUSS -> PREDICT -> KEEP TALKING
```

Tarot cards name conversation domains. They do not diagnose players, predict
the future, or assign fixed personality types.

## Delivered vertical slice

### Shared domain and harness

- Eight-card catalog with artwork, meanings, themes, and explicit 1–3 axes.
- Two-to-ten-player state machine with unique character assignment.
- Four-event rounds, latest-response indexing, and host-controlled revisions.
- Private prediction comparison and continuation routing.
- Player-specific projections that omit hidden scores and other players'
  prediction results.
- Deterministic fake generators, fallbacks, replay checks, and invariants.

### Realtime server

- Room create, join, resume, and disconnect handling.
- Host-only round start, event advance, revision, and Stage 2 controls.
- Per-player Socket.IO state emission instead of one public broadcast object.
- Server-only OpenAI Responses API integration using Structured Outputs.
- Runtime validation and static fallback for both generation tasks.
- Static serving for Tarot artwork and all ten pixel characters.

### Browser experience

- Independent per-tab sessions for local multiplayer testing.
- Lobby with unique character avatars and room-code sharing.
- Tarot/event split layout with private answer submission.
- Group choice reveal only after every active player answers.
- Ten-minute conversation break and host revision choice.
- Character-first prediction interface with Tarot-domain selection.
- Private matched and conversation-continuation result branches.
- Responsive layouts for laptops and phones.

## Realtime contract

### Client to server

- `room.create` — nickname
- `room.join` — nickname and room code
- `room.resume` — room code and temporary player ID
- `stage1.start` — host starts the first four-card round
- `event.answer` — event ID and visible option ID
- `event.advance` — host advances after the group reveal
- `round.continue-without-player` — host explicitly excludes a disconnected
  player from the active round
- `round.revise` — host generates fresh situations for the same four domains
- `stage2.start` — host opens private predictions
- `prediction.submit` — target, Tarot card, and predicted domain position

### Server to client

- `room.joined`
- `room.state` — viewer-specific privacy projection
- `room.error`

## AI boundary

The browser never receives the API key, numeric answer scores, another
participant's ground truth, or the match/mismatch comparison.

Two prompt packs are used:

1. `tarot_event_prompt_pack/` creates one new event for each of four selected
   Tarot domains.
2. `tarot_continuation_prompt_pack/` creates exactly three new conversation
   directions after a private mismatch.

The server calls `responses.parse()` with a Zod-derived Structured Output,
then passes the parsed value through the stricter Shared Mind domain
validator. Invalid, timed-out, refused, or unavailable responses become
validated local fallback content.

## Acceptance criteria

- Two browser tabs can create and join one room with different characters.
- A solo host cannot begin, while two connected players can.
- All four events complete without revealing scores to either browser.
- A disconnected player blocks the round until reconnection or host action.
- A revision round replaces latest ground truth per player and Tarot domain.
- Predictions cannot target oneself.
- Only the predictor receives their matched or continuation result.
- A mismatch never appears in user-facing copy as wrong, inaccurate, scored,
  or not knowing the target.
- No API key or demo-only event fixture is committed.
- `npm run harness`, `npm test`, `npm run typecheck`, and `npm run build`
  pass.

## Remaining demo-hardening work

The MVP intentionally keeps rooms in server memory. Before judging, rehearse
the full flow on the exact network and devices being used, review generated
copy from several live model calls, and keep fallback mode available as the
demo-safe path.
