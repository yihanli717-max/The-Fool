import type {
  GenerationSource,
  TarotCard,
  TarotContinuation,
  TarotEvent,
  TarotEventOption,
  TarotScore,
} from "./domain.ts";
import {
  buildFallbackContinuation,
  buildFixtureEvents,
} from "./fixtures.ts";
import { parseContinuation, parseEventBatch } from "./schemas.ts";

export type EventGenerationRequest = {
  roundId: string;
  cards: TarotCard[];
};

export type ContinuationGenerationRequest = {
  card: TarotCard;
  originalEvent: TarotEvent;
  targetActualOption: Pick<TarotEventOption, "id" | "text">;
  targetScore: TarotScore;
  predictedScore: TarotScore;
  usedTopics: string[];
};

export interface EventGenerator {
  generate(request: EventGenerationRequest): Promise<unknown>;
}

export interface ContinuationGenerator {
  generate(request: ContinuationGenerationRequest): Promise<unknown>;
}

export type FakeBehavior = "valid" | "invalid" | "throw";

export class DeterministicEventGenerator implements EventGenerator {
  readonly requests: EventGenerationRequest[] = [];

  constructor(private readonly behavior: FakeBehavior = "valid") {}

  async generate(request: EventGenerationRequest): Promise<unknown> {
    this.requests.push(request);
    if (this.behavior === "throw") {
      throw new Error("Injected event-generator failure");
    }
    if (this.behavior === "invalid") {
      return { events: [{ id: "invalid" }] };
    }
    return {
      events: buildFixtureEvents(
        request.roundId,
        request.cards.map((card) => card.id),
      ),
    };
  }
}

export class DeterministicContinuationGenerator
  implements ContinuationGenerator
{
  readonly requests: ContinuationGenerationRequest[] = [];

  constructor(private readonly behavior: FakeBehavior = "valid") {}

  async generate(request: ContinuationGenerationRequest): Promise<unknown> {
    this.requests.push(request);
    if (this.behavior === "throw") {
      throw new Error("Injected continuation-generator failure");
    }
    if (this.behavior === "invalid") {
      return { opening: "Incomplete response", options: [] };
    }
    return {
      opening: "There are more ways to explore this theme together.",
      options: [
        {
          id: "A",
          mode: "new-situation",
          title: "A new setting",
          prompt:
            "Where might this theme show up in school, a hobby, or an everyday plan?",
        },
        {
          id: "B",
          mode: "different-angle",
          title: "A different tradeoff",
          prompt:
            "What practical detail or value could lead two people to approach this theme differently?",
        },
        {
          id: "C",
          mode: "future-bridge",
          title: "Try it together",
          prompt:
            "What small, low-pressure activity could help two people explore this theme together?",
        },
      ],
    };
  }
}

export async function generateEventsWithFallback(
  generator: EventGenerator,
  request: EventGenerationRequest,
): Promise<{ events: TarotEvent[]; source: GenerationSource }> {
  try {
    const output = await generator.generate(request);
    return {
      events: parseEventBatch(
        output,
        request.roundId,
        request.cards.map((card) => card.id),
      ),
      source: "generated",
    };
  } catch {
    const events = buildFixtureEvents(
      request.roundId,
      request.cards.map((card) => card.id),
    );
    return {
      events: parseEventBatch(
        { events },
        request.roundId,
        request.cards.map((card) => card.id),
      ),
      source: "fallback",
    };
  }
}

const bannedContinuationPatterns = [
  /\bwrong\b/i,
  /\bmismatch(?:ed)?\b/i,
  /\bscore(?:d|s)?\b/i,
  /\bprediction\b/i,
  /hidden answer/i,
  /(?:do not|don't|does not|doesn't) know (?:them|you)/i,
];

export function assertContinuationCopySafe(
  continuation: TarotContinuation,
  targetActualOptionText: string,
): void {
  const displayCopy = [
    continuation.opening,
    ...continuation.options.flatMap((option) => [
      option.title,
      option.prompt,
    ]),
  ].join(" ");
  if (bannedContinuationPatterns.some((pattern) => pattern.test(displayCopy))) {
    throw new Error("Continuation copy exposes private evaluation language");
  }
  const normalizedActual = targetActualOptionText.trim().toLocaleLowerCase();
  if (
    normalizedActual.length > 0 &&
    displayCopy.toLocaleLowerCase().includes(normalizedActual)
  ) {
    throw new Error("Continuation copy reveals the target's actual option");
  }
}

export async function generateContinuationWithFallback(
  generator: ContinuationGenerator,
  request: ContinuationGenerationRequest,
): Promise<{ continuation: TarotContinuation; source: GenerationSource }> {
  try {
    const continuation = parseContinuation(await generator.generate(request));
    assertContinuationCopySafe(continuation, request.targetActualOption.text);
    return { continuation, source: "generated" };
  } catch {
    const continuation = parseContinuation(
      buildFallbackContinuation(request.card),
    );
    assertContinuationCopySafe(continuation, request.targetActualOption.text);
    return { continuation, source: "fallback" };
  }
}
