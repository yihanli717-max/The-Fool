import { runTarotHappyPathHarness } from "./demoScript.ts";

const { finalState, trace, views } = await runTarotHappyPathHarness();

console.log("Shared Mind deterministic harness\n");
for (const entry of trace) {
  console.log(
    `${String(entry.step).padStart(2, "0")}  ${entry.action.padEnd(31)} -> ${entry.phase}`,
  );
}

console.log("\nSummary");
console.log(
  JSON.stringify(
    {
      players: finalState.players.map((player) => ({
        displayName: player.displayName,
        characterId: player.characterId,
      })),
      rounds: finalState.rounds.length,
      finalPhase: finalState.phase,
      ariResult: views.ari?.predictionResults[0]?.status,
      meiResult: views.mei?.predictionResults[0]?.status,
    },
    null,
    2,
  ),
);
console.log(
  "\nPASS: Tarot rounds, latest ground truth, private predictions, continuation routing, and deterministic replay",
);
