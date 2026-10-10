import z from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must contain at least 32 characters"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_HOST: z.string().trim().min(1).optional(),
  FRONTEND_ORIGIN: z.string().optional(),
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),
});

export type ApiConfig = {
  nodeEnv: "development" | "test" | "production";
  databaseUrl: string;
  sessionSecret: string;
  port: number;
  host: string;
  frontendOrigins: string[];
  cookieSecure: boolean;
  cookieSameSite: "strict" | "lax" | "none";
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid API configuration: ${missing}`);
  }

  const values = parsed.data;
  const frontendOrigins = values.FRONTEND_ORIGIN?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of frontendOrigins ?? []) {
    try {
      const parsedOrigin = new URL(origin);
      if (!["http:", "https:"].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin) {
        throw new Error();
      }
    } catch {
      throw new Error("FRONTEND_ORIGIN must contain comma-separated origins without paths");
    }
  }

  const cookieSecure =
    values.COOKIE_SECURE === undefined
      ? values.NODE_ENV === "production"
      : values.COOKIE_SECURE === "true";
  if (values.COOKIE_SAME_SITE === "none" && !cookieSecure) {
    throw new Error("COOKIE_SECURE must be true when COOKIE_SAME_SITE is none");
  }

  return {
    nodeEnv: values.NODE_ENV,
    databaseUrl: values.DATABASE_URL,
    sessionSecret: values.SESSION_SECRET,
    port: values.API_PORT,
    host: values.API_HOST ?? (values.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0"),
    frontendOrigins:
      frontendOrigins ??
      (values.NODE_ENV === "development" ? ["http://localhost:5000", "http://127.0.0.1:5000"] : []),
    cookieSecure,
    cookieSameSite: values.COOKIE_SAME_SITE,
  };
}
