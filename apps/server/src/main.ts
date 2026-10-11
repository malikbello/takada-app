import { loadConfig } from "./config";
import { openDb } from "./db";
import { buildApp } from "./app";
import { recoverStuck, startWorkers } from "./queue";
import { startRetention } from "./retention";
import { httpScribe } from "./upstream";

const cfg = loadConfig();
const db = openDb(cfg.DB_PATH);
const app = buildApp(db, cfg);
const recovered = recoverStuck(db);
const scribe = cfg.PHC_SCRIBE_URL
  ? httpScribe(cfg.PHC_SCRIBE_URL, cfg.PHC_SCRIBE_API_KEY, cfg.PHC_SCRIBE_PROXY_KEY && cfg.PHC_SCRIBE_PROXY_SECRET ? { key: cfg.PHC_SCRIBE_PROXY_KEY, secret: cfg.PHC_SCRIBE_PROXY_SECRET } : undefined)
  : null;
const stopWorkers = scribe && cfg.WORKERS > 0 ? startWorkers(db, scribe, cfg.WORKERS, cfg.NODE_NAME) : async () => undefined;
const stopRetention = startRetention(db, cfg.AUDIO_DIR, { audioDays: cfg.RETAIN_AUDIO_DAYS, unconfirmedDays: cfg.RETAIN_UNCONFIRMED_DAYS }, app.log);
if (!scribe) app.log.warn("PHC_SCRIBE_URL not set: drafting jobs will queue until it is configured");
if (recovered) app.log.warn({ recovered }, "requeued jobs left running by a previous crash");

async function shutdown(signal: string) {
  app.log.info({ signal }, "shutting down");
  stopRetention();
  await app.close();
  await stopWorkers();
  db.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port: cfg.PORT, host: cfg.HOST });
