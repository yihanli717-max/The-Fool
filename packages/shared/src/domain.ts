export const ROOM_PHASES = [
  "lobby",
  "preferences",
  "conversation",
  "reflection",
  "follow-up",
  "reveal",
] as const;

export type RoomPhase = (typeof ROOM_PHASES)[number];

export const EVENT_GOALS = ["comfort", "discovery", "continuation"] as const;
export type EventGoal = (typeof EVENT_GOALS)[number];

export const GROUPING_MODES = ["comfort", "discovery", "balanced"] as const;
export type GroupingMode = (typeof GROUPING_MODES)[number];

export const INTERACTION_STYLES = ["small-group", "structured"] as const;
export type InteractionStyle = (typeof INTERACTION_STYLES)[number];

export const CONNECTION_STYLES = ["breadth", "depth"] as const;
export type ConnectionStyle = (typeof CONNECTION_STYLES)[number];

export const EVENT_INTENTS = [
  "casual",
  "new-perspectives",
  "keep-in-touch",
] as const;
export type EventIntent = (typeof EVENT_INTENTS)[number];

export type Player = {
  id: string;
  displayName: string;
  isHost: boolean;
  connected: boolean;
};

export type ActivityConfig = {
  title: string;
  eventGoal: EventGoal;
  groupingMode: GroupingMode;
};

export type Interest = {
  id: string;
  label: string;
  emoji: string;
  themeIds: string[];
};

export type ConnectionThemeDefinition = {
  id: string;
  label: string;
  description: string;
  starters: Record<GroupingMode, string>;
};

export type GroupTheme = {
  id: string;
  label: string;
  description: string;
  starter: string;
};

export type PreferenceCard = {
  interestIds: string[];
  interactionStyle?: InteractionStyle;
  connectionStyle?: ConnectionStyle;
  eventIntent?: EventIntent;
};

export type FollowUpOption = {
  id: string;
  label: string;
  description: string;
  isOptOut?: boolean;
};

export type FollowUpMatch = {
  id: string;
  label: string;
  participantCount: number;
};

export type GroupReveal = {
  initialTheme: GroupTheme;
  actualTheme: Pick<GroupTheme, "id" | "label" | "description">;
  mutualFollowUps: FollowUpMatch[];
};

export type RoomState = {
  id: string;
  code: string;
  phase: RoomPhase;
  activity: ActivityConfig;
  players: Player[];
  preferenceCards: Record<string, PreferenceCard>;
  initialTheme: GroupTheme | null;
  reflectionVotes: Record<string, string>;
  followUpSelections: Record<string, string>;
  reveal: GroupReveal | null;
  revision: number;
};

export type RoomAction =
  | { type: "player.join"; player: Player }
  | {
      type: "player.connection.set";
      actorPlayerId: string;
      connected: boolean;
    }
  | { type: "activity.start"; actorPlayerId: string }
  | { type: "conversation.begin"; actorPlayerId: string }
  | { type: "reflection.open"; actorPlayerId: string }
  | {
      type: "preferences.submit";
      actorPlayerId: string;
      card: PreferenceCard;
    }
  | {
      type: "reflection.submit";
      actorPlayerId: string;
      themeId: string;
    }
  | {
      type: "follow-up.submit";
      actorPlayerId: string;
      followUpOptionId: string;
    }
  | { type: "activity.restart"; actorPlayerId: string };

export type PublicRoomView = Omit<
  RoomState,
  "preferenceCards" | "reflectionVotes" | "followUpSelections"
> & {
  preferenceSubmissionPlayerIds: string[];
  reflectionSubmissionPlayerIds: string[];
  followUpSubmissionPlayerIds: string[];
};
