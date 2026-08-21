import type {
  AnswerLog as AnswerLogData,
  AnswerResponse,
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
 * The single choke point every frontend→server call passes through. All
 * request options (headers, method, body) are assembled here, and nowhere
 * else. When a learner is signed in it attaches `Authorization: Bearer
 * <token>` (the seam #67 turns on) so the Worker's auth middleware can verify
 * the request; signed out, the request goes exactly as before and the server
 * answers 401. No component should call `fetch()` directly; go through the
 * functions below instead.
 */
function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = accessTokenSource();
  if (!token) return fetch(path, init);
  return fetch(path, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
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
