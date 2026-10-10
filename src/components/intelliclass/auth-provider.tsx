import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type AccountRole = "SUPER_ADMIN" | "INSTITUTION_ADMIN" | "TEACHER" | "STUDENT";

export type AuthUser = {
  id: string;
  institutionId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  role: AccountRole;
};

type TokenResponse = { data: { accessToken: string; expiresIn: number; user: AuthUser } };
type AuthContextValue = {
  user: AuthUser | null;
  state: "restoring" | "signed-in" | "signed-out";
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  requestJson: <T>(path: string, init?: RequestInit) => Promise<T>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiRequestError("The server returned an unreadable response.", response.status);
  }
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "message" in body.error &&
      typeof body.error.message === "string"
        ? body.error.message
        : "The request could not be completed.";
    throw new ApiRequestError(message, response.status);
  }
  return body as T;
}

function authHome(role: AccountRole) {
  if (role === "TEACHER") return "/teacher/dashboard" as const;
  if (role === "STUDENT") return "/student/dashboard" as const;
  return "/admin/dashboard" as const;
}

export { authHome };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [state, setState] = useState<AuthContextValue["state"]>("restoring");
  const tokenRef = useRef<string | null>(null);
  const refreshRef = useRef<Promise<TokenResponse | null> | null>(null);

  const refresh = useCallback(async () => {
    if (!refreshRef.current) {
      refreshRef.current = (async () => {
        const response = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          credentials: "same-origin",
        });
        if (!response.ok) return null;
        return readResponse<TokenResponse>(response);
      })().finally(() => {
        refreshRef.current = null;
      });
    }
    return refreshRef.current;
  }, []);

  const applyTokenResponse = useCallback((result: TokenResponse) => {
    tokenRef.current = result.data.accessToken;
    setUser(result.data.user);
    setState("signed-in");
  }, []);

  useEffect(() => {
    let active = true;
    void refresh()
      .then((result) => {
        if (!active) return;
        if (result) applyTokenResponse(result);
        else {
          tokenRef.current = null;
          setUser(null);
          setState("signed-out");
        }
      })
      .catch(() => {
        if (active) {
          tokenRef.current = null;
          setUser(null);
          setState("signed-out");
        }
      });
    return () => {
      active = false;
    };
  }, [applyTokenResponse, refresh]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await readResponse<TokenResponse>(response);
      applyTokenResponse(result);
      return result.data.user;
    },
    [applyTokenResponse],
  );

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      tokenRef.current = null;
      setUser(null);
      setState("signed-out");
    }
  }, []);

  const requestJson = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const url = path.startsWith("/api/v1/") ? path : `/api/v1/${path.replace(/^\/+/, "")}`;
      const send = (token: string | null) => {
        const headers = new Headers(init.headers);
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return fetch(url, { ...init, headers, credentials: "same-origin" });
      };

      let response = await send(tokenRef.current);
      if (response.status === 401 && tokenRef.current) {
        const renewed = await refresh();
        if (renewed) {
          applyTokenResponse(renewed);
          response = await send(renewed.data.accessToken);
        } else {
          tokenRef.current = null;
          setUser(null);
          setState("signed-out");
        }
      }
      return readResponse<T>(response);
    },
    [applyTokenResponse, refresh],
  );

  return (
    <AuthContext.Provider value={{ user, state, signIn, signOut, requestJson }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used within AuthProvider");
  return auth;
}
