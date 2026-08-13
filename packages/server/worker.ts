/**
 * Placeholder Cloudflare Worker entry.
 *
 * This exists ONLY to prove the deploy + custom-domain + TLS pipeline for
 * quiz.colinhauch.com before the real server is ported. It shares nothing with
 * the Node server in `src/` yet: no engine, no packs, no Supabase. The real
 * port (Worker fetch entry + Supabase stores + build-time pack bundling)
 * lands behind this same route — see docs/deploy/hitl-checklist.md §4 and #54.
 */
export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "quiz-tool", stage: "placeholder" });
    }
    return Response.json(
      { service: "quiz-tool", stage: "placeholder", path: url.pathname },
      { status: 200 },
    );
  },
};
