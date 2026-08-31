/**
 * The one-line note that says how a surface relates to the selected
 * Environment (#173).
 *
 * It exists because "which environment am I looking at?" has three different
 * answers in this app and only one of them is the obvious one. The selector is
 * always visible, so every surface *looks* environment-scoped; Packs, Graph
 * Health and Generator Preview are not, and Users is scoped only in half. An
 * operator who misreads either draws a conclusion about the wrong data — the
 * exact failure the environment selector was built to prevent — so the answer
 * is stated on the surface rather than left to be inferred from the chrome.
 *
 * One component rather than three literals because the wording is the point:
 * these notes have to keep agreeing with each other as the app grows.
 */
export function EnvironmentNote({ kind }: { kind: "pack-graph" | "shared-roster" | "all-environments" }) {
  if (kind === "pack-graph") {
    return (
      <p className="admin-muted admin-env-note">
        Reads the local pack graph, so it does not vary by environment.
      </p>
    );
  }
  if (kind === "shared-roster") {
    return (
      <p className="admin-muted admin-env-note">
        The roster is shared across every environment — one auth pool — while the figures beside it are from the
        selected environment.
      </p>
    );
  }
  return (
    <p className="admin-muted admin-env-note">
      Reads all three environments at once, so the environment selector does not apply here.
    </p>
  );
}
