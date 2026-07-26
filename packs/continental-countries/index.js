/**
 * Question generator for country→continent `located_in` statements.
 * Object-hidden: "What continent is X in?"
 */
const locatedIn = ({ statement, graph }) => {
    const country = graph.getEntity(statement.subject);
    return { prompt: `What continent is ${country.labels.en} in?`, input: "text" };
};
export const generators = {
    located_in: locatedIn,
};
/**
 * The directory this pack's data files live in, so a loader can read
 * `statements.jsonl` off local disk. Resolves against the source location
 * under tsx/vitest, which is how the MVP runs.
 */
export const packDir = new URL(".", import.meta.url);
//# sourceMappingURL=index.js.map