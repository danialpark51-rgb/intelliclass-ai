import { describe, expect, it } from "vitest";
import { getApiErrorMessage } from "./auth-errors";

describe("getApiErrorMessage", () => {
  it("shows a clear instruction instead of the raw CORS rejection", () => {
    const message = getApiErrorMessage({
      error: {
        code: "CORS_ORIGIN_DENIED",
        message: "This origin is not allowed",
      },
    });

    expect(message).toContain("official IntelliClass app URL");
    expect(message).not.toContain("This origin is not allowed");
  });

  it("preserves ordinary API validation messages", () => {
    expect(
      getApiErrorMessage({
        error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect" },
      }),
    ).toBe("Email or password is incorrect");
  });
});
