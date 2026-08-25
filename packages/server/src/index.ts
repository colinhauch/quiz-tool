import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadCatalog } from "./catalog.js";
import { loadAllPacks } from "./pack-loader.js";
import { createAnswerStore, createRatingStore, createSelectionStore, openDatabase } from "./storage.js";

const port = Number(process.env.PORT ?? 3001);
const dbFile = process.env.GEO_DB ?? "geo-quiz.sqlite";

// Await: packs are discovered at boot and their generator modules imported
// dynamically, so loading is async (see pack-loader.ts).
const pack = await loadAllPacks();
const catalog = loadCatalog();
const db = openDatabase(dbFile);
const store = createAnswerStore(db);
const selection = createSelectionStore(db);
const rating = createRatingStore(db);

serve({ fetch: createApp({ pack, store, selection, rating, catalog }).fetch, port }, (info) => {
  console.log(`geo-quiz server listening on http://localhost:${info.port}`);
});
