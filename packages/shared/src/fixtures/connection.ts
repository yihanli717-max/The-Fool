import type {
  ConnectionThemeDefinition,
  FollowUpOption,
  Interest,
} from "../domain.ts";

export const connectionThemes: ConnectionThemeDefinition[] = [
  {
    id: "creative-play",
    label: "Creative play",
    description: "making, imagining, and exploring worlds together",
    starters: {
      comfort: "What is something creative you could happily spend an entire afternoon making or exploring?",
      discovery: "If your group combined its different creative interests into one tiny project, what would you make?",
      balanced: "What is one creative thing you enjoy, and one you are curious to try?",
    },
  },
  {
    id: "stories-culture",
    label: "Stories and culture",
    description: "the media, traditions, and places that shape how we see the world",
    starters: {
      comfort: "What is a story, tradition, or piece of media you would love to introduce to a friend?",
      discovery: "What is something from your background or media world that people often misunderstand at first?",
      balanced: "What is one story or tradition that has stayed with you, and why?",
    },
  },
  {
    id: "food-place",
    label: "Food and place",
    description: "the tastes, neighborhoods, and rituals that make a place feel familiar",
    starters: {
      comfort: "What food or place instantly makes you feel at home?",
      discovery: "What is a food ritual or local spot you would want a newcomer to experience?",
      balanced: "What is one meal or place you would happily use to get to know someone better?",
    },
  },
  {
    id: "ideas-impact",
    label: "Ideas and impact",
    description: "learning, building, and making a positive difference",
    starters: {
      comfort: "What is a problem or idea you could talk about for longer than you intended?",
      discovery: "What is a small change you wish more people would try in a community you care about?",
      balanced: "What is one thing you are learning, building, or hoping to improve right now?",
    },
  },
];

export const interests: Interest[] = [
  { id: "games", label: "Games", emoji: "🎮", themeIds: ["creative-play"] },
  { id: "anime", label: "Anime & manga", emoji: "✨", themeIds: ["creative-play", "stories-culture"] },
  { id: "art", label: "Art & design", emoji: "🎨", themeIds: ["creative-play"] },
  { id: "music", label: "Music", emoji: "🎧", themeIds: ["creative-play", "stories-culture"] },
  { id: "film", label: "Film & stories", emoji: "🎬", themeIds: ["stories-culture"] },
  { id: "languages", label: "Languages", emoji: "🗣️", themeIds: ["stories-culture"] },
  { id: "food", label: "Food", emoji: "🍜", themeIds: ["food-place"] },
  { id: "travel", label: "Travel & cities", emoji: "🗺️", themeIds: ["food-place", "stories-culture"] },
  { id: "tech", label: "Tech & building", emoji: "💻", themeIds: ["ideas-impact"] },
  { id: "learning", label: "Learning", emoji: "📚", themeIds: ["ideas-impact"] },
  { id: "community", label: "Community", emoji: "🤝", themeIds: ["ideas-impact", "food-place"] },
  { id: "nature", label: "Outdoors", emoji: "🌿", themeIds: ["food-place", "ideas-impact"] },
];

export const followUpOptions: FollowUpOption[] = [
  {
    id: "coffee",
    label: "Coffee next week",
    description: "Keep the conversation going over a short coffee break.",
  },
  {
    id: "game-night",
    label: "Indie game night",
    description: "Try a low-pressure game night together.",
  },
  {
    id: "coworking",
    label: "Study or co-work",
    description: "Meet again for a focused, casual session.",
  },
  {
    id: "group-chat",
    label: "Start a group chat",
    description: "Leave the door open without scheduling anything yet.",
  },
  {
    id: "not-today",
    label: "Not today",
    description: "No follow-up is required.",
    isOptOut: true,
  },
];

export function themeById(themeId: string): ConnectionThemeDefinition | undefined {
  return connectionThemes.find((theme) => theme.id === themeId);
}

export function interestById(interestId: string): Interest | undefined {
  return interests.find((interest) => interest.id === interestId);
}

export function followUpById(optionId: string): FollowUpOption | undefined {
  return followUpOptions.find((option) => option.id === optionId);
}
