import z from "zod";

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalString = z.preprocess(blankToUndefined, z.string().trim().min(1).optional());
const optionalPort = z.preprocess(
  blankToUndefined,
  z.coerce.number().int().min(1).max(65535).optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must contain at least 32 characters"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_HOST: z.string().trim().min(1).optional(),
  FRONTEND_ORIGIN: z.string().optional(),
  ALLOWED_ORIGINS: z.preprocess(blankToUndefined, z.string().optional()),
  REPLIT_DEV_DOMAIN: z.string().trim().min(1).optional(),
  REPLIT_DOMAINS: z.string().optional(),
  APP_URL: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: optionalPort,
  EMAIL_USER: optionalString,
  EMAIL_PASS: optionalString,
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),
});

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

export type ApiConfig = {
  nodeEnv: "development" | "test" | "production";
  databaseUrl: string;
  sessionSecret: string;
  port: number;
  host: string;
  appUrl: string | undefined;
  frontendOrigins: string[];
  smtp: SmtpConfig | null;
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
  const smtpParts = [values.SMTP_HOST, values.SMTP_PORT, values.EMAIL_USER, values.EMAIL_PASS];
  const smtpPartsConfigured = smtpParts.filter((part) => part !== undefined).length;
  if (smtpPartsConfigured !== 0 && smtpPartsConfigured !== smtpParts.length) {
    throw new Error("SMTP_HOST, SMTP_PORT, EMAIL_USER, and EMAIL_PASS must be configured together");
  }
  const smtp: SmtpConfig | null =
    smtpPartsConfigured === smtpParts.length
      ? {
          host: values.SMTP_HOST!,
          port: values.SMTP_PORT!,
          user: values.EMAIL_USER!,
          password: values.EMAIL_PASS!,
          from: values.EMAIL_USER!,
        }
      : null;

  const replitDomains = values.REPLIT_DOMAINS?.split(",")
    .map((domain) => domain.trim())
    .filter(Boolean);
  for (const domain of replitDomains ?? []) {
    try {
      const parsedDomain = new URL(`https://${domain}`);
      if (
        parsedDomain.origin !== `https://${domain}` ||
        parsedDomain.hostname !== domain ||
        parsedDomain.username ||
        parsedDomain.password
      ) {
        throw new Error();
      }
    } catch {
      throw new Error("REPLIT_DOMAINS must contain comma-separated hostnames without schemes or paths");
    }
  }

  const replitOrigins = (replitDomains ?? []).map((domain) => `https://${domain}`);
  const defaultProductionAppUrl = replitOrigins.find((origin) =>
    new URL(origin).hostname.endsWith(".replit.app"),
  ) ?? replitOrigins[0];
  const appUrl =
    values.APP_URL ??
    (values.NODE_ENV === "production"
      ? defaultProductionAppUrl
      : values.REPLIT_DEV_DOMAIN
        ? `https://${values.REPLIT_DEV_DOMAIN}`
        : "http://localhost:5000");
  if (appUrl) {
    try {
      const parsedAppUrl = new URL(appUrl);
      if (
        !["http:", "https:"].includes(parsedAppUrl.protocol) ||
        parsedAppUrl.origin !== appUrl ||
        (values.NODE_ENV === "production" && parsedAppUrl.protocol !== "https:")
      ) {
        throw new Error();
      }
    } catch {
      throw new Error("APP_URL must be an exact origin without a path; production must use HTTPS");
    }
  }
  if (values.NODE_ENV === "production" && smtp && !appUrl) {
    throw new Error("APP_URL or REPLIT_DOMAINS is required when production email is configured");
  }

  const frontendOrigins = values.FRONTEND_ORIGIN?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of frontendOrigins ?? []) {
    try {
      const parsedOrigin = new URL(origin);
      if (
        origin.includes("*") ||
        !["http:", "https:"].includes(parsedOrigin.protocol) ||
        parsedOrigin.origin !== origin
      ) {
        throw new Error();
      }
    } catch {
      throw new Error("FRONTEND_ORIGIN must contain comma-separated origins without paths");
    }
  }
  const allowedOrigins = values.ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of allowedOrigins ?? []) {
    if (origin === "https://*.replit.app") continue;
    try {
      const parsedOrigin = new URL(origin);
      if (
        origin.includes("*") ||
        !["http:", "https:"].includes(parsedOrigin.protocol) ||
        parsedOrigin.origin !== origin
      ) {
        throw new Error();
      }
    } catch {
      throw new Error(
        "ALLOWED_ORIGINS must contain exact origins or the explicit https://*.replit.app pattern",
      );
    }
  }

  const developmentOrigins = new Set([
    "http://localhost",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
  ]);
  if (values.NODE_ENV === "development" && values.REPLIT_DEV_DOMAIN) {
    try {
      const origin = `https://${values.REPLIT_DEV_DOMAIN}`;
      const parsedOrigin = new URL(origin);
      if (
        parsedOrigin.origin !== origin ||
        parsedOrigin.hostname !== values.REPLIT_DEV_DOMAIN ||
        parsedOrigin.username ||
        parsedOrigin.password
      ) {
        throw new Error();
      }
      developmentOrigins.add(origin);
    } catch {
      throw new Error("REPLIT_DEV_DOMAIN must contain a hostname without a scheme or path");
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
    appUrl,
    frontendOrigins: [
      ...new Set([
        ...(values.NODE_ENV === "development" ? developmentOrigins : []),
        ...(values.NODE_ENV === "production" ? replitOrigins : []),
        ...(frontendOrigins ?? []),
        ...(allowedOrigins ?? []),
        ...(appUrl ? [appUrl] : []),
      ]),
    ],
    smtp,
    cookieSecure,
    cookieSameSite: values.COOKIE_SAME_SITE,
  };
}
