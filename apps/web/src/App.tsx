import { useEffect, useMemo, useState } from "react";

import {
  demoPixelCharacterAssets,
  tarotCards,
  type TarotCard,
  type TarotOptionId,
  type TarotPlayer,
  type TarotPlayerView,
  type TarotScore,
  type ViewerPredictionResult,
} from "@common-ground/shared";

import { serverUrl, socket } from "./socket.ts";

type Identity = { roomCode: string; playerId: string };

const identityKey = "shared-mind.identity";
const scoreChoices = [1, 2, 3] as const;

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

function tarotCard(cardId: string): TarotCard | undefined {
  return tarotCards.find((card) => card.id === cardId);
}

function assetUrl(folder: "tarot" | "characters", fileName: string): string {
  return `${serverUrl}/assets/${folder}/${encodeURIComponent(fileName)}`;
}

function characterFile(characterId: string): string {
  return (
    demoPixelCharacterAssets.find((character) => character.id === characterId)
      ?.imageFile ?? "female.png"
  );
}

export function App() {
  const [identity, setIdentity] = useState<Identity | null>(loadIdentity);
  const [room, setRoom] = useState<TarotPlayerView | null>(null);
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
      state: TarotPlayerView;
    }) => {
      const nextIdentity = {
        roomCode: payload.roomCode,
        playerId: payload.playerId,
      };
      saveIdentity(nextIdentity);
      setIdentity(nextIdentity);
      setRoom(payload.state);
      setError(null);
    };
    const onRoomState = (nextRoom: TarotPlayerView) => {
      setRoom(nextRoom);
      setError(null);
    };
    const onRoomError = (message: string) => {
      if (
        message === "Room session not found" ||
        message === "This room no longer exists"
      ) {
        sessionStorage.removeItem(identityKey);
        setIdentity(null);
        setRoom(null);
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

  const leaveThisTab = () => {
    sessionStorage.removeItem(identityKey);
    window.location.reload();
  };

  if (!room || !identity || !currentPlayer) {
    return (
      <main className="app-shell">
        <Header connected={connected} />
        {error ? <p className="error-banner">{error}</p> : null}
        <JoinScreen />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <Header
        connected={connected}
        roomCode={room.code}
        onLeave={leaveThisTab}
      />
      {error ? <p className="error-banner">{error}</p> : null}
      <section className="experience-frame">
        <Progress room={room} />
        {room.phase === "lobby" ? (
          <Lobby room={room} currentPlayer={currentPlayer} />
        ) : null}
        {room.phase === "generating" ? <Generating room={room} /> : null}
        {room.phase === "answering" ? (
          <Answering room={room} currentPlayer={currentPlayer} />
        ) : null}
        {room.phase === "event-reveal" ? (
          <EventReveal room={room} currentPlayer={currentPlayer} />
        ) : null}
        {room.phase === "discussion" ? (
          <Discussion currentPlayer={currentPlayer} />
        ) : null}
        {room.phase === "predictions" ? (
          <Predictions room={room} currentPlayer={currentPlayer} />
        ) : null}
      </section>
    </main>
  );
}

function Header({
  connected,
  roomCode,
  onLeave,
}: {
  connected: boolean;
  roomCode?: string;
  onLeave?: () => void;
}) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">A multiplayer perspective-taking experience</p>
        <h1>Shared Mind</h1>
      </div>
      <div className="status-stack">
        {roomCode ? <span className="room-code">Room {roomCode}</span> : null}
        <span className={connected ? "connection online" : "connection offline"}>
          {connected ? "Live" : "Reconnecting"}
        </span>
        {onLeave ? (
          <button className="text-button" type="button" onClick={onLeave}>
            Leave this tab
          </button>
        ) : null}
      </div>
    </header>
  );
}

function JoinScreen() {
  const [displayName, setDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const hasName = displayName.trim().length > 0;
  const canJoin = hasName && roomCode.trim().length >= 4;

  return (
    <section className="join-layout">
      <div className="hero-copy">
        <p className="eyebrow">ANSWER → DISCUSS → PREDICT → KEEP TALKING</p>
        <h2>How well do we understand each other?</h2>
        <p>
          Choose how you would respond to everyday situations, hear the stories
          behind the choices, then explore how another person sees the same
          Tarot-inspired domain.
        </p>
        <div className="principle-list">
          <span>2–10 players</span>
          <span>Private evaluation</span>
          <span>No personality labels</span>
        </div>
      </div>
      <form className="join-card" onSubmit={(event) => event.preventDefault()}>
        <label>
          Your nickname
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={24}
            placeholder="e.g. Mei"
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          disabled={!hasName}
          onClick={() =>
            socket.emit("room.create", { displayName: displayName.trim() })
          }
        >
          Create room
        </button>
        <div className="form-divider">
          <span>or join someone</span>
        </div>
        <label>
          Room code
          <input
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            maxLength={8}
            placeholder="ABCDE"
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          className="secondary"
          disabled={!canJoin}
          onClick={() =>
            socket.emit("room.join", {
              displayName: displayName.trim(),
              roomCode: roomCode.trim().toUpperCase(),
            })
          }
        >
          Join room
        </button>
        <p className="privacy-note">
          Tip: open this URL in a second browser tab and use a different nickname
          to test multiplayer locally.
        </p>
      </form>
    </section>
  );
}

function Progress({ room }: { room: TarotPlayerView }) {
  const active =
    room.phase === "lobby"
      ? 0
      : room.phase === "generating" ||
          room.phase === "answering" ||
          room.phase === "event-reveal"
        ? 1
        : room.phase === "discussion"
          ? 2
          : 3;
  return (
    <div className="progress" aria-label="Activity progress">
      {["Team up", "Answer", "Discuss", "Predict"].map((label, index) => (
        <span
          className={index <= active ? "progress-step active" : "progress-step"}
          key={label}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function PlayerAvatar({
  player,
  selected = false,
  onClick,
}: {
  player: TarotPlayer;
  selected?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <img
        src={assetUrl("characters", characterFile(player.characterId))}
        alt=""
        className="pixel-character"
      />
      <span>
        <strong>{player.displayName}</strong>
        <small>
          {player.isHost ? "Host" : "Player"} · {player.connected ? "here" : "away"}
        </small>
      </span>
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={selected ? "player-avatar selected" : "player-avatar"}
      onClick={onClick}
    >
      {body}
    </button>
  ) : (
    <div className="player-avatar">{body}</div>
  );
}

function Lobby({
  room,
  currentPlayer,
}: {
  room: TarotPlayerView;
  currentPlayer: TarotPlayer;
}) {
  const connectedCount = room.players.filter((player) => player.connected).length;
  const canStart = currentPlayer.isHost && connectedCount >= 2;
  return (
    <section className="center-stage">
      <p className="eyebrow">Team up</p>
      <h2>Room {room.code} is gathering.</h2>
      <p className="lead">
        Share the code. Everyone receives a unique character and stays visible
        throughout the activity.
      </p>
      <div className="player-grid">
        {room.players.map((player) => (
          <PlayerAvatar player={player} key={player.id} />
        ))}
      </div>
      {currentPlayer.isHost ? (
        <>
          <button
            type="button"
            disabled={!canStart}
            onClick={() => socket.emit("stage1.start")}
          >
            Draw four Tarot domains
          </button>
          {!canStart ? (
            <p className="waiting">At least one more player must join.</p>
          ) : null}
        </>
      ) : (
        <p className="waiting">The host will draw the first four domains.</p>
      )}
    </section>
  );
}

function Generating({ room }: { room: TarotPlayerView }) {
  return (
    <section className="center-stage loading-stage">
      <span className="orb" />
      <p className="eyebrow">Round {room.currentRound?.index ?? 1}</p>
      <h2>Turning four Tarot domains into everyday situations…</h2>
      <p className="lead">
        If live generation is unavailable, Shared Mind will quietly use safe
        local scenarios so the room can continue.
      </p>
    </section>
  );
}

function TarotPanel({ card }: { card: TarotCard }) {
  return (
    <article className="tarot-panel">
      <img
        src={assetUrl("tarot", card.imageFile)}
        alt={card.name}
        className="tarot-image"
      />
      <p className="eyebrow">Conversation domain</p>
      <h2>{card.name}</h2>
      <p>{card.generalMeaning}</p>
      <span className="axis-label">{card.scoreAxis.label}</span>
    </article>
  );
}

function Answering({
  room,
  currentPlayer,
}: {
  room: TarotPlayerView;
  currentPlayer: TarotPlayer;
}) {
  const round = room.currentRound;
  const event = round?.event;
  const card = event ? tarotCard(event.cardId) : undefined;
  if (!round || !event || !card) {
    return <p className="waiting">Preparing this event…</p>;
  }
  const hasAnswered = round.viewerOptionId !== null;
  const disconnected = room.players.filter(
    (player) => !player.connected && player.id !== currentPlayer.id,
  );
  return (
    <section>
      <div className="round-meta">
        <span>Round {round.index}</span>
        <span>
          Event {round.currentEventIndex + 1} of {round.cardIds.length}
        </span>
        <span>
          {round.submittedCount}/{round.activePlayerCount} answered
        </span>
      </div>
      <div className="scenario-layout">
        <TarotPanel card={card} />
        <article className="scenario-card">
          <p className="eyebrow">Choose privately</p>
          <h2>{event.title}</h2>
          <p className="scenario-question">{event.question}</p>
          <div className="option-list">
            {event.options.map((option) => (
              <button
                type="button"
                key={option.id}
                className={
                  round.viewerOptionId === option.id
                    ? "choice selected"
                    : "choice"
                }
                disabled={hasAnswered}
                onClick={() =>
                  socket.emit("event.answer", {
                    eventId: event.id,
                    optionId: option.id,
                  })
                }
              >
                <span>{option.id}</span>
                {option.text}
              </button>
            ))}
          </div>
          {hasAnswered ? (
            <p className="privacy-note">
              Choice saved. It will appear after everyone answers; the internal
              comparison value stays on the server.
            </p>
          ) : null}
        </article>
      </div>
      {currentPlayer.isHost && disconnected.length > 0 ? (
        <div className="disconnect-panel">
          <strong>Someone disconnected?</strong>
          {disconnected.map((player) => (
            <button
              type="button"
              className="text-button"
              key={player.id}
              onClick={() =>
                socket.emit("round.continue-without-player", {
                  playerId: player.id,
                })
              }
            >
              Continue without {player.displayName}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EventReveal({
  room,
  currentPlayer,
}: {
  room: TarotPlayerView;
  currentPlayer: TarotPlayer;
}) {
  const round = room.currentRound;
  const event = round?.event;
  const card = event ? tarotCard(event.cardId) : undefined;
  const reveal = event
    ? round?.completedReveals.find((candidate) => candidate.eventId === event.id)
    : undefined;
  if (!round || !event || !card || !reveal) {
    return <p className="waiting">Collecting everyone’s choices…</p>;
  }
  return (
    <section>
      <div className="scenario-layout">
        <TarotPanel card={card} />
        <article className="scenario-card reveal-panel">
          <p className="eyebrow">Choices revealed</p>
          <h2>{event.title}</h2>
          <p className="scenario-question">{event.question}</p>
          <div className="reveal-list">
            {reveal.choices.map((choice) => (
              <div key={choice.playerId}>
                <strong>{choice.displayName}</strong>
                <span>
                  {choice.optionId}. {choice.optionText}
                </span>
              </div>
            ))}
          </div>
          <p className="privacy-note">
            Compare the experiences behind your choices. Different approaches are
            information, not a ranking.
          </p>
          {currentPlayer.isHost ? (
            <button type="button" onClick={() => socket.emit("event.advance")}>
              {round.currentEventIndex + 1 === round.cardIds.length
                ? "Start conversation break"
                : "Next situation"}
            </button>
          ) : (
            <p className="waiting">The host will continue when you are ready.</p>
          )}
        </article>
      </div>
    </section>
  );
}

function useCountdown(startingSeconds: number): number {
  const [seconds, setSeconds] = useState(startingSeconds);
  useEffect(() => {
    const timer = window.setInterval(
      () => setSeconds((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);
  return seconds;
}

function Discussion({ currentPlayer }: { currentPlayer: TarotPlayer }) {
  const seconds = useCountdown(10 * 60);
  const minutesLabel = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secondsLabel = String(seconds % 60).padStart(2, "0");
  return (
    <section className="center-stage discussion-stage">
      <p className="eyebrow">Conversation break</p>
      <div className="timer">
        {minutesLabel}:{secondsLabel}
      </div>
      <h2>Compare the situations that shaped your choices.</h2>
      <p className="lead">
        Share only what feels comfortable. The cards provide a common language;
        they do not define anyone.
      </p>
      {currentPlayer.isHost ? (
        <div className="host-actions">
          <button type="button" onClick={() => socket.emit("round.revise")}>
            Explore the same domains again
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => socket.emit("stage2.start")}
          >
            Continue to predictions
          </button>
        </div>
      ) : (
        <p className="waiting">The host chooses when the group continues.</p>
      )}
    </section>
  );
}

function resultFor(
  results: ViewerPredictionResult[],
  targetPlayerId: string,
  cardId: string,
): ViewerPredictionResult | undefined {
  return [...results]
    .reverse()
    .find(
      (result) =>
        result.targetPlayerId === targetPlayerId && result.cardId === cardId,
    );
}

function Predictions({
  room,
  currentPlayer,
}: {
  room: TarotPlayerView;
  currentPlayer: TarotPlayer;
}) {
  const targets = room.players.filter(
    (player) => player.id !== currentPlayer.id && player.connected,
  );
  const cardIds = room.currentRound?.cardIds ?? [];
  const [targetId, setTargetId] = useState("");
  const [cardId, setCardId] = useState(cardIds[0] ?? "");
  const [predictedScore, setPredictedScore] = useState<TarotScore | null>(null);

  useEffect(() => {
    if (targetId && !targets.some((target) => target.id === targetId)) {
      setTargetId("");
    }
  }, [targetId, targets]);
  useEffect(() => {
    if (!cardIds.includes(cardId)) setCardId(cardIds[0] ?? "");
  }, [cardId, cardIds]);

  const selectedTarget = targets.find((target) => target.id === targetId);
  const selectedCard = tarotCard(cardId);
  const result =
    selectedTarget && selectedCard
      ? resultFor(room.predictionResults, selectedTarget.id, selectedCard.id)
      : undefined;
  const canSubmit =
    Boolean(selectedTarget && selectedCard && predictedScore) &&
    result?.status !== "continuation-loading";
  const worldState =
    result?.status === "conversation-ready"
      ? "conversation-ready"
      : result?.status === "matched"
        ? "matched"
        : selectedTarget
          ? "target-selected"
          : "awaiting-target";

  return (
    <section className="prediction-stage">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Private perspective check</p>
          <h2>Whose point of view will you explore?</h2>
        </div>
        <span>Only you see your result</span>
      </div>
      <div className={`pixel-world ${worldState}`}>
        <div className="world-sky" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="world-instruction">
          {selectedTarget
            ? `You walked over to ${selectedTarget.displayName}.`
            : "Choose a character to begin a private perspective check."}
        </p>
        {targets.slice(0, 9).map((player, index) => (
          <button
            type="button"
            className={
              player.id === targetId
                ? `world-character world-slot-${index} selected`
                : `world-character world-slot-${index}`
            }
            onClick={() => {
              setTargetId(player.id);
              setPredictedScore(null);
            }}
            aria-pressed={player.id === targetId}
            key={player.id}
          >
            {player.id === targetId ? (
              <span className="speech-indicator" aria-hidden="true">
                {result ? "…" : "?"}
              </span>
            ) : null}
            <img
              src={assetUrl("characters", characterFile(player.characterId))}
              alt=""
            />
            <span className="name-plaque">{player.displayName}</span>
          </button>
        ))}
        <div className="viewer-character" aria-label={`You are ${currentPlayer.displayName}`}>
          <img
            src={assetUrl(
              "characters",
              characterFile(currentPlayer.characterId),
            )}
            alt=""
          />
          <span>You · {currentPlayer.displayName}</span>
        </div>
      </div>
      <article className="prediction-dialog" aria-live="polite">
        {selectedTarget && selectedCard ? (
          <>
            <div className="dialog-speaker">
              <img
                src={assetUrl(
                  "characters",
                  characterFile(selectedTarget.characterId),
                )}
                alt=""
              />
              <div>
                <p className="eyebrow">Talking with {selectedTarget.displayName}</p>
                <h3>Choose a Tarot lens for this conversation.</h3>
              </div>
            </div>
            <div className="dialog-domain-tabs" aria-label="Tarot domains">
              {cardIds.map((candidateId) => {
                const card = tarotCard(candidateId);
                if (!card) return null;
                return (
                  <button
                    type="button"
                    key={card.id}
                    className={
                      card.id === cardId ? "domain-tab selected" : "domain-tab"
                    }
                    onClick={() => {
                      setCardId(card.id);
                      setPredictedScore(null);
                    }}
                  >
                    <img src={assetUrl("tarot", card.imageFile)} alt="" />
                    <span>{card.name}</span>
                  </button>
                );
              })}
            </div>
            {result ? (
              <PredictionResult result={result} target={selectedTarget} />
            ) : (
              <>
                <div className="domain-message">
                  <p className="eyebrow">{selectedCard.name}</p>
                  <strong>{selectedCard.generalMeaning}</strong>
                  <span>
                    Which approach feels closest to how {selectedTarget.displayName}
                    {" "}might respond?
                  </span>
                </div>
                <div className="score-grid">
                  {scoreChoices.map((score) => (
                    <button
                      type="button"
                      key={score}
                      className={
                        predictedScore === score
                          ? "score-choice selected"
                          : "score-choice"
                      }
                      onClick={() => setPredictedScore(score)}
                    >
                      <strong>{selectedCard.name}</strong>
                      <small>{selectedCard.generalMeaning}</small>
                      <span>{selectedCard.scoreAxis.scores[score]}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => {
                    if (!predictedScore) return;
                    socket.emit("prediction.submit", {
                      targetPlayerId: selectedTarget.id,
                      cardId: selectedCard.id,
                      predictedScore,
                    });
                  }}
                >
                  Explore this perspective
                </button>
              </>
            )}
          </>
        ) : (
          <div className="dialog-empty">
            <span className="dialog-caret">…</span>
            <div>
              <p className="eyebrow">Future communication</p>
              <h3>Click one of the characters in the scene.</h3>
              <p>
                Their nickname and Tarot conversation options will appear here.
              </p>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}

function PredictionResult({
  result,
  target,
}: {
  result: ViewerPredictionResult | undefined;
  target: TarotPlayer;
}) {
  const [selectedDirectionId, setSelectedDirectionId] =
    useState<TarotOptionId | null>(null);

  useEffect(() => {
    setSelectedDirectionId(null);
  }, [result?.predictionId]);

  if (!result) return null;
  if (result.status === "continuation-loading") {
    return (
      <div className="result-card loading-result">
        <span className="pulse" />
        Finding three new ways to keep the conversation going…
      </div>
    );
  }
  if (result.status === "matched") {
    return (
      <div className="result-card matched">
        <p className="eyebrow">A shared read</p>
        <strong>{result.message}</strong>
        <p>
          Ask {target.displayName} what experience made that approach feel natural.
        </p>
        <div className="conversation-link">
          <span aria-hidden="true">You</span>
          <i aria-hidden="true" />
          <span aria-hidden="true">{target.displayName}</span>
        </div>
      </div>
    );
  }
  const selectedDirection = result.continuation.options.find(
    (option) => option.id === selectedDirectionId,
  );
  return (
    <div className="result-card continuation">
      <p className="eyebrow">Keep discovering</p>
      <strong>{result.continuation.opening}</strong>
      <div className="continuation-grid">
        {result.continuation.options.map((option) => (
          <button
            type="button"
            className={
              option.id === selectedDirectionId
                ? "continuation-option selected"
                : "continuation-option"
            }
            onClick={() => setSelectedDirectionId(option.id)}
            key={option.id}
          >
            <span>{option.mode.replace("-", " ")}</span>
            <h4>{option.title}</h4>
            <p>{option.prompt}</p>
          </button>
        ))}
      </div>
      {selectedDirection ? (
        <div className="conversation-launch">
          <span className="speech-tail" aria-hidden="true" />
          <p className="eyebrow">Start this conversation with {target.displayName}</p>
          <strong>{selectedDirection.prompt}</strong>
          <p>
            Take this prompt into the real conversation—there is no answer to
            submit and nothing else is scored.
          </p>
        </div>
      ) : (
        <p className="direction-hint">
          Pick one path to turn it into a shared conversation prompt.
        </p>
      )}
    </div>
  );
}
