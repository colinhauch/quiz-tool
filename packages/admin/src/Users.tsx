import { useEffect, useState } from "react";
import type { AdminPopulation, AdminUserList } from "@geo/contract";
import { getPopulation, getUsers } from "./apiClient.js";
import { UserDetail } from "./UserDetail.js";

type View = { kind: "list" } | { kind: "user"; userId: string };

/** The all-users population summary (#142): counts, accuracy distribution, and per-day activity. */
function PopulationSummary({ population }: { population: AdminPopulation }) {
  return (
    <div className="admin-population-summary">
      <ul>
        <li>Total users: {population.totalUsers}</li>
        <li>Total answers: {population.totalAnswers}</li>
      </ul>

      <h3>Accuracy distribution</h3>
      <table>
        <thead>
          <tr>
            <th>Range</th>
            <th>Users</th>
          </tr>
        </thead>
        <tbody>
          {population.accuracyDistribution.map((bucket) => (
            <tr key={bucket.label}>
              <td>{bucket.label}</td>
              <td>{bucket.userCount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Activity by day</h3>
      {population.activityByDay.length === 0 ? (
        <p className="admin-muted">No activity yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Active users</th>
              <th>Answers</th>
            </tr>
          </thead>
          <tbody>
            {population.activityByDay.map((day) => (
              <tr key={day.date}>
                <td>{day.date}</td>
                <td>{day.activeUsers}</td>
                <td>{day.answerCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function UserListView({ onSelectUser }: { onSelectUser: (userId: string) => void }) {
  const [users, setUsers] = useState<AdminUserList | undefined>(undefined);
  const [population, setPopulation] = useState<AdminPopulation | undefined>(undefined);

  useEffect(() => {
    getUsers().then(setUsers);
    getPopulation().then(setPopulation);
  }, []);

  if (!users) return <p className="admin-surface__placeholder">Loading…</p>;

  return (
    <div>
      {population && <PopulationSummary population={population} />}
      <h3>Every user</h3>
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Created</th>
            <th>Last sign-in</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                <button type="button" className="admin-link" onClick={() => onSelectUser(user.id)}>
                  {user.email ?? user.id}
                </button>
              </td>
              <td>{user.createdAt}</td>
              <td>{user.lastSignInAt ?? "never"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Users surface — user list + population view → single-user detail (#140–#142). */
export function Users() {
  const [view, setView] = useState<View>({ kind: "list" });

  return (
    <section className="admin-surface" aria-labelledby="surface-Users">
      <h1 id="surface-Users" className="admin-surface__title">
        Users
      </h1>
      <nav aria-label="Breadcrumb" className="admin-breadcrumb">
        <button type="button" className="admin-link" onClick={() => setView({ kind: "list" })}>
          All users
        </button>
        {view.kind === "user" && <span> / User: {view.userId}</span>}
      </nav>

      {view.kind === "list" && <UserListView onSelectUser={(userId) => setView({ kind: "user", userId })} />}
      {view.kind === "user" && <UserDetail userId={view.userId} />}
    </section>
  );
}
