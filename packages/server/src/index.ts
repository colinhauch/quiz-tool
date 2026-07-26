import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadAllPacks } from "./pack-loader.js";
import { createAnswerStore, openDatabase } from "./storage.js";

const port = Number(process.env.PORT ?? 3001);
const dbFile = process.env.GEO_DB ?? "geo-quiz.sqlite";

const pack = loadAllPacks();
const store = createAnswerStore(openDatabase(dbFile));

serve({ fetch: createApp({ pack, store }).fetch, port }, (info) => {
  console.log(`geo-quiz server listening on http://localhost:${info.port}`);
});
