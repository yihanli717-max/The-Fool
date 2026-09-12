import { useEffect, useMemo, useState } from "react";

import {
  connectionThemes,
  followUpOptions,
  interests,
  type ActivityConfig,
  type ConnectionStyle,
  type EventGoal,
  type EventIntent,
  type GroupReveal,
  type GroupingMode,
  type InteractionStyle,
  type Player,
  type PreferenceCard,
  type PublicRoomView,
  type RoomPhase,
} from "@common-ground/shared";

import { socket } from "./socket.ts";

type Identity = { roomCode: string; playerId: string };

const identityKey = "common-ground.identity";

function loadIdentity(): Identity | null {
  const stored = sessionStorage.getItem(identityKey);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as Identity;
  } catch {
    sessionStorage.removeItem(identityKey);
    return null;
  }
}

function saveIdentity(identity: Identity): void {
  sessionStorage.setItem(identityKey, JSON.stringify(identity));
}

function phaseLabel(phase: RoomPhase): string {
  return {
    lobby: "Match",
    preferences: "Match",
    conversation: "Connect",
    reflection: "Understand",
    "follow-up": "Continue",
    reveal: "Your common ground",
  }[phase];
}

export function App() {
  const [identity, setIdentity] = useState<Identity | null>(loadIdentity);
  const [room, setRoom] = useState<PublicRoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const saved = loadIdentity();
      if (saved) socket.emit("room.resume", saved);
    };
    const onDisconnect = () => setConnected(false);
    const onJoined = (payload: {
      roomCode: string;
      playerId: string;
      state: PublicRoomView;
    }) => {
      const nextIdentity = { roomCode: payload.roomCode, playerId: payload.playerId };
      saveIdentity(nextIdentity);
      setIdentity(nextIdentity);
      setRoom(payload.state);
      setError(null);
    };
    const onRoomState = (nextRoom: PublicRoomView) => setRoom(nextRoom);
    const onRoomError = (message: string) => {
      if (message === "Room session not found" || message === "This activity room no longer exists") {
        sessionStorage.removeItem(identityKey);
        setIdentity(null);
        setRoom(null);
        setError("This local room has expired. Create or join an activity to continue.");
        return;
      }
      setError(message);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room.joined", onJoined);
    socket.on("room.state", onRoomState);
    socket.on("room.error", onRoomError);
    if (socket.connected) onConnect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room.joined", onJoined);
      socket.off("room.state", onRoomState);
      socket.off("room.error", onRoomError);
    };
  }, []);

  const currentPlayer = useMemo(
    () => room?.players.find((player) => player.id === identity?.playerId) ?? null,
    [identity?.playerId, room],
  );

  if (!room || !identity || !currentPlayer) {
    return (
      <main className="app-shell">
        <Header connected={connected} />
        {error ? <p className="error-banner">{error}</p> : null}
        <JoinScreen error={error} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <Header connected={connected} roomCode={room.code} activityTitle={room.activity.title} />
      {error ? <p className="error-banner">{error}</p> : null}
      <section className="experience-frame">
        <Progress phase={room.phase} />
        {room.phase === "lobby" ? <Lobby room={room} currentPlayer={currentPlayer} /> : null}
        {room.phase === "preferences" ? <PreferenceStage room={room} currentPlayer={currentPlayer} /> : null}
        {room.phase === "conversation" ? <Conversation room={room} currentPlayer={currentPlayer} /> : null}
        {room.phase === "reflection" ? <Reflection room={room} currentPlayerId={currentPlayer.id} /> : null}
        {room.phase === "follow-up" ? <FollowUp room={room} currentPlayerId={currentPlayer.id} /> : null}
        {room.phase === "reveal" && room.reveal ? (
          <RevealScreen reveal={room.reveal} currentPlayer={currentPlayer} />
        ) : null}
      </section>
    </main>
  );
}

function Header({
  connected,
  roomCode,
  activityTitle,
}: {
  connected: boolean;
  roomCode?: string;
  activityTitle?: string;
}) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">A multiplayer connection experience</p>
        <h1>Common Ground</h1>
        {activityTitle ? <p className="activity-title">{activityTitle}</p> : null}
      </div>
      <div className="status-stack">
        {roomCode ? <span className="room-code">Room {roomCode}</span> : null}
        <span className={connected ? "connection online" : "connection offline"}>
          {connected ? "Live" : "Reconnecting"}
        </span>
      </div>
    </header>
  );
}

function JoinScreen({ error }: { error: string | null }) {
  const [displayName, setDisplayName] = useState("");
  const [activityTitle, setActivityTitle] = useState("Hackathon mixer");
  const [eventGoal, setEventGoal] = useState<EventGoal>("discovery");
  const [groupingMode, setGroupingMode] = useState<GroupingMode>("balanced");
  const [roomCode, setRoomCode] = useState("");
  const hasName = displayName.trim().length > 0;
  const canCreate = hasName && activityTitle.trim().length > 0;
  const canJoin = hasName && roomCode.trim().length >= 4;

  const createRoom = () => {
    if (!canCreate) return;
    const activity: ActivityConfig = {
      title: activityTitle.trim(),
      eventGoal,
      groupingMode,
    };
    socket.emit("room.create", { displayName: displayName.trim(), activity });
  };

  const joinRoom = () => {
    if (!canJoin) return;
    socket.emit("room.join", {
      displayName: displayName.trim(),
      roomCode: roomCode.trim().toUpperCase(),
    });
  };

  return (
    <section className="join-layout">
      <div className="hero-copy">
        <p className="eyebrow">MATCH → CONNECT → UNDERSTAND → CONTINUE</p>
        <h2>Turn proximity into connection.</h2>
        <p>
          Common Ground gives a small group a gentle way to start talking, discover what
          actually clicked, and make a next step feel less awkward.
        </p>
        <div className="principle-list">
          <span>Private preferences</span>
          <span>Shared themes</span>
          <span>Mutual next steps</span>
        </div>
      </div>
      <form className="join-card" onSubmit={(event) => event.preventDefault()}>
        <label>
          Your display name
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={24}
            placeholder="e.g. Mei"
          />
        </label>
        <div className="form-divider"><span>Create an activity</span></div>
        <label>
          Activity name
          <input value={activityTitle} onChange={(event) => setActivityTitle(event.target.value)} maxLength={60} />
        </label>
        <div className="field-row">
          <label>
            Event goal
            <select value={eventGoal} onChange={(event) => setEventGoal(event.target.value as EventGoal)}>
              <option value="comfort">Meet comfortably</option>
              <option value="discovery">Discover perspectives</option>
              <option value="continuation">Form a next step</option>
            </select>
          </label>
          <label>
            Grouping mode
            <select value={groupingMode} onChange={(event) => setGroupingMode(event.target.value as GroupingMode)}>
              <option value="comfort">Comfort</option>
              <option value="discovery">Discovery</option>
              <option value="balanced">Balanced</option>
            </select>
          </label>
        </div>
        <button type="button" onClick={createRoom} disabled={!canCreate}>Create activity room</button>
        <div className="form-divider"><span>or join a room</span></div>
        <label>
          Room code
          <input
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            maxLength={8}
            placeholder="ABCDE"
          />
        </label>
        <button type="button" className="secondary" onClick={joinRoom} disabled={!canJoin}>Join room</button>
        {error ? <p className="inline-error">{error}</p> : null}
      </form>
    </section>
  );
}

function Progress({ phase }: { phase: RoomPhase }) {
  const activeIndex = ["lobby", "preferences", "conversation", "reflection", "follow-up", "reveal"].indexOf(phase);
  const steps = ["Match", "Connect", "Understand", "Continue"];
  const completedByStep = [1, 2, 3, 5];
  return (
    <div className="progress" aria-label={`Current stage: ${phaseLabel(phase)} `}>
      {steps.map((step, index) => (
        <span className={activeIndex >= (completedByStep[index] ?? Infinity) ? "progress-step active" : "progress-step"} key={step}>
          {step}
        </span>
      ))}
    </div>
  );
}

function Lobby({ room, currentPlayer }: { room: PublicRoomView; currentPlayer: Player }) {
  const isHost = currentPlayer.isHost;
  return (
    <section className="center-stage">
      <p className="eyebrow">Match · {room.activity.groupingMode} mode</p>
      <h2>Set the table for a real conversation.</h2>
      <p className="lead">Share room code <strong>{room.code}</strong>. The host can begin once two to four people are here.</p>
      <div className="activity-summary">
        <span>Goal</span><strong>{goalLabel(room.activity.eventGoal)}</strong>
        <span>Mode</span><strong>{room.activity.groupingMode}</strong>
      </div>
      <PlayerGrid players={room.players} />
      {isHost ? (
        <button onClick={() => socket.emit("activity.start")} disabled={room.players.length < 2}>
          Start the preference card
        </button>
      ) : <p className="waiting">Waiting for the host to begin.</p>}
    </section>
  );
}

function PlayerGrid({ players }: { players: Player[] }) {
  return (
    <div className="player-grid">
      {players.map((player) => (
        <article className="player-chip" key={player.id}>
          <span className={player.connected ? "presence present" : "presence away"} />
          <strong>{player.displayName}</strong>
          {player.isHost ? <small>host</small> : null}
        </article>
      ))}
    </div>
  );
}

function PreferenceStage({ room, currentPlayer }: { room: PublicRoomView; currentPlayer: Player }) {
  const submitted = room.preferenceSubmissionPlayerIds.includes(currentPlayer.id);
  const everyoneSubmitted = room.preferenceSubmissionPlayerIds.length === room.players.length;
  return (
    <section>
      <p className="eyebrow">Match · private preference card</p>
      <h2>Give your group a gentle starting point.</h2>
      <p className="lead">Your individual answers stay private. The group will only see an anonymized shared theme.</p>
      {submitted ? (
        <Waiting message="Your card is private and saved. Waiting for the group." />
      ) : (
        <PreferenceCard />
      )}
      <SubmissionStatus submitted={room.preferenceSubmissionPlayerIds.length} total={room.players.length} />
      {everyoneSubmitted ? (
        currentPlayer.isHost ? (
          <button onClick={() => socket.emit("conversation.begin")}>Reveal our conversation prompt</button>
        ) : <p className="waiting">Everyone is ready. The host will reveal your group prompt.</p>
      ) : null}
    </section>
  );
}

function PreferenceCard() {
  const [interestIds, setInterestIds] = useState<string[]>([]);
  const [interactionStyle, setInteractionStyle] = useState<InteractionStyle | "">("");
  const [connectionStyle, setConnectionStyle] = useState<ConnectionStyle | "">("");
  const [eventIntent, setEventIntent] = useState<EventIntent | "">("");

  const toggleInterest = (interestId: string) => {
    if (interestIds.includes(interestId)) {
      setInterestIds(interestIds.filter((id) => id !== interestId));
    } else if (interestIds.length < 3) {
      setInterestIds([...interestIds, interestId]);
    }
  };
  const submit = () => {
    const card: PreferenceCard = {
      interestIds,
      ...(interactionStyle ? { interactionStyle } : {}),
      ...(connectionStyle ? { connectionStyle } : {}),
      ...(eventIntent ? { eventIntent } : {}),
    };
    socket.emit("preferences.submit", { card });
  };

  return (
    <div className="private-card">
      <div className="section-heading">
        <div><h3>What would you be happy to discuss?</h3><p>Choose up to three. Skipping is okay.</p></div>
        <span>{interestIds.length} / 3</span>
      </div>
      <div className="interest-grid">
        {interests.map((interest) => {
          const selected = interestIds.includes(interest.id);
          return (
            <button
              type="button"
              className={selected ? "interest-card selected" : "interest-card"}
              key={interest.id}
              onClick={() => toggleInterest(interest.id)}
              aria-pressed={selected}
            >
              <span>{interest.emoji}</span>{interest.label}
            </button>
          );
        })}
      </div>
      <div className="field-row preferences-row">
        <label>
          I would rather…
          <select value={interactionStyle} onChange={(event) => setInteractionStyle(event.target.value as InteractionStyle | "")}>
            <option value="">Skip</option><option value="small-group">Talk in a small group</option><option value="structured">Use a structured activity</option>
          </select>
        </label>
        <label>
          Today I hope to…
          <select value={connectionStyle} onChange={(event) => setConnectionStyle(event.target.value as ConnectionStyle | "")}>
            <option value="">Skip</option><option value="breadth">Meet several people</option><option value="depth">Know a few people more deeply</option>
          </select>
        </label>
        <label>
          My event intention
          <select value={eventIntent} onChange={(event) => setEventIntent(event.target.value as EventIntent | "")}>
            <option value="">Skip</option><option value="casual">Have a relaxed conversation</option><option value="new-perspectives">Hear a new perspective</option><option value="keep-in-touch">Find people to keep in touch with</option>
          </select>
        </label>
      </div>
      <button type="button" onClick={submit}>Save my private card</button>
    </div>
  );
}

function Conversation({ room, currentPlayer }: { room: PublicRoomView; currentPlayer: Player }) {
  const theme = room.initialTheme;
  if (!theme) return null;
  return (
    <section className="conversation-screen">
      <p className="eyebrow">Connect · an anonymized starting point</p>
      <h2>Your table may connect through <em>{theme.label}.</em></h2>
      <p className="lead">No one’s individual preferences are displayed. Use this as an invitation, not a label.</p>
      <article className="starter-card">
        <span>Conversation starter</span>
        <strong>“{theme.starter}”</strong>
        <p>Take a few minutes to talk. Notice what actually creates energy or curiosity.</p>
      </article>
      {currentPlayer.isHost ? (
        <button onClick={() => socket.emit("reflection.open")}>Move to a private reflection</button>
      ) : <p className="waiting">Talk together. The host will open a short private reflection next.</p>}
    </section>
  );
}

function Reflection({ room, currentPlayerId }: { room: PublicRoomView; currentPlayerId: string }) {
  const [themeId, setThemeId] = useState(room.initialTheme?.id ?? connectionThemes[0]?.id ?? "");
  const submitted = room.reflectionSubmissionPlayerIds.includes(currentPlayerId);
  return (
    <section>
      <p className="eyebrow">Understand · private reflection</p>
      <h2>What did your group actually click on?</h2>
      <p className="lead">Pick the theme that created the most curiosity or energy. Your vote is private; only the group-level result will appear.</p>
      {submitted ? <Waiting message="Your reflection is saved. Waiting for the group." /> : (
        <>
          <div className="theme-grid">
            {connectionThemes.map((theme) => (
              <button type="button" key={theme.id} className={themeId === theme.id ? "theme-card selected" : "theme-card"} onClick={() => setThemeId(theme.id)}>
                <strong>{theme.label}</strong><span>{theme.description}</span>
              </button>
            ))}
          </div>
          <button onClick={() => socket.emit("reflection.submit", { themeId })}>Save my reflection</button>
        </>
      )}
      <SubmissionStatus submitted={room.reflectionSubmissionPlayerIds.length} total={room.players.length} />
    </section>
  );
}

function FollowUp({ room, currentPlayerId }: { room: PublicRoomView; currentPlayerId: string }) {
  const [optionId, setOptionId] = useState("");
  const submitted = room.followUpSubmissionPlayerIds.includes(currentPlayerId);
  return (
    <section>
      <p className="eyebrow">Continue · private choice</p>
      <h2>Would you like to keep this connection going?</h2>
      <p className="lead">Choose privately. An option is shown to the room only if at least two people choose the same one.</p>
      {submitted ? <Waiting message="Your choice is private and saved. Waiting for the group." /> : (
        <>
          <div className="follow-up-grid">
            {followUpOptions.map((option) => (
              <button type="button" className={optionId === option.id ? "follow-up-card selected" : "follow-up-card"} key={option.id} onClick={() => setOptionId(option.id)}>
                <strong>{option.label}</strong><span>{option.description}</span>
              </button>
            ))}
          </div>
          <button onClick={() => socket.emit("follow-up.submit", { followUpOptionId: optionId })} disabled={!optionId}>Save my private choice</button>
        </>
      )}
      <SubmissionStatus submitted={room.followUpSubmissionPlayerIds.length} total={room.players.length} />
    </section>
  );
}

function RevealScreen({ reveal, currentPlayer }: { reveal: GroupReveal; currentPlayer: Player }) {
  return (
    <section className="reveal-screen">
      <p className="eyebrow">Your group’s common ground</p>
      <h2>You started with a prediction. You made a real connection.</h2>
      <div className="reveal-grid">
        <article className="reveal-card"><span>Predicted common ground</span><strong>{reveal.initialTheme.label}</strong><p>{reveal.initialTheme.description}</p></article>
        <article className="reveal-card highlight"><span>Actual common ground</span><strong>{reveal.actualTheme.label}</strong><p>{reveal.actualTheme.description}</p></article>
        <article className="reveal-card"><span>Mutual next step</span><strong>{reveal.mutualFollowUps.length ? reveal.mutualFollowUps.map((match) => match.label).join(" + ") : "No shared plan yet"}</strong><p>{reveal.mutualFollowUps.length ? "At least two people chose this privately. You can decide together what happens next." : "That is okay. A good conversation does not need to become a commitment."}</p></article>
      </div>
      <p className="reveal-note">This is one shared moment, not a personality test. Individual preferences and choices remain private.</p>
      {currentPlayer.isHost ? <button onClick={() => socket.emit("activity.restart")}>Start another activity</button> : null}
    </section>
  );
}

function SubmissionStatus({ submitted, total }: { submitted: number; total: number }) {
  return <p className="submission-status"><span />{submitted} of {total} private responses saved</p>;
}

function Waiting({ message }: { message: string }) {
  return <div className="waiting-card"><span className="pulse" />{message}</div>;
}

function goalLabel(goal: EventGoal): string {
  return {
    comfort: "Meet comfortably",
    discovery: "Discover perspectives",
    continuation: "Form a next step",
  }[goal];
}
