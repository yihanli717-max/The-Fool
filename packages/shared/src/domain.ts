export const ROOM_PHASES = [
  "lobby",
  "private-choice",
  "group-choice",
  "peer-prediction",
  "reveal",
] as const;

export type RoomPhase = (typeof ROOM_PHASES)[number];

export type Player = {
  id: string;
  displayName: string;
  isHost: boolean;
  connected: boolean;
};

export type ScenarioItem = {
  id: string;
  label: string;
  emoji?: string;
};

export type Priority = {
  id: string;
  label: string;
};

export type Scenario = {
  id: string;
  title: string;
  prompt: string;
  items: ScenarioItem[];
  priorities: Priority[];
  privateSelectionCount: number;
  groupSelectionCount: number;
  discussionSeconds: number;
};

export type ItemChoice = {
  itemId: string;
  priorityId: string;
};

export type PrivateSelection = {
  playerId: string;
  choices: ItemChoice[];
  primaryPriorityId: string;
};

export type GroupSelection = {
  choices: ItemChoice[];
};

export type PeerPrediction = {
  authorPlayerId: string;
  targetPlayerId: string;
  predictedPriorityId: string;
};

export type Misread = {
  authorPlayerId: string;
  targetPlayerId: string;
  predictedPriorityId: string;
  actualPriorityId: string;
};

export type Reveal = {
  commonGroundPriorityIds: string[];
  hiddenAgreementPriorityIds: string[];
  biggestMisread: Misread | null;
};

export type RoomState = {
  id: string;
  code: string;
  phase: RoomPhase;
  scenario: Scenario;
  players: Player[];
  privateSelections: Record<string, PrivateSelection>;
  groupSelection: GroupSelection | null;
  peerPredictions: Record<string, PeerPrediction>;
  reveal: Reveal | null;
  revision: number;
};

export type RoomAction =
  | { type: "player.join"; player: Player }
  | { type: "game.start"; actorPlayerId: string }
  | {
      type: "private-choice.submit";
      actorPlayerId: string;
      choices: ItemChoice[];
      primaryPriorityId: string;
    }
  | {
      type: "group-choice.submit";
      actorPlayerId: string;
      choices: ItemChoice[];
    }
  | {
      type: "peer-prediction.submit";
      actorPlayerId: string;
      targetPlayerId: string;
      predictedPriorityId: string;
    };

export type PublicRoomView = Omit<
  RoomState,
  "privateSelections" | "peerPredictions"
> & {
  privateSubmissionPlayerIds: string[];
  predictionSubmissionPlayerIds: string[];
};
