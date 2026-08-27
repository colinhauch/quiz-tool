import { useEffect, useState } from "react";
import type { AdminAbilityTrajectoryPoint, AdminUserDetail } from "@geo/contract";
import { getUserDetail } from "./apiClient.js";
import { AnswerJumpLinks } from "./AnswerJumpLinks.js";

/** A minimal inline sparkline for the ability-over-time graph (#141) — no charting dependency, just a `<polyline>`. */
function AbilitySparkline({ trajectory }: { trajectory: AdminAbilityTrajectoryPoint[] }) {
  if (trajectory.length === 0) return <p className="admin-muted">No answers yet.</p>;
  const width = 300;
  const height = 60;
  const abilities = trajectory.map((p) => p.ability);
  const min = Math.min(...abilities);
  const max = Math.max(...abilities);
  const span = max - min || 1;
  const points = trajectory
    .map((p, i) => {
      const x = trajectory.length === 1 ? width / 2 : (i / (trajectory.length - 1)) * width;
      const y = height - ((p.ability - min) / span) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg role="img" aria-label="Ability over time" viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="admin-sparkline">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

/** Single-user detail (#141): ability per pack, per-user rollups, ability-over-time, and the recent Answer Log. */
export function UserDetail({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<AdminUserDetail | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setDetail(undefined);
    getUserDetail(userId).then((result) => {
      if (!cancelled) setDetail(result);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (detail === undefined) return <p className="admin-surface__placeholder">Loading…</p>;
  if (detail === null) return <p className="admin-surface__placeholder">Unknown user: {userId}</p>;

  const { user, abilities, aggregate, recentAnswers, trajectory } = detail;

  return (
    <div className="admin-user-detail">
      <h2>{user.email ?? user.id}</h2>
      <p className="admin-muted">
        Joined {user.createdAt} · Last active {aggregate.lastActiveAt ?? "never"}
      </p>

      <h3>Aggregate</h3>
      <ul>
        <li>Total answers: {aggregate.totalAnswers}</li>
        <li>Accuracy: {(aggregate.accuracy * 100).toFixed(1)}%</li>
        <li>Packs touched: {aggregate.packsTouched.join(", ") || "none"}</li>
      </ul>

      <h3>Ability by pack</h3>
      {abilities.length === 0 ? (
        <p className="admin-muted">No pack ability recorded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Pack</th>
              <th>Ability</th>
            </tr>
          </thead>
          <tbody>
            {abilities.map((a) => (
              <tr key={a.packId}>
                <td>{a.packLabel}</td>
                <td>{a.ability.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Ability over time</h3>
      <AbilitySparkline trajectory={trajectory} />

      <h3>Recent answers</h3>
      {recentAnswers.length === 0 ? (
        <p className="admin-muted">No answers yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Card</th>
              <th>Input</th>
              <th>Correct</th>
              <th>When</th>
              <th>Jump</th>
            </tr>
          </thead>
          <tbody>
            {recentAnswers.map((a, i) => (
              <tr key={`${a.cardId}:${a.askedAt}:${i}`}>
                <td>{a.cardId}</td>
                <td>{a.input}</td>
                <td>{a.correct ? "✓" : "✗"}</td>
                <td>{a.askedAt}</td>
                <td>
                  <AnswerJumpLinks entry={a} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
