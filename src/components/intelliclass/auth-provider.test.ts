import { describe, expect, it } from "vitest";
import { getApiErrorMessage } from "./auth-errors";
import { authHome } from "./auth-provider";

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

describe("authHome", () => {
  it.each([
    ["STUDENT", "/student/dashboard"],
    ["TEACHER", "/teacher/dashboard"],
    ["INSTITUTION_ADMIN", "/admin/dashboard"],
    ["SUPER_ADMIN", "/admin/dashboard"],
  ] as const)("routes %s to its role workspace", (role, route) => {
    expect(authHome(role)).toBe(route);
  });
});
