import { readFileSync } from "node:fs";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import {
  type ContinuationGenerationRequest,
  type ContinuationGenerator,
  type EventGenerationRequest,
  type EventGenerator,
} from "@common-ground/shared";

const modelEventBatchSchema = z
  .object({
    events: z
      .array(
        z
          .object({
            id: z.string(),
            roundId: z.string(),
            cardId: z.string(),
            title: z.string(),
            question: z.string(),
            options: z
              .array(
                z
                  .object({
                    id: z.enum(["A", "B", "C"]),
                    text: z.string(),
                    score: z.union([z.literal(1), z.literal(2), z.literal(3)]),
                  })
                  .strict(),
              )
              .length(3),
          })
          .strict(),
      )
      .length(4),
  })
  .strict();

const modelContinuationSchema = z
  .object({
    opening: z.string(),
    options: z
      .array(
        z
          .object({
            id: z.enum(["A", "B", "C"]),
            mode: z.enum([
              "new-situation",
              "different-angle",
              "future-bridge",
            ]),
            title: z.string(),
            prompt: z.string(),
          })
          .strict(),
      )
      .length(3),
  })
  .strict();

const eventSystemPrompt = readFileSync(
  new URL("../../../tarot_event_prompt_pack/system_prompt.txt", import.meta.url),
  "utf8",
);
const eventUserTemplate = readFileSync(
  new URL("../../../tarot_event_prompt_pack/user_prompt_template.txt", import.meta.url),
  "utf8",
);
const continuationSystemPrompt = readFileSync(
  new URL("../../../tarot_continuation_prompt_pack/system_prompt.txt", import.meta.url),
  "utf8",
);
const continuationUserTemplate = readFileSync(
  new URL("../../../tarot_continuation_prompt_pack/user_prompt_template.txt", import.meta.url),
  "utf8",
);

function renderTemplate(
  template: string,
  replacements: Record<string, string | number>,
): string {
  return Object.entries(replacements).reduce(
    (rendered, [key, value]) =>
      rendered.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

function logGenerationError(task: "event" | "continuation", error: unknown): void {
  const detail =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : "Unknown OpenAI SDK error";
  console.error(`[openai] ${task} generation failed: ${detail.slice(0, 800)}`);
}

export class OpenAIEventGenerator implements EventGenerator {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
  ) {}

  async generate(request: EventGenerationRequest): Promise<unknown> {
    const input = renderTemplate(eventUserTemplate, {
      ROUND_ID: request.roundId,
      CARDS_JSON: JSON.stringify(
        request.cards.map((card) => ({
          id: card.id,
          name: card.name,
          general_meaning: card.generalMeaning,
          archetype: card.archetype,
          core_question: card.coreQuestion,
          themes: card.themes,
          score_axis: {
            label: card.scoreAxis.label,
            score_1: card.scoreAxis.scores[1],
            score_2: card.scoreAxis.scores[2],
            score_3: card.scoreAxis.scores[3],
          },
        })),
        null,
        2,
      ),
    });
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        instructions: eventSystemPrompt,
        input,
        max_output_tokens: 2400,
        store: false,
        text: {
          format: zodTextFormat(modelEventBatchSchema, "shared_mind_round_events"),
        },
      });
      if (!response.output_parsed) {
        throw new Error("The event generator returned no parsed output");
      }
      return response.output_parsed;
    } catch (error) {
      logGenerationError("event", error);
      throw error;
    }
  }
}

export class OpenAIContinuationGenerator implements ContinuationGenerator {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
  ) {}

  async generate(request: ContinuationGenerationRequest): Promise<unknown> {
    const input = renderTemplate(continuationUserTemplate, {
      TAROT_CARD_NAME: request.card.name,
      TAROT_ARCHETYPE: request.card.archetype,
      TAROT_GENERAL_MEANING: request.card.generalMeaning,
      TAROT_CORE_QUESTION: request.card.coreQuestion,
      TAROT_THEMES_JSON: JSON.stringify(request.card.themes),
      SCORE_AXIS_JSON: JSON.stringify({
        label: request.card.scoreAxis.label,
        scores: request.card.scoreAxis.scores,
      }),
      ORIGINAL_EVENT_TITLE: request.originalEvent.title,
      ORIGINAL_EVENT_QUESTION: request.originalEvent.question,
      ORIGINAL_OPTIONS_JSON: JSON.stringify(
        request.originalEvent.options.map(({ id, text }) => ({ id, text })),
      ),
      TARGET_ACTUAL_OPTION: `${request.targetActualOption.id}: ${request.targetActualOption.text}`,
      TARGET_SCORE: request.targetScore,
      PREDICTED_SCORE: request.predictedScore,
      USED_TOPICS_JSON: JSON.stringify(request.usedTopics),
    });
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        instructions: continuationSystemPrompt,
        input,
        max_output_tokens: 1200,
        store: false,
        text: {
          format: zodTextFormat(
            modelContinuationSchema,
            "shared_mind_conversation_directions",
          ),
        },
      });
      if (!response.output_parsed) {
        throw new Error("The continuation generator returned no parsed output");
      }
      return response.output_parsed;
    } catch (error) {
      logGenerationError("continuation", error);
      throw error;
    }
  }
}

class UnavailableEventGenerator implements EventGenerator {
  async generate(): Promise<never> {
    throw new Error("OPENAI_API_KEY is not configured");
  }
}

class UnavailableContinuationGenerator implements ContinuationGenerator {
  async generate(): Promise<never> {
    throw new Error("OPENAI_API_KEY is not configured");
  }
}

export function createRuntimeGenerators(): {
  eventGenerator: EventGenerator;
  continuationGenerator: ContinuationGenerator;
  mode: "openai" | "fallback";
  model: string;
} {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";
  if (!apiKey) {
    return {
      eventGenerator: new UnavailableEventGenerator(),
      continuationGenerator: new UnavailableContinuationGenerator(),
      mode: "fallback",
      model,
    };
  }
  const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 15_000 });
  return {
    eventGenerator: new OpenAIEventGenerator(client, model),
    continuationGenerator: new OpenAIContinuationGenerator(client, model),
    mode: "openai",
    model,
  };
}
