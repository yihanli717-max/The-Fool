import { useEffect, useMemo, useState } from "react";

import type {
  ItemChoice,
  PublicRoomView,
  Reveal,
  RoomPhase,
} from "@common-ground/shared";

import { socket } from "./socket.ts";

type Identity = {
  roomCode: string;
  playerId: string;
};

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

function priorityLabel(room: PublicRoomView, id: string): string {
  return room.scenario.priorities.find((priority) => priority.id === id)?.label ?? id;
}

function playerName(room: PublicRoomView, id: string): string {
  return room.players.find((player) => player.id === id)?.displayName ?? "A player";
}

function phaseLabel(phase: RoomPhase): string {
  return phase.replaceAll("-", " ");
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
      if (message === "Room session not found" || message === "This room no longer exists") {
        sessionStorage.removeItem(identityKey);
        setIdentity(null);
        setRoom(null);
        setError("This local demo room has expired. Create or join a room to continue.");
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
        <JoinScreen error={error} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <Header connected={connected} roomCode={room.code} />
      {error ? <p className="error-banner">{error}</p> : null}
      <section className="game-frame">
        <div className="phase-line">
          <span>Room update {room.revision}</span>
          <strong>{phaseLabel(room.phase)}</strong>
        </div>
        {room.phase === "lobby" ? (
          <Lobby room={room} currentPlayerId={currentPlayer.id} />
        ) : null}
        {room.phase === "private-choice" ? (
          <PrivateChoice room={room} currentPlayerId={currentPlayer.id} />
        ) : null}
        {room.phase === "group-choice" ? (
          <GroupChoice room={room} currentPlayer={currentPlayer} />
        ) : null}
        {room.phase === "peer-prediction" ? (
          <PeerPrediction room={room} currentPlayerId={currentPlayer.id} />
        ) : null}
        {room.phase === "reveal" && room.reveal ? (
          <RevealScreen room={room} reveal={room.reveal} currentPlayer={currentPlayer} />
        ) : null}
      </section>
    </main>
  );
}

function Header({ connected, roomCode }: { connected: boolean; roomCode?: string }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">A multiplayer social experiment</p>
        <h1>Common Ground</h1>
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
  const [roomCode, setRoomCode] = useState("");
  const canSubmit = displayName.trim().length > 0;

  const createRoom = () => {
    if (!canSubmit) return;
    socket.emit("room.create", { displayName: displayName.trim() });
  };
  const joinRoom = () => {
    if (!canSubmit || roomCode.trim().length < 4) return;
    socket.emit("room.join", {
      displayName: displayName.trim(),
      roomCode: roomCode.trim().toUpperCase(),
    });
  };

  return (
    <section className="join-layout">
      <div className="hero-copy">
        <p className="eyebrow">MEANT → EXPRESSED → HEARD</p>
        <h2>Discover what your group values by making a decision together.</h2>
        <p>
          Make a private choice, negotiate a shared answer, then see where your
          group found common ground—and where it misunderstood one another.
        </p>
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
        <button type="button" onClick={createRoom} disabled={!canSubmit}>
          Create a room
        </button>
        <div className="divider"><span>or join a room</span></div>
        <label>
          Room code
          <input
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            maxLength={8}
            placeholder="ABCDE"
          />
        </label>
        <button type="button" className="secondary" onClick={joinRoom} disabled={!canSubmit || roomCode.trim().length < 4}>
          Join room
        </button>
        {error ? <p className="inline-error">{error}</p> : null}
      </form>
    </section>
  );
}

function Lobby({ room, currentPlayerId }: { room: PublicRoomView; currentPlayerId: string }) {
  const currentPlayer = room.players.find((player) => player.id === currentPlayerId);
  const isHost = currentPlayer?.isHost ?? false;
  return (
    <section className="center-stage">
      <p className="eyebrow">Lobby</p>
      <h2>Invite 2–4 people to join</h2>
      <p className="lead">Share room code <strong>{room.code}</strong>. The host can begin once at least two people are here.</p>
      <div className="player-grid">
        {room.players.map((player) => (
          <article className="player-chip" key={player.id}>
            <span className={player.connected ? "presence present" : "presence away"} />
            <strong>{player.displayName}</strong>
            {player.isHost ? <small>host</small> : null}
          </article>
        ))}
      </div>
      {isHost ? (
        <button onClick={() => socket.emit("game.start")} disabled={room.players.length < 2}>
          Start Stranded Island
        </button>
      ) : (
        <p className="waiting">Waiting for the host to begin.</p>
      )}
    </section>
  );
}

function ChoiceBoard({
  room,
  choices,
  setChoices,
  primaryPriorityId,
  setPrimaryPriorityId,
}: {
  room: PublicRoomView;
  choices: ItemChoice[];
  setChoices: (choices: ItemChoice[]) => void;
  primaryPriorityId: string;
  setPrimaryPriorityId: (priorityId: string) => void;
}) {
  const toggleItem = (itemId: string) => {
    const existing = choices.find((choice) => choice.itemId === itemId);
    if (existing) {
      setChoices(choices.filter((choice) => choice.itemId !== itemId));
      return;
    }
    if (choices.length >= room.scenario.privateSelectionCount) return;
    setChoices([...choices, { itemId, priorityId: room.scenario.priorities[0]?.id ?? "" }]);
  };

  const updateReason = (itemId: string, priorityId: string) => {
    setChoices(choices.map((choice) => choice.itemId === itemId ? { ...choice, priorityId } : choice));
  };

  return (
    <>
      <div className="selection-count">{choices.length} / {room.scenario.privateSelectionCount} selected</div>
      <div className="item-grid">
        {room.scenario.items.map((item) => {
          const choice = choices.find((candidate) => candidate.itemId === item.id);
          return (
            <article className={choice ? "item-card selected" : "item-card"} key={item.id}>
              <button className="item-toggle" onClick={() => toggleItem(item.id)}>
                <span className="item-emoji">{item.emoji}</span>
                <span>{item.label}</span>
              </button>
              {choice ? (
                <label className="reason-select">
                  Why this item?
                  <select value={choice.priorityId} onChange={(event) => updateReason(item.id, event.target.value)}>
                    {room.scenario.priorities.map((priority) => <option value={priority.id} key={priority.id}>{priority.label}</option>)}
                  </select>
                </label>
              ) : null}
            </article>
          );
        })}
      </div>
      <label className="primary-select">
        What matters most to you in this round?
        <select value={primaryPriorityId} onChange={(event) => setPrimaryPriorityId(event.target.value)}>
          {room.scenario.priorities.map((priority) => <option value={priority.id} key={priority.id}>{priority.label}</option>)}
        </select>
      </label>
    </>
  );
}

function PrivateChoice({ room, currentPlayerId }: { room: PublicRoomView; currentPlayerId: string }) {
  const [choices, setChoices] = useState<ItemChoice[]>([]);
  const [primaryPriorityId, setPrimaryPriorityId] = useState(room.scenario.priorities[0]?.id ?? "");
  const submitted = room.privateSubmissionPlayerIds.includes(currentPlayerId);
  const submit = () => socket.emit("private-choice.submit", { choices, primaryPriorityId });

  return (
    <section>
      <p className="eyebrow">Private choice</p>
      <h2>{room.scenario.title}</h2>
      <p className="lead">{room.scenario.prompt} Your answers remain private until the final reveal.</p>
      {submitted ? <Waiting message="Your private choice is saved. Waiting for the group." /> : <><ChoiceBoard room={room} choices={choices} setChoices={setChoices} primaryPriorityId={primaryPriorityId} setPrimaryPriorityId={setPrimaryPriorityId} /><button onClick={submit} disabled={choices.length !== room.scenario.privateSelectionCount}>Lock in my choices</button></>}
    </section>
  );
}

function GroupChoice({ room, currentPlayer }: { room: PublicRoomView; currentPlayer: { id: string; isHost: boolean } }) {
  const [choices, setChoices] = useState<ItemChoice[]>([]);
  const [primaryPriorityId, setPrimaryPriorityId] = useState(room.scenario.priorities[0]?.id ?? "");
  if (!currentPlayer.isHost) {
    return <Waiting message="Discuss your choices together. The host will lock in the group decision." />;
  }
  return (
    <section>
      <p className="eyebrow">Group choice · suggested discussion time: {room.scenario.discussionSeconds} seconds</p>
      <h2>What will your group bring?</h2>
      <p className="lead">Talk it through, then the host captures the three items your group agrees on.</p>
      <ChoiceBoard room={room} choices={choices} setChoices={setChoices} primaryPriorityId={primaryPriorityId} setPrimaryPriorityId={setPrimaryPriorityId} />
      <button onClick={() => socket.emit("group-choice.submit", { choices })} disabled={choices.length !== room.scenario.groupSelectionCount}>Submit the group decision</button>
    </section>
  );
}

function PeerPrediction({ room, currentPlayerId }: { room: PublicRoomView; currentPlayerId: string }) {
  const others = room.players.filter((player) => player.id !== currentPlayerId);
  const [targetPlayerId, setTargetPlayerId] = useState(others[0]?.id ?? "");
  const [predictedPriorityId, setPredictedPriorityId] = useState(room.scenario.priorities[0]?.id ?? "");
  const submitted = room.predictionSubmissionPlayerIds.includes(currentPlayerId);
  return (
    <section className="prediction-panel">
      <p className="eyebrow">Perspective check</p>
      <h2>What do you think someone else valued most?</h2>
      {submitted ? <Waiting message="Your prediction is saved. Waiting for the rest of the group." /> : <><label>Choose a person<select value={targetPlayerId} onChange={(event) => setTargetPlayerId(event.target.value)}>{others.map((player) => <option key={player.id} value={player.id}>{player.displayName}</option>)}</select></label><label>What did they value most?<select value={predictedPriorityId} onChange={(event) => setPredictedPriorityId(event.target.value)}>{room.scenario.priorities.map((priority) => <option key={priority.id} value={priority.id}>{priority.label}</option>)}</select></label><button onClick={() => socket.emit("peer-prediction.submit", { targetPlayerId, predictedPriorityId })}>Make prediction</button></>}
    </section>
  );
}

function RevealScreen({
  room,
  reveal,
  currentPlayer,
}: {
  room: PublicRoomView;
  reveal: Reveal;
  currentPlayer: { isHost: boolean };
}) {
  const misread = reveal.biggestMisread;
  return (
    <section className="reveal-screen">
      <p className="eyebrow">MEANT → EXPRESSED → HEARD</p>
      <h2>Your group reveal</h2>
      <div className="reveal-grid">
        <article className="reveal-card"><span>Strongest common ground</span><strong>{reveal.commonGroundPriorityIds.map((id) => priorityLabel(room, id)).join(" + ")}</strong><p>These values appeared across the group’s private choices.</p></article>
        <article className="reveal-card"><span>Hidden agreement</span><strong>{reveal.hiddenAgreementPriorityIds.length ? reveal.hiddenAgreementPriorityIds.map((id) => priorityLabel(room, id)).join(" + ") : "None this round"}</strong><p>Shared privately, but not expressed in the group decision.</p></article>
        <article className="reveal-card misread"><span>Biggest misread</span>{misread ? <><strong>{playerName(room, misread.authorPlayerId)} thought {playerName(room, misread.targetPlayerId)} valued {priorityLabel(room, misread.predictedPriorityId)}.</strong><p>{playerName(room, misread.targetPlayerId)} actually chose {priorityLabel(room, misread.actualPriorityId)} as their top priority.</p></> : <><strong>Your group read one another accurately.</strong><p>Every prediction matched the target’s stated top priority.</p></>}</article>
      </div>
      <p className="reveal-note">This is one shared moment, not a personality test.</p>
      {currentPlayer.isHost ? <button onClick={() => socket.emit("game.restart")}>Play again</button> : null}
    </section>
  );
}

function Waiting({ message }: { message: string }) {
  return <div className="waiting-card"><span className="pulse" />{message}</div>;
}
