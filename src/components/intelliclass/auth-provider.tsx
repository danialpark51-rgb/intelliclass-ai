import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiRequestError, getApiErrorMessage } from "./auth-errors";
export { ApiRequestError } from "./auth-errors";

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
  isGuest: boolean;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  continueAsGuest: () => void;
  signOut: () => Promise<void>;
  requestJson: <T>(path: string, init?: RequestInit) => Promise<T>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiRequestError("The server returned an unreadable response.", response.status);
  }
  if (!response.ok) {
    throw new ApiRequestError(getApiErrorMessage(body), response.status);
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
  const [isGuest, setIsGuest] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const refreshRef = useRef<Promise<TokenResponse | null> | null>(null);
  const authActionVersionRef = useRef(0);

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
    setIsGuest(false);
    setUser(result.data.user);
    setState("signed-in");
  }, []);

  useEffect(() => {
    let active = true;
    const actionVersion = authActionVersionRef.current;
    void refresh()
      .then((result) => {
        if (!active || actionVersion !== authActionVersionRef.current) return;
        if (result) applyTokenResponse(result);
        else {
          tokenRef.current = null;
          setIsGuest(false);
          setUser(null);
          setState("signed-out");
        }
      })
      .catch(() => {
        if (active && actionVersion === authActionVersionRef.current) {
          tokenRef.current = null;
          setIsGuest(false);
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
      authActionVersionRef.current += 1;
      setIsGuest(false);
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

  const continueAsGuest = useCallback(() => {
    authActionVersionRef.current += 1;
    tokenRef.current = null;
    setUser({
      id: "guest-preview",
      institutionId: null,
      email: "guest@preview.intelliclass",
      firstName: "Guest",
      lastName: "Student",
      role: "STUDENT",
    });
    setIsGuest(true);
    setState("signed-in");
    void fetch("/api/v1/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => undefined);
  }, []);

  const signOut = useCallback(async () => {
    authActionVersionRef.current += 1;
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      tokenRef.current = null;
      setIsGuest(false);
      setUser(null);
      setState("signed-out");
    }
  }, []);

  const requestJson = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      if (isGuest) {
        throw new ApiRequestError(
          "Guest preview is limited to the student workspace and does not access institution data.",
          403,
        );
      }
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
    [applyTokenResponse, isGuest, refresh],
  );

  return (
    <AuthContext.Provider value={{ user, state, isGuest, signIn, continueAsGuest, signOut, requestJson }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used within AuthProvider");
  return auth;
}
