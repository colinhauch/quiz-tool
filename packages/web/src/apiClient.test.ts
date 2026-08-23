import type { AnswerLog, AnswerResponse, PackList, QuestionResponse } from "@geo/contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAnswers,
  getPacks,
  getQuestion,
  savePacks,
  setAccessTokenSource,
  setUnauthorizedHandler,
  submitAnswer,
} from "./apiClient.js";

afterEach(() => {
  vi.restoreAllMocks();
  // Reset the token source so a test that signs in never leaks into the next.
  setAccessTokenSource(() => null);
  setUnauthorizedHandler(() => {});
});

describe("apiClient", () => {
  it("getQuestion fetches GET /api/question and returns the parsed body", async () => {
    const question: QuestionResponse = {
      cardId: "cc:tokyo-japan:object",
      prompt: "What country is Tokyo in?",
      input: "text",
      packId: "core-cities",
      packLabel: "Cities & Countries",
    };
    const fetchMock = vi.fn(() => Promise.resolve({ json: async () => question }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getQuestion()).resolves.toEqual(question);
    expect(fetchMock).toHaveBeenCalledWith("/api/question", undefined);
  });

  it("submitAnswer POSTs the card id and input as JSON and returns the parsed result", async () => {
    const result: AnswerResponse = { correct: true, acceptedAnswer: "Japan" };
    const fetchMock = vi.fn(() => Promise.resolve({ json: async () => result }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitAnswer("cc:tokyo-japan:object", "Japan")).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith("/api/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: "cc:tokyo-japan:object", input: "Japan" }),
    });
  });

  it("getAnswers fetches GET /api/answers and returns the parsed log", async () => {
    const log: AnswerLog = [
      {
        cardId: "cc:tokyo-japan:object",
        question: "What country is Tokyo in?",
        input: "Japan",
        correct: true,
        askedAt: "t",
      },
    ];
    const fetchMock = vi.fn(() => Promise.resolve({ json: async () => log }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAnswers()).resolves.toEqual(log);
    expect(fetchMock).toHaveBeenCalledWith("/api/answers", undefined);
  });

  it("getPacks fetches GET /api/packs and returns the parsed list", async () => {
    const list: PackList = { packs: [], queued: 0 };
    const fetchMock = vi.fn(() => Promise.resolve({ json: async () => list }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPacks()).resolves.toEqual(list);
    expect(fetchMock).toHaveBeenCalledWith("/api/packs", undefined);
  });

  it("savePacks PUTs the pack ids as JSON and resolves on success", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(savePacks(["core-cities"])).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/packs", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packIds: ["core-cities"] }),
    });
  });

  it("savePacks rejects when the server rejects the save", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(savePacks([])).rejects.toThrow();
  });
});

describe("apiClient auth", () => {
  it("attaches Authorization: Bearer <token> when signed in (GET)", async () => {
    setAccessTokenSource(() => "the-access-token");
    const fetchMock = vi.fn(() => Promise.resolve({ json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);

    await getQuestion();

    expect(fetchMock).toHaveBeenCalledWith("/api/question", {
      headers: { Authorization: "Bearer the-access-token" },
    });
  });

  it("merges the bearer token with a request's own headers (POST)", async () => {
    setAccessTokenSource(() => "the-access-token");
    const fetchMock = vi.fn(() => Promise.resolve({ json: async () => ({ correct: true }) }));
    vi.stubGlobal("fetch", fetchMock);

    await submitAnswer("cc:tokyo-japan:object", "Japan");

    expect(fetchMock).toHaveBeenCalledWith("/api/answer", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer the-access-token",
      },
      body: JSON.stringify({ cardId: "cc:tokyo-japan:object", input: "Japan" }),
    });
  });

  it("sends no Authorization header when signed out", async () => {
    setAccessTokenSource(() => null);
    const fetchMock = vi.fn(() => Promise.resolve({ json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);

    await getQuestion();

    expect(fetchMock).toHaveBeenCalledWith("/api/question", undefined);
  });

  it("funnels a 401 while signed in to the unauthorized handler", async () => {
    setAccessTokenSource(() => "the-access-token");
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ status: 401, json: async () => ({}) })),
    );

    await getQuestion();

    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("does not treat a 401 while signed out as expiry", async () => {
    setAccessTokenSource(() => null);
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ status: 401, json: async () => ({}) })),
    );

    await getQuestion();

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("does not fire the unauthorized handler on a successful response", async () => {
    setAccessTokenSource(() => "the-access-token");
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ status: 200, json: async () => ({}) })),
    );

    await getQuestion();

    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
