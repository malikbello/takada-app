// All configuration comes from the environment; secrets are never logged.
import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default("0.0.0.0"),
  ROLE: z.enum(["hub", "cloud"]).default("hub"),
  NODE_NAME: z.string().min(1).default("hub-1"),
  DB_PATH: z.string().default("./data/takada.sqlite"),
  AUDIO_DIR: z.string().default("./data/audio"),
  ADMIN_TOKEN: z.string().min(24, "ADMIN_TOKEN must be at least 24 characters"),
  PHC_SCRIBE_URL: z.string().url().optional(),
  PHC_SCRIBE_API_KEY: z.string().optional(),
  PHC_SCRIBE_PROXY_KEY: z.string().optional(),
  PHC_SCRIBE_PROXY_SECRET: z.string().optional(),
  WORKERS: z.coerce.number().int().min(0).max(16).default(1),
  MAX_AUDIO_MB: z.coerce.number().min(1).max(200).default(60), // about 31 minutes of 16 kHz mono
  CORS_ORIGINS: z.string().default(""),
  /** Days a confirmed visit's recordings and full transcript are kept (phc-scribe ADR-0033). */
  RETAIN_AUDIO_DAYS: z.coerce.number().min(0).max(3650).default(7),
  /** Days an unconfirmed visit's recordings and transcript are kept from its start. */
  RETAIN_UNCONFIRMED_DAYS: z.coerce.number().min(1).max(3650).default(30),
  /** The built phone app; the hub serves it so phones load it from the clinic, same origin. */
  STATIC_DIR: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});
export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = Env.safeParse(env);
  if (!r.success) throw new Error(`invalid configuration: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return r.data;
}
