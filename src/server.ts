import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;
const apiOrigin = process.env["API_INTERNAL_ORIGIN"] ?? "http://127.0.0.1:3001";

async function forwardApiRequest(request: Request): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, apiOrigin);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", incomingUrl.host);
  headers.set("x-forwarded-proto", incomingUrl.protocol.slice(0, -1));
  const forwardedFor = headers.get("x-forwarded-for") ?? headers.get("x-real-ip");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);

  const method = request.method.toUpperCase();
  const init: RequestInit = { method, headers, redirect: "manual" };
  if (method !== "GET" && method !== "HEAD") init.body = await request.arrayBuffer();
  return fetch(upstreamUrl, init);
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const { pathname } = new URL(request.url);
      if (pathname === "/health" || pathname === "/healthz" || pathname.startsWith("/api/")) {
        return await forwardApiRequest(request);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
