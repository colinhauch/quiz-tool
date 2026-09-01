import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSignedInSource } from "./auth.js";
import { Feedback } from "./Feedback.js";

/**
 * Stubs the POST the component makes, recording each body so a submission can
 * be asserted on. `ok` drives the success and failure paths. Fetch is stubbed
 * rather than an injected client because the component calls the apiClient's
 * free functions directly — that is what routes the request through `apiFetch`
 * and gets the learner's Bearer token attached.
 */
function stubFetch(ok = true) {
  const posts: unknown[] = [];
  const fetchMock = vi.fn((_url: string, init?: { method?: string; body?: string }) => {
    posts.push(JSON.parse(init?.body ?? "{}"));
    return Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => ({}) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return posts;
}

beforeEach(() => {
  setSignedInSource(() => true);
});

afterEach(() => {
  setSignedInSource(() => false);
  vi.restoreAllMocks();
});

describe("Feedback", () => {
  it("disables submit until there is non-empty text", async () => {
    stubFetch();
    render(<Feedback />);
    const button = screen.getByRole("button", { name: /send feedback/i });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/your feedback/i), { target: { value: "   " } });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/your feedback/i), { target: { value: "Nice app" } });
    expect(button).toBeEnabled();
  });

  it("submits general feedback and shows an inline confirmation, then resets", async () => {
    const posts = stubFetch();
    render(<Feedback />);

    const box = screen.getByLabelText(/your feedback/i);
    fireEvent.change(box, { target: { value: "The map is gorgeous." } });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/your feedback was sent/i);
    expect(posts).toEqual([{ kind: "general", comment: "The map is gorgeous." }]);
    // Box reset after a successful send.
    expect(box).toHaveValue("");
  });

  it("trims surrounding whitespace from the submitted comment", async () => {
    const posts = stubFetch();
    render(<Feedback />);
    fireEvent.change(screen.getByLabelText(/your feedback/i), {
      target: { value: "  spacey  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    await screen.findByRole("status");
    expect(posts).toEqual([{ kind: "general", comment: "spacey" }]);
  });

  it("shows an error and does not reset when the submission fails", async () => {
    stubFetch(false);
    render(<Feedback />);
    const box = screen.getByLabelText(/your feedback/i);
    fireEvent.change(box, { target: { value: "keep me" } });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/couldn’t send/i);
    expect(box).toHaveValue("keep me");
  });

  it("guards out a signed-out visitor", () => {
    stubFetch();
    render(<Feedback isSignedIn={false} />);
    expect(screen.getByText(/sign in to send feedback/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/your feedback/i)).not.toBeInTheDocument();
  });

  it("clears the confirmation once the learner types again", async () => {
    stubFetch();
    render(<Feedback />);
    const box = screen.getByLabelText(/your feedback/i);
    fireEvent.change(box, { target: { value: "first note" } });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    await screen.findByRole("status");

    fireEvent.change(box, { target: { value: "second" } });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  // The gate on the app as a whole is about to loosen for anonymous play, so
  // this surface has to read the sign-in state itself rather than assume it.
  it("reads the sign-in state from the auth boundary when no prop is given", () => {
    setSignedInSource(() => false);
    stubFetch();
    render(<Feedback />);
    expect(screen.getByText(/sign in to send feedback/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/your feedback/i)).toBeNull();
  });

  it("clears the box when the learner cancels", () => {
    stubFetch();
    render(<Feedback />);
    const box = screen.getByLabelText(/your feedback/i);
    fireEvent.change(box, { target: { value: "never mind" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(box).toHaveValue("");
  });
});
