import type {
  AnswerLog as AnswerLogData,
  AnswerResponse,
  EntityList,
  FeedbackRequest,
  PackList,
  QuestionResponse,
} from "@geo/contract";
import { getAuthBoundary } from "./auth.js";

/**
 * Where {@link apiFetch} reads the current access token. Defaults to the app
 * auth boundary; the setter exists so unit tests can drive the signed-in and
 * signed-out paths without standing up a real Supabase session (see
 * apiClient.test.ts). Returns `null` when no learner is signed in.
 */
let accessTokenSource: () => string | null = () => getAuthBoundary().getState().accessToken;

/** Overrides the access-token source. Production uses the auth boundary; tests inject a fake. */
export function setAccessTokenSource(source: () => string | null): void {
  accessTokenSource = source;
}

/**
 * Called when an authenticated request comes back 401 — a session the client
 * believed was live has been rejected. Defaults to telling the auth boundary
 * the session expired, which flips the app to its sign-in gate. The setter lets
 * tests observe the funnel without a real boundary (see apiClient.test.ts).
 */
let onUnauthorized: () => void = () => getAuthBoundary().handleExpiry();

/** Overrides the 401 handler. Production routes through the auth boundary; tests inject a spy. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

/**
 * The single choke point every frontend→server call passes through. All
 * request options (headers, method, body) are assembled here, and nowhere
 * else. When a learner is signed in it attaches `Authorization: Bearer
 * <token>` (the seam #67 turns on) so the Worker's auth middleware can verify
 * the request; signed out, the request goes exactly as before and the server
 * answers 401. No component should call `fetch()` directly; go through the
 * functions below instead.
 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = accessTokenSource();
  const res = token
    ? await fetch(path, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` } })
    : await fetch(path, init);
  // A 401 on a request we authenticated means the session died under us; funnel
  // it to the boundary. A 401 while signed out is just the ordinary gate case.
  if (token && res.status === 401) onUnauthorized();
  return res;
}

function jsonInit(method: "POST" | "PUT", body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

/** Fetches the next question to ask. */
export async function getQuestion(): Promise<QuestionResponse> {
  const res = await apiFetch("/api/question");
  return (await res.json()) as QuestionResponse;
}

/** Fetches every entity of a type, for answer suggestions. */
export async function getEntities(type: string): Promise<EntityList> {
  const res = await apiFetch(`/api/entities?type=${encodeURIComponent(type)}`);
  return (await res.json()) as EntityList;
}

/** Submits a learner's typed answer for a card and returns the verdict. */
export async function submitAnswer(cardId: string, input: string): Promise<AnswerResponse> {
  const res = await apiFetch("/api/answer", jsonInit("POST", { cardId, input }));
  return (await res.json()) as AnswerResponse;
}

/** Fetches the learner's answer log, most recent first. */
export async function getAnswers(): Promise<AnswerLogData> {
  const res = await apiFetch("/api/answers");
  return (await res.json()) as AnswerLogData;
}

/** Fetches the pack catalogue and the learner's current selection. */
export async function getPacks(): Promise<PackList> {
  const res = await apiFetch("/api/packs");
  return (await res.json()) as PackList;
}

/** Commits the learner's pack selection. Throws if the server rejects it. */
export async function savePacks(packIds: string[]): Promise<void> {
  const res = await apiFetch("/api/packs", jsonInit("PUT", { packIds }));
  if (!res.ok) throw new Error("save rejected");
}

/**
 * POSTs a feedback report. Goes through {@link apiFetch} like every other call,
 * so the learner's Bearer token rides along — the feedback table's RLS policy is
 * insert-only for `authenticated` and checks `user_id = auth.uid()`, so an
 * unauthenticated POST would be rejected by the server and again by the database.
 * There is deliberately no read counterpart: feedback is write-only for learners.
 */
export async function submitFeedback(body: FeedbackRequest): Promise<void> {
  const res = await apiFetch("/api/feedback", jsonInit("POST", body));
  if (!res.ok) throw new Error(`feedback submission failed: ${res.status}`);
}
