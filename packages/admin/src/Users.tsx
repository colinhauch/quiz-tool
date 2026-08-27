import { useEffect, useState } from "react";
import type { AdminUserList } from "@geo/contract";
import { getUsers } from "./apiClient.js";

/** Users surface — user list, reading through the cross-user seam (#140). */
export function Users() {
  const [users, setUsers] = useState<AdminUserList | undefined>(undefined);

  useEffect(() => {
    getUsers().then(setUsers);
  }, []);

  return (
    <section className="admin-surface" aria-labelledby="surface-Users">
      <h1 id="surface-Users" className="admin-surface__title">
        Users
      </h1>
      {!users ? (
        <p className="admin-surface__placeholder">Loading…</p>
      ) : (
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
                <td>{user.email ?? user.id}</td>
                <td>{user.createdAt}</td>
                <td>{user.lastSignInAt ?? "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
