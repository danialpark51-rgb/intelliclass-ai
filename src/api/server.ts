import { PrismaClient } from "@prisma/client";
import { createApiApp } from "./app";
import { loadConfig } from "./config/env";

const config = loadConfig();
const database = new PrismaClient({
  log: config.nodeEnv === "development" ? ["warn", "error"] : ["error"],
});
const app = createApiApp(database, config);

const server = app.listen(config.port, config.host, () => {
  console.info(`IntelliClass API listening on ${config.host}:${config.port}`);
});

async function shutdown(signal: string) {
  console.info(`Received ${signal}; closing API server`);
  server.close(async (error) => {
    await database.$disconnect();
    if (error) {
      console.error("API server shutdown failed");
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
