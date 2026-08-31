import { type ChildProcess, spawn } from "node:child_process";

/**
 * The single command behind `pnpm --filter @geo/admin dev`: it runs the BFF and
 * the Vite SPA together, so the operator starts the whole admin surface with one
 * invocation. No `concurrently` dependency — a dozen lines of `spawn` does it and
 * keeps the package's dep list honest.
 *
 * Both children inherit stdio (their logs interleave) and share this process's
 * fate: a Ctrl-C here, or either child dying, tears the other down so a half-up
 * dev environment never lingers.
 */
const children: ChildProcess[] = [];
let shuttingDown = false;

function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  process.exit(code);
}

function run(name: string, script: string): void {
  const child = spawn("pnpm", ["run", script], { stdio: "inherit" });
  children.push(child);
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[admin dev] ${name} exited (${code ?? "signal"}); shutting down`);
      shutdown(code ?? 1);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("bff", "dev:bff");
run("spa", "dev:spa");
