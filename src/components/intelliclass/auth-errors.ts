type ApiErrorBody = { error?: { code?: unknown; message?: unknown } };

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function getApiErrorMessage(body: unknown) {
  const error =
    typeof body === "object" && body !== null && "error" in body
      ? (body as ApiErrorBody).error
      : undefined;
  if (error?.code === "CORS_ORIGIN_DENIED") {
    return "IntelliClass can’t sign in from this address. Open the official IntelliClass app URL and try again.";
  }
  if (typeof error?.message === "string") return error.message;
  return "The request could not be completed.";
}
