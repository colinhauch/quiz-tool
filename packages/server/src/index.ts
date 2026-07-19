import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadCoreCitiesPack } from "./pack-loader.js";

const port = Number(process.env.PORT ?? 3001);
const pack = loadCoreCitiesPack();

serve({ fetch: createApp({ pack }).fetch, port }, (info) => {
  console.log(`geo-quiz server listening on http://localhost:${info.port}`);
});
