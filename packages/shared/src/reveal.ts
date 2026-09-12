import type {
  ActivityConfig,
  GroupReveal,
  GroupTheme,
  PreferenceCard,
  RoomState,
} from "./domain.ts";
import {
  connectionThemes,
  followUpById,
  interestById,
  themeById,
} from "./fixtures/connection.ts";

function countThemeVotes(cards: PreferenceCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const participantThemeIds = new Set(
      card.interestIds.flatMap(
        (interestId) => interestById(interestId)?.themeIds ?? [],
      ),
    );
    for (const themeId of participantThemeIds) {
      counts.set(themeId, (counts.get(themeId) ?? 0) + 1);
    }
  }
  return counts;
}

function highestThemeId(counts: Map<string, number>, fallbackId: string): string {
  let winnerId = fallbackId;
  let winnerCount = -1;
  for (const theme of connectionThemes) {
    const count = counts.get(theme.id) ?? 0;
    if (count > winnerCount) {
      winnerId = theme.id;
      winnerCount = count;
    }
  }
  return winnerId;
}

export function selectInitialTheme(
  activity: ActivityConfig,
  cards: PreferenceCard[],
): GroupTheme {
  const fallback = connectionThemes[0];
  if (!fallback) {
    throw new Error("At least one connection theme is required");
  }
  const selected = themeById(highestThemeId(countThemeVotes(cards), fallback.id)) ?? fallback;
  return {
    id: selected.id,
    label: selected.label,
    description: selected.description,
    starter: selected.starters[activity.groupingMode],
  };
}

export function calculateGroupReveal(state: RoomState): GroupReveal {
  if (!state.initialTheme) {
    throw new Error("Cannot calculate a reveal before the conversation begins");
  }

  const actualThemeId = highestThemeId(
    new Map(
      connectionThemes.map((theme) => [
        theme.id,
        Object.values(state.reflectionVotes).filter((vote) => vote === theme.id).length,
      ]),
    ),
    state.initialTheme.id,
  );
  const actualTheme = themeById(actualThemeId) ?? themeById(state.initialTheme.id);
  if (!actualTheme) {
    throw new Error("Unable to resolve actual connection theme");
  }

  const followUpCounts = new Map<string, number>();
  for (const optionId of Object.values(state.followUpSelections)) {
    followUpCounts.set(optionId, (followUpCounts.get(optionId) ?? 0) + 1);
  }
  const mutualFollowUps = [...followUpCounts.entries()]
    .map(([optionId, participantCount]) => ({
      option: followUpById(optionId),
      participantCount,
    }))
    .filter(
      (entry): entry is { option: NonNullable<typeof entry.option>; participantCount: number } =>
        Boolean(entry.option) && !entry.option?.isOptOut && entry.participantCount >= 2,
    )
    .map(({ option, participantCount }) => ({
      id: option.id,
      label: option.label,
      participantCount,
    }));

  return {
    initialTheme: state.initialTheme,
    actualTheme: {
      id: actualTheme.id,
      label: actualTheme.label,
      description: actualTheme.description,
    },
    mutualFollowUps,
  };
}
