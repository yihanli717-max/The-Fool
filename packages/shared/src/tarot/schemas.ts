import { z } from "zod";

import type {
  TarotCard,
  TarotContinuation,
  TarotEvent,
  TarotScore,
} from "./domain.ts";

const scoreSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const optionSchema = (id: "A" | "B" | "C") =>
  z
    .object({
      id: z.literal(id),
      text: z.string().trim().min(1).max(500),
      score: scoreSchema,
    })
    .strict();

export const tarotEventSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    roundId: z.string().trim().min(1).max(120),
    cardId: z.string().regex(/^[a-z0-9_]+$/),
    title: z.string().trim().min(1).max(120),
    question: z.string().trim().min(1).max(800),
    options: z.tuple([optionSchema("A"), optionSchema("B"), optionSchema("C")]),
  })
  .strict()
  .superRefine((event, context) => {
    const scores = event.options.map((option) => option.score);
    if (new Set(scores).size !== 3) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Event options must cover scores 1, 2, and 3 exactly once",
      });
    }
  });

export const tarotEventBatchSchema = z
  .object({ events: z.array(tarotEventSchema).length(4) })
  .strict()
  .superRefine(({ events }, context) => {
    if (new Set(events.map((event) => event.id)).size !== events.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["events"],
        message: "Event IDs must be unique",
      });
    }
    if (new Set(events.map((event) => event.cardId)).size !== events.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["events"],
        message: "A generated batch must contain one event per Tarot card",
      });
    }
  });

const continuationDirectionSchema = (
  id: "A" | "B" | "C",
  mode: "new-situation" | "different-angle" | "future-bridge",
) =>
  z
    .object({
      id: z.literal(id),
      mode: z.literal(mode),
      title: z.string().trim().min(1).max(80),
      prompt: z.string().trim().min(1).max(500),
    })
    .strict();

export const tarotContinuationSchema = z
  .object({
    opening: z.string().trim().min(1).max(240),
    options: z.tuple([
      continuationDirectionSchema("A", "new-situation"),
      continuationDirectionSchema("B", "different-angle"),
      continuationDirectionSchema("C", "future-bridge"),
    ]),
  })
  .strict();

const rawScoreAxisSchema = z
  .object({
    label: z.string().trim().min(1),
    score_1: z.string().trim().min(1),
    score_2: z.string().trim().min(1),
    score_3: z.string().trim().min(1),
  })
  .strict();

const rawTarotCardSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().trim().min(1),
    image_file: z.string().trim().min(1),
    general_meaning: z.string().trim().min(1),
    archetype: z.string().trim().min(1),
    core_question: z.string().trim().min(1),
    score_axis: rawScoreAxisSchema,
    themes: z.array(z.string().trim().min(1)).min(3).max(5),
  })
  .strict();

const rawTarotLibrarySchema = z
  .object({
    project: z.string(),
    version: z.string(),
    note: z.string(),
    cards: z.array(rawTarotCardSchema).length(8),
  })
  .strict();

export function parseTarotCardLibrary(input: unknown): TarotCard[] {
  const parsed = rawTarotLibrarySchema.parse(input);
  if (new Set(parsed.cards.map((card) => card.id)).size !== parsed.cards.length) {
    throw new Error("Tarot card IDs must be unique");
  }
  if (
    new Set(parsed.cards.map((card) => card.image_file)).size !==
    parsed.cards.length
  ) {
    throw new Error("Tarot image filenames must be unique");
  }

  return parsed.cards.map((card) => ({
    id: card.id,
    name: card.name,
    imageFile: card.image_file,
    generalMeaning: card.general_meaning,
    archetype: card.archetype,
    coreQuestion: card.core_question,
    themes: card.themes,
    scoreAxis: {
      label: card.score_axis.label,
      scores: {
        1: card.score_axis.score_1,
        2: card.score_axis.score_2,
        3: card.score_axis.score_3,
      },
    },
  }));
}

export function parseEventBatch(
  input: unknown,
  roundId: string,
  cardIds: string[],
): TarotEvent[] {
  const { events } = tarotEventBatchSchema.parse(input);
  if (events.some((event) => event.roundId !== roundId)) {
    throw new Error("Generated events must belong to the requested round");
  }
  const expected = [...cardIds].sort();
  const actual = events.map((event) => event.cardId).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Generated events must match the requested Tarot cards");
  }
  return events;
}

export function parseContinuation(input: unknown): TarotContinuation {
  return tarotContinuationSchema.parse(input);
}

export function isTarotScore(value: number): value is TarotScore {
  return value === 1 || value === 2 || value === 3;
}
