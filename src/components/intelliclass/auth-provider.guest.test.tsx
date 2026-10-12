// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-provider";

function AuthProbe() {
  const { user, state, isGuest, continueAsGuest, requestJson } = useAuth();
  const [message, setMessage] = useState("");

  return (
    <div>
      <span data-testid="state">{state}</span>
      <span data-testid="role">{user?.role ?? "none"}</span>
      <span data-testid="guest">{isGuest ? "guest" : "account"}</span>
      <button onClick={continueAsGuest}>Continue as Guest</button>
      <button
        onClick={() => {
          void requestJson("dashboard/summary").catch((error: Error) => setMessage(error.message));
        }}
      >
        Try data request
      </button>
      <span data-testid="message">{message}</span>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("guest preview", () => {
  it("keeps guest access student-only and blocks API calls after an in-flight account refresh", async () => {
    let resolveRefresh!: (response: Response) => void;
    const pendingRefresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/v1/auth/refresh") return pendingRefresh;
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Continue as Guest" }));
    resolveRefresh(
      new Response(
        JSON.stringify({
          data: {
            accessToken: "must-not-replace-guest",
            expiresIn: 600,
            user: {
              id: "real-admin",
              institutionId: "real-institution",
              email: "admin@example.edu",
              firstName: "Real",
              lastName: "Admin",
              role: "SUPER_ADMIN",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId("state")).toHaveTextContent("signed-in");
      expect(screen.getByTestId("role")).toHaveTextContent("STUDENT");
      expect(screen.getByTestId("guest")).toHaveTextContent("guest");
    });

    fireEvent.click(screen.getByRole("button", { name: "Try data request" }));
    await waitFor(() =>
      expect(screen.getByTestId("message")).toHaveTextContent(
        "Guest preview is limited to the student workspace",
      ),
    );
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain(
      "/api/v1/dashboard/summary",
    );
  });
});
