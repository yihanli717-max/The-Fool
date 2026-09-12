export const TAROT_ROOM_PHASES = [
  "lobby",
  "generating",
  "answering",
  "event-reveal",
  "discussion",
  "predictions",
] as const;

export type TarotRoomPhase = (typeof TAROT_ROOM_PHASES)[number];
export type TarotScore = 1 | 2 | 3;
export type TarotOptionId = "A" | "B" | "C";
export type GenerationSource = "generated" | "fallback";

export type TarotScoreAxis = {
  label: string;
  scores: Record<TarotScore, string>;
};

export type TarotCard = {
  id: string;
  name: string;
  imageFile: string;
  generalMeaning: string;
  archetype: string;
  coreQuestion: string;
  themes: string[];
  scoreAxis: TarotScoreAxis;
};

export type TarotPlayer = {
  id: string;
  displayName: string;
  isHost: boolean;
  connected: boolean;
  characterId: string;
};

export type TarotEventOption = {
  id: TarotOptionId;
  text: string;
  score: TarotScore;
};

export type TarotEvent = {
  id: string;
  roundId: string;
  cardId: string;
  title: string;
  question: string;
  options: TarotEventOption[];
};

export type TarotRound = {
  id: string;
  index: number;
  cardIds: string[];
  events: TarotEvent[];
  eventSource: GenerationSource | null;
  currentEventIndex: number;
  activePlayerIds: string[];
};

export type TarotResponse = {
  playerId: string;
  eventId: string;
  roundId: string;
  roundIndex: number;
  eventIndex: number;
  cardId: string;
  optionId: TarotOptionId;
  score: TarotScore;
};

export type ContinuationMode =
  | "new-situation"
  | "different-angle"
  | "future-bridge";

export type ContinuationDirection = {
  id: TarotOptionId;
  mode: ContinuationMode;
  title: string;
  prompt: string;
};

export type TarotContinuation = {
  opening: string;
  options: ContinuationDirection[];
};

export type TarotPrediction = {
  id: string;
  predictorId: string;
  targetPlayerId: string;
  cardId: string;
  predictedScore: TarotScore;
  actualScore: TarotScore;
  matches: boolean;
  continuation: TarotContinuation | null;
  continuationSource: GenerationSource | null;
};

export type TarotRoomState = {
  id: string;
  code: string;
  phase: TarotRoomPhase;
  players: TarotPlayer[];
  rounds: TarotRound[];
  currentRoundId: string | null;
  responses: Record<string, Record<string, TarotResponse>>;
  latestResponses: Record<string, Record<string, TarotResponse>>;
  predictions: Record<string, TarotPrediction>;
  revision: number;
};

export type TarotRoomAction =
  | { type: "player.join"; player: TarotPlayer }
  | {
      type: "player.connection.set";
      actorPlayerId: string;
      connected: boolean;
    }
  | {
      type: "stage1.start";
      actorPlayerId: string;
      roundId: string;
      cardIds: string[];
    }
  | {
      type: "round.events.generated";
      roundId: string;
      events: TarotEvent[];
      source: GenerationSource;
    }
  | {
      type: "event.answer";
      actorPlayerId: string;
      eventId: string;
      optionId: TarotOptionId;
    }
  | { type: "event.advance"; actorPlayerId: string }
  | {
      type: "round.continue-without-player";
      actorPlayerId: string;
      playerId: string;
    }
  | {
      type: "round.revise";
      actorPlayerId: string;
      roundId: string;
      cardIds: string[];
    }
  | { type: "stage2.start"; actorPlayerId: string }
  | {
      type: "prediction.submit";
      predictionId: string;
      actorPlayerId: string;
      targetPlayerId: string;
      cardId: string;
      predictedScore: TarotScore;
    }
  | {
      type: "continuation.generated";
      actorPlayerId: string;
      predictionId: string;
      continuation: TarotContinuation;
      source: GenerationSource;
    };

export type VisibleTarotEvent = Omit<TarotEvent, "options"> & {
  options: Array<Omit<TarotEventOption, "score">>;
};

export type EventChoiceReveal = {
  playerId: string;
  displayName: string;
  optionId: TarotOptionId;
  optionText: string;
};

export type CompletedEventReveal = {
  eventId: string;
  cardId: string;
  title: string;
  choices: EventChoiceReveal[];
};

export type ViewerPredictionResult =
  | {
      predictionId: string;
      targetPlayerId: string;
      cardId: string;
      status: "matched";
      message: string;
    }
  | {
      predictionId: string;
      targetPlayerId: string;
      cardId: string;
      status: "continuation-loading";
    }
  | {
      predictionId: string;
      targetPlayerId: string;
      cardId: string;
      status: "conversation-ready";
      continuation: TarotContinuation;
    };

export type TarotPlayerView = {
  id: string;
  code: string;
  phase: TarotRoomPhase;
  players: TarotPlayer[];
  revision: number;
  currentRound: {
    id: string;
    index: number;
    cardIds: string[];
    currentEventIndex: number;
    activePlayerCount: number;
    event: VisibleTarotEvent | null;
    viewerOptionId: TarotOptionId | null;
    submittedCount: number;
    completedReveals: CompletedEventReveal[];
  } | null;
  predictionResults: ViewerPredictionResult[];
};
