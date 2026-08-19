import type {
  AnswerLog as AnswerLogData,
  AnswerResponse,
  PackList,
  QuestionResponse,
} from "@geo/contract";

/**
 * The single choke point every frontend→server call passes through. All
 * request options (headers, method, body) are assembled here, and nowhere
 * else — this is the seam #67 extends to attach `Authorization: Bearer
 * <token>` once auth lands. No component should call `fetch()` directly;
 * go through the functions below instead.
 */
function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, init);
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
