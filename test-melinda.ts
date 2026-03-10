import { retrieveContext } from "./lib/rag";

const queries = [
    "do you know melinda?",
    "do you know Dr. Melinda?",
    "melinda"
];

console.log("=== MELINDA DEBUG ===");
queries.forEach(q => {
    console.log(`\nQuery: "${q}"`);
    const res = retrieveContext(q);
    if (res.context === "NO_CONTEXT_FOUND") {
        console.log("Result: NOT FOUND");
    } else {
        console.log("Result: FOUND");
        console.log("Detected Topic:", res.detectedTopic);
        // console.log("Context:", res.context);
    }
});
