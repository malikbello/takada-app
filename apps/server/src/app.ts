// Takada server: the same service runs as a clinic hub (offline, local model) and in
// the cloud. Routes are versioned under /v1; every input is validated; errors use one
// envelope { error: { code, message } }; logs never contain clinical text.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { VisitEvent, verifyEvent } from "@takada/protocol";
import { deviceForToken, newPairingCode, newToken, safeEqual, sha256, type Device } from "./auth";
import type { Config } from "./config";
import { toFhir } from "./fhir";
import { claimVisit, insertEvent, priorityOf, visit, visitFacility } from "./store";

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

declare module "fastify" {
  interface FastifyRequest {
    device?: Device;
  }
}

const PushBody = z.object({ events: z.array(z.unknown()).min(1).max(500) });
const PairBody = z.object({ code: z.string().min(6).max(16), deviceId: z.string().min(1).max(64), worker: z.string().min(1).max(64) });
const CodeBody = z.object({ facility: z.string().min(1).max(64), ttlMinutes: z.number().int().min(1).max(24 * 60).default(30) });
const JobBody = z.object({ visitId: z.string().uuid(), language: z.enum(["yo", "pcm", "en", "ha", "ig", "auto"]), audioIds: z.array(z.string().uuid()).max(20) });
const PullQuery = z.object({ after: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(1000).default(500) });

export function buildApp(db: DatabaseSync, cfg: Config): FastifyInstance {
  const app = Fastify({
    logger: {
      level: cfg.LOG_LEVEL,
      // Request lines only: method, route, status, timing. Never bodies or headers.
      serializers: {
        req: (r) => ({ method: r.method, url: r.url.split("?")[0] }),
        res: (r) => ({ statusCode: r.statusCode }),
      },
    },
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: cfg.ROLE === "cloud",
    genReqId: () => crypto.randomUUID(),
  });

  app.addContentTypeParser(["audio/wav", "audio/x-wav", "application/octet-stream"], { parseAs: "buffer", bodyLimit: cfg.MAX_AUDIO_MB * 1024 * 1024 }, (_r, body, done) => done(null, body));

  const origins = cfg.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  app.addHook("onRequest", async (req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff").header("Referrer-Policy", "no-referrer");
    if (req.url.startsWith("/v1/") || req.url.startsWith("/ready")) reply.header("Cache-Control", "no-store");
    const origin = req.headers.origin;
    if (origin && origins.includes(origin)) {
      reply.header("Access-Control-Allow-Origin", origin).header("Vary", "Origin")
        .header("Access-Control-Allow-Headers", "Authorization, Content-Type").header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
      if (req.method === "OPTIONS") return reply.code(204).send();
    }
  });

  app.setErrorHandler((raw, req, reply) => {
    const err = raw as Error & { statusCode?: number };
    if (err instanceof ApiError) return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
    if (err instanceof z.ZodError) return reply.code(400).send({ error: { code: "invalid_request", message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: { code: "bad_request", message: err.message } });
    req.log.error({ err: { message: err.message, stack: err.stack } }, "unhandled error");
    return reply.code(500).send({ error: { code: "internal", message: "Something went wrong" } });
  });

  const requireDevice = async (req: FastifyRequest) => {
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const device = token ? deviceForToken(db, token) : null;
    if (!device) throw new ApiError(401, "unauthorized", "Pair this phone with the clinic hub first");
    req.device = device;
  };
  const requireAdmin = async (req: FastifyRequest) => {
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!token || !safeEqual(token, cfg.ADMIN_TOKEN)) throw new ApiError(401, "unauthorized", "Admin token required");
  };
  const ownVisit = (req: FastifyRequest, visitId: string) => {
    const facility = visitFacility(db, visitId);
    if (!facility) throw new ApiError(404, "not_found", "Visit not found");
    if (facility !== req.device!.facility) throw new ApiError(403, "forbidden", "Visit belongs to another facility");
  };

  // ---------------------------------------------------------------- health
  app.get("/healthz", async () => ({ ok: true, role: cfg.ROLE, node: cfg.NODE_NAME }));
  app.get("/readyz", async (_req, reply: FastifyReply) => {
    try {
      db.prepare("SELECT 1").get();
      const q = db.prepare("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status").all() as { status: string; n: number }[];
      return { ok: true, scribe: Boolean(cfg.PHC_SCRIBE_URL), jobs: Object.fromEntries(q.map((r) => [r.status, Number(r.n)])) };
    } catch (e) {
      return reply.code(503).send({ ok: false, error: (e as Error).message });
    }
  });

  // ---------------------------------------------------------------- pairing
  app.post("/v1/admin/pairing-codes", { preHandler: requireAdmin }, async (req) => {
    const body = CodeBody.parse(req.body);
    const code = newPairingCode();
    const expiresAt = new Date(Date.now() + body.ttlMinutes * 60_000).toISOString();
    db.prepare("INSERT INTO pairing_codes (code_hash, facility, expires_at) VALUES (?,?,?)").run(sha256(code), body.facility, expiresAt);
    return { code, facility: body.facility, expiresAt };
  });

  app.post("/v1/admin/devices/:id/revoke", { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    const r = db.prepare("UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(new Date().toISOString(), id);
    if (!Number(r.changes)) throw new ApiError(404, "not_found", "No active device with that id");
    return { revoked: id };
  });

  app.post("/v1/pair", { config: {} }, async (req) => {
    const body = PairBody.parse(req.body);
    const now = new Date().toISOString();
    const row = db.prepare("SELECT facility, expires_at, used_at FROM pairing_codes WHERE code_hash = ?").get(sha256(body.code.toUpperCase())) as
      | { facility: string; expires_at: string; used_at: string | null }
      | undefined;
    if (!row || row.used_at || row.expires_at < now) throw new ApiError(403, "invalid_code", "That pairing code is wrong, used or expired");
    const token = newToken();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE pairing_codes SET used_at = ? WHERE code_hash = ?").run(now, sha256(body.code.toUpperCase()));
      db.prepare("INSERT INTO devices (id, facility, worker, token_hash, paired_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET facility = excluded.facility, worker = excluded.worker, token_hash = excluded.token_hash, paired_at = excluded.paired_at, revoked_at = NULL")
        .run(body.deviceId, row.facility, body.worker, sha256(token), now);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return { token, facility: row.facility, node: cfg.NODE_NAME, role: cfg.ROLE };
  });

  // ---------------------------------------------------------------- sync
  app.post("/v1/sync/push", { preHandler: requireDevice }, async (req) => {
    const { events } = PushBody.parse(req.body);
    const dev = req.device!;
    const accepted: string[] = [];
    const rejected: { id: string; reason: string }[] = [];
    for (const raw of events) {
      const parsed = VisitEvent.safeParse(raw);
      const id = (raw as { id?: string })?.id ?? "?";
      if (!parsed.success) { rejected.push({ id, reason: "invalid_event" }); continue; }
      const e = parsed.data;
      if (e.deviceId !== dev.id) { rejected.push({ id, reason: "wrong_device" }); continue; }
      if (!(await verifyEvent(e))) { rejected.push({ id, reason: "bad_hash" }); continue; }
      if (e.type === "visit.started" && e.payload.facility !== dev.facility) { rejected.push({ id, reason: "wrong_facility" }); continue; }
      const owner = visitFacility(db, e.visitId);
      if (owner === null) {
        if (e.type !== "visit.started") { rejected.push({ id, reason: "visit_unknown_yet" }); continue; }
        claimVisit(db, e.visitId, dev.facility);
      } else if (owner !== dev.facility) { rejected.push({ id, reason: "wrong_facility" }); continue; }
      insertEvent(db, e, dev.facility);
      accepted.push(e.id); // duplicates are accepted too: delivery is idempotent
    }
    return { accepted, rejected };
  });

  app.get("/v1/sync/pull", { preHandler: requireDevice }, async (req) => {
    const q = PullQuery.parse(req.query);
    const rows = db.prepare("SELECT seq, body FROM events WHERE facility = ? AND seq > ? ORDER BY seq LIMIT ?").all(req.device!.facility, q.after, q.limit) as { seq: number; body: string }[];
    return { events: rows.map((r) => JSON.parse(r.body)), next: rows.length ? Number(rows.at(-1)!.seq) : q.after };
  });

  // ---------------------------------------------------------------- audio + drafting jobs
  app.put("/v1/audio/:visitId/:id", { preHandler: requireDevice }, async (req) => {
    const { visitId, id } = z.object({ visitId: z.string().uuid(), id: z.string().uuid() }).parse(req.params);
    ownVisit(req, visitId);
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length < 44 || body.subarray(0, 4).toString("latin1") !== "RIFF" || body.subarray(8, 12).toString("latin1") !== "WAVE") {
      throw new ApiError(415, "not_wav", "Send the recording as WAV (Content-Type: audio/wav)");
    }
    const dir = join(cfg.AUDIO_DIR, visitId);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${id}.wav`);
    writeFileSync(path, body, { mode: 0o600 });
    db.prepare("INSERT OR REPLACE INTO audio (id, visit_id, facility, path, bytes, uploaded_at) VALUES (?,?,?,?,?,?)").run(id, visitId, req.device!.facility, path, body.length, new Date().toISOString());
    return { stored: id, bytes: body.length };
  });

  app.post("/v1/jobs", { preHandler: requireDevice }, async (req, reply) => {
    const body = JobBody.parse(req.body);
    ownVisit(req, body.visitId);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO jobs (id, visit_id, facility, language, audio_ids, priority, status, created_at, updated_at, not_before) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(id, body.visitId, req.device!.facility, body.language, JSON.stringify(body.audioIds), priorityOf(visit(db, body.visitId)), "queued", now, now, now);
    const ahead = db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running') AND id != ?").get(id) as { n: number };
    return reply.code(202).send({ id, status: "queued", ahead: Number(ahead.n) });
  });

  app.get("/v1/jobs/:id", { preHandler: requireDevice }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const row = db.prepare("SELECT id, visit_id, facility, status, attempts, error, updated_at FROM jobs WHERE id = ?").get(id) as Record<string, string> | undefined;
    if (!row || row.facility !== req.device!.facility) throw new ApiError(404, "not_found", "Job not found");
    return { id: row.id, visitId: row.visit_id, status: row.status, attempts: row.attempts, error: row.error, updatedAt: row.updated_at };
  });

  // ---------------------------------------------------------------- interoperability
  app.get("/v1/visits/:id/fhir", { preHandler: requireDevice }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    ownVisit(req, id);
    const v = visit(db, id);
    if (!v) throw new ApiError(404, "not_found", "Visit not found");
    return reply.header("Content-Type", "application/fhir+json").send(toFhir(v, { facility: req.device!.facility, node: cfg.NODE_NAME }));
  });

  if (cfg.STATIC_DIR) {
    app.register(fastifyStatic, {
      root: cfg.STATIC_DIR,
      prefix: "/",
      index: ["index.html"],
      setHeaders: (res, path) => {
        // The service worker and app shell must revalidate; hashed assets can cache for a year.
        res.header("Cache-Control", /\/assets\//.test(path) ? "public, max-age=31536000, immutable" : "no-cache");
        res.header("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self'; frame-ancestors 'none'");
      },
    });
  }

  return app;
}
