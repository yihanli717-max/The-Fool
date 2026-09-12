import type { Scenario } from "../domain.ts";

export const strandedIsland: Scenario = {
  id: "stranded-island",
  title: "Stranded Island",
  prompt: "Your group is stranded on an island. Choose only three items.",
  items: [
    { id: "knife", label: "Knife", emoji: "🔪" },
    { id: "lighter", label: "Lighter", emoji: "🔥" },
    { id: "radio", label: "Radio", emoji: "📻" },
    { id: "water", label: "Water", emoji: "💧" },
    { id: "map", label: "Map", emoji: "🗺️" },
    { id: "medicine", label: "Medicine", emoji: "💊" },
    { id: "rope", label: "Rope", emoji: "🪢" },
    { id: "food", label: "Food", emoji: "🍫" },
  ],
  priorities: [
    { id: "survival", label: "Immediate survival" },
    { id: "rescue", label: "Getting rescued" },
    { id: "long-term", label: "Long-term planning" },
    { id: "comfort", label: "Comfort" },
    { id: "helping", label: "Helping others" },
  ],
  privateSelectionCount: 3,
  groupSelectionCount: 3,
  discussionSeconds: 90,
};
