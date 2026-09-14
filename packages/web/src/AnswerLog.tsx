import type { AbilityHistory, AnswerLog as AnswerLogData } from "@geo/contract";
import { useCallback, useEffect, useState } from "react";
import { AbilityChart } from "./AbilityChart.js";
import { AnswerSummary } from "./AnswerSummary.js";
import { getAbility, getAnswers } from "./apiClient.js";

type View =
  | { state: "loading" }
  | { state: "error" }
  // `ability` is null when its route failed: the log still renders, we just
  // omit the chart rather than show its "no answers yet" state misleadingly.
  | { state: "loaded"; answers: AnswerLogData; ability: AbilityHistory | null };

export function AnswerLog() {
  const [view, setView] = useState<View>({ state: "loading" });

  const load = useCallback(async () => {
    setView({ state: "loading" });
    try {
      // The chart is secondary telemetry: a failed `/ability` degrades to no
      // chart, but must never take the answer log down with it.
      const [answers, ability] = await Promise.all([getAnswers(), getAbility().catch(() => null)]);
      setView({ state: "loaded", answers, ability });
    } catch {
      setView({ state: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (view.state === "loading") return <p className="quiz-message">Loading your answers…</p>;
  if (view.state === "error") {
    return <p className="quiz-message">Couldn’t load your answers. Try again.</p>;
  }
  if (view.answers.length === 0) {
    return <p className="quiz-message">No answers yet. Answer a question to start your log.</p>;
  }

  return (
    <>
      <AnswerSummary answers={view.answers} />
      {view.ability !== null && <AbilityChart points={view.ability} />}
      <table className="answer-log">
        <caption>Your answers, most recent first</caption>
        <thead>
          <tr>
            <th scope="col">Question</th>
            <th scope="col">Your answer</th>
            <th scope="col">Correct answer</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {view.answers.map((a, i) => (
            // The log has no stable per-row id in the contract; the card + timestamp
            // pair is effectively unique, and the index disambiguates any collision.
            <tr key={`${a.cardId}@${a.askedAt}#${i}`}>
              <td>{a.question}</td>
              <td>{a.input || "—"}</td>
              <td>{a.acceptedAnswer ?? "—"}</td>
              <td>
                <span className={`result-pill ${a.correct ? "result-pill--correct" : "result-pill--incorrect"}`}>
                  {a.correct ? "Correct" : "Incorrect"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
