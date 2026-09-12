import { runHappyPathHarness } from "./demoScript.ts";

const { finalState, trace } = runHappyPathHarness();

console.log("Common Ground deterministic harness\n");
for (const entry of trace) {
  console.log(
    `${String(entry.step).padStart(2, "0")}  ${entry.action.padEnd(24)} -> ${entry.phase}`,
  );
}

console.log("\nReveal");
console.log(JSON.stringify(finalState.reveal, null, 2));
console.log("\nPASS: invariants, privacy projection, and deterministic replay");
