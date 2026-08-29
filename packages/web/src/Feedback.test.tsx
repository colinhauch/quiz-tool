import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./apiClient.js";
import { Feedback } from "./Feedback.js";

/** A client whose submitFeedback resolves, so we can assert what was sent. */
function okClient(): ApiClient {
  return { submitFeedback: vi.fn(() => Promise.resolve()) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Feedback", () => {
  it("disables submit until there is non-empty text", async () => {
    render(<Feedback client={okClient()} />);
    const button = screen.getByRole("button", { name: /send feedback/i });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/your feedback/i), { target: { value: "   " } });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/your feedback/i), { target: { value: "Nice app" } });
    expect(button).toBeEnabled();
  });

  it("submits general feedback and shows an inline confirmation, then resets", async () => {
    const client = okClient();
    render(<Feedback client={client} />);

    const box = screen.getByLabelText(/your feedback/i);
    fireEvent.change(box, { target: { value: "The map is gorgeous." } });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/your feedback was sent/i);
    expect(client.submitFeedback).toHaveBeenCalledWith({
      kind: "general",
      comment: "The map is gorgeous.",
    });
    // Box reset after a successful send.
    expect(box).toHaveValue("");
  });

  it("trims surrounding whitespace from the submitted comment", async () => {
    const client = okClient();
    render(<Feedback client={client} />);
    fireEvent.change(screen.getByLabelText(/your feedback/i), {
      target: { value: "  spacey  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    await screen.findByRole("status");
    expect(client.submitFeedback).toHaveBeenCalledWith({ kind: "general", comment: "spacey" });
  });

  it("shows an error and does not reset when the submission fails", async () => {
    const client: ApiClient = { submitFeedback: vi.fn(() => Promise.reject(new Error("nope"))) };
    render(<Feedback client={client} />);
    const box = screen.getByLabelText(/your feedback/i);
    fireEvent.change(box, { target: { value: "keep me" } });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/couldn’t send/i);
    expect(box).toHaveValue("keep me");
  });

  it("guards out a signed-out visitor", () => {
    const client = okClient();
    render(<Feedback isSignedIn={false} client={client} />);
    expect(screen.getByText(/sign in to send feedback/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/your feedback/i)).not.toBeInTheDocument();
  });

  it("clears the confirmation once the learner types again", async () => {
    render(<Feedback client={okClient()} />);
    const box = screen.getByLabelText(/your feedback/i);
    fireEvent.change(box, { target: { value: "first note" } });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    await screen.findByRole("status");

    fireEvent.change(box, { target: { value: "second" } });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });
});
