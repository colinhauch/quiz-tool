import { describe, expect, it } from "vitest";

import { resolveDeploy } from "./deploy-resolver.js";

describe("resolveDeploy", () => {
  it("maps each long-lived branch to its own Worker + domain", () => {
    expect(resolveDeploy("prod")).toMatchObject({
      kind: "deploy",
      env: "prod",
      argv: ["deploy"],
      worker: "quiz-tool",
      domain: "quiz.colinhauch.com",
    });
    expect(resolveDeploy("dev")).toMatchObject({
      kind: "deploy",
      env: "dev",
      argv: ["deploy", "--env", "dev"],
      worker: "quiz-tool-dev",
      domain: "quiz-dev.colinhauch.com",
    });
    expect(resolveDeploy("test")).toMatchObject({
      kind: "deploy",
      env: "test",
      argv: ["deploy", "--env", "test"],
      worker: "quiz-tool-test",
      domain: "quiz-test.colinhauch.com",
    });
  });

  it("strips a leading refs/heads/ so a ref-prefixed branch still resolves", () => {
    expect(resolveDeploy("refs/heads/dev")).toMatchObject({ kind: "deploy", env: "dev" });
    expect(resolveDeploy("refs/heads/test")).toMatchObject({ kind: "deploy", env: "test" });
    expect(resolveDeploy("refs/heads/prod")).toMatchObject({ kind: "deploy", env: "prod" });
  });

  it("prod never carries --env (deploys the top-level config)", () => {
    const action = resolveDeploy("prod");
    expect(action.kind).toBe("deploy");
    if (action.kind === "deploy") {
      expect(action.argv).not.toContain("--env");
    }
  });

  it("refuses a feature branch rather than touching any Worker", () => {
    const action = resolveDeploy("feature/new-pack");
    expect(action.kind).toBe("refuse");
    if (action.kind === "refuse") {
      expect(action.reason).toMatch(/not a deploy branch/i);
    }
  });

  it("refuses an empty or undefined branch", () => {
    expect(resolveDeploy("")).toMatchObject({ kind: "refuse" });
    expect(resolveDeploy(undefined)).toMatchObject({ kind: "refuse" });
  });

  it("refuses a near-miss (casing / default branch) rather than falling through to prod", () => {
    // The incident family: a value that isn't exactly a deploy branch must NEVER
    // resolve to a prod-touching action.
    for (const near of ["Test", "PROD", "Dev", "main", "master", "refs/heads/main"]) {
      expect(resolveDeploy(near)).toMatchObject({ kind: "refuse" });
    }
  });
});
