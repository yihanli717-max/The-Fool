import rawTarotLibrary from "../fixtures/tarot_cards.json" with { type: "json" };

import type {
  TarotCard,
  TarotContinuation,
  TarotEvent,
} from "./domain.ts";
import { parseTarotCardLibrary } from "./schemas.ts";

export const tarotCards = parseTarotCardLibrary(rawTarotLibrary);

export const pixelCharacterIds = [
  "female",
  "male",
  "female1",
  "male1",
  "female2",
  "male2",
  "female3",
  "male3",
  "female4",
  "male4",
] as const;

export const demoPixelCharacterAssets = [
  { id: "female", imageFile: "female.png" },
  { id: "male", imageFile: "male.png" },
  { id: "female1", imageFile: "female1.png" },
  { id: "male1", imageFile: "male1.png" },
  { id: "female2", imageFile: "female2.png" },
  { id: "male2", imageFile: "male2.png" },
  { id: "female3", imageFile: "female3.png" },
  { id: "male3", imageFile: "male3.png" },
  { id: "female4", imageFile: "female4.png" },
  { id: "male4", imageFile: "male4.png" },
] as const;

export function tarotCardById(cardId: string): TarotCard | undefined {
  return tarotCards.find((card) => card.id === cardId);
}

export function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function selectTarotCardIds(
  count: number,
  random: () => number = Math.random,
): string[] {
  if (count < 1 || count > tarotCards.length) {
    throw new Error("Requested Tarot-card count is out of range");
  }
  const shuffled = [...tarotCards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = shuffled[index];
    const swap = shuffled[swapIndex];
    if (!current || !swap) {
      throw new Error("Unable to select Tarot cards");
    }
    shuffled[index] = swap;
    shuffled[swapIndex] = current;
  }
  return shuffled.slice(0, count).map((card) => card.id);
}

export function buildFixtureEvents(
  roundId: string,
  cardIds: string[],
): TarotEvent[] {
  return cardIds.map((cardId, index) => {
    const card = tarotCardById(cardId);
    if (!card) throw new Error(`Unknown Tarot card ${cardId}`);
    return {
      id: `${roundId}_${card.id}_event`,
      roundId,
      cardId: card.id,
      title: `${card.name}: a new situation ${index + 1}`,
      question: `In an everyday choice involving ${card.scoreAxis.label.toLowerCase()}, which approach feels closest?`,
      options: [
        { id: "A", text: card.scoreAxis.scores[3], score: 3 },
        { id: "B", text: card.scoreAxis.scores[1], score: 1 },
        { id: "C", text: card.scoreAxis.scores[2], score: 2 },
      ],
    };
  });
}

export function buildFallbackContinuation(card: TarotCard): TarotContinuation {
  return {
    opening: `There are a few more ways to explore ${card.scoreAxis.label.toLowerCase()} together.`,
    options: [
      {
        id: "A",
        mode: "new-situation",
        title: "A fresh situation",
        prompt:
          "Think of an everyday situation where this theme could appear. What would make that situation feel easier to approach?",
      },
      {
        id: "B",
        mode: "different-angle",
        title: "Another angle",
        prompt:
          "What value or practical constraint might change how someone approaches this kind of decision?",
      },
      {
        id: "C",
        mode: "future-bridge",
        title: "A small next step",
        prompt:
          "What low-pressure experiment could two people try to explore this theme together?",
      },
    ],
  };
}
