import { useEffect, useState } from "react";
import type { AdminUserList } from "@geo/contract";
import { getUsers } from "./apiClient.js";
import { UserDetail } from "./UserDetail.js";

type View = { kind: "list" } | { kind: "user"; userId: string };

function UserListView({ onSelectUser }: { onSelectUser: (userId: string) => void }) {
  const [users, setUsers] = useState<AdminUserList | undefined>(undefined);

  useEffect(() => {
    getUsers().then(setUsers);
  }, []);

  if (!users) return <p className="admin-surface__placeholder">Loading…</p>;

  return (
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
  );
}

/** Users surface — user list → single-user detail (#140, #141). */
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
