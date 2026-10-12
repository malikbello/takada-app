// The public demo hub (the judges' sandbox): the same Takada server as a clinic hub, run in
// the cloud with the fine-tuned N-ATLaS on a GPU. Each phone that joins gets a demo clinic of
// its own. Set at build time (VITE_DEMO_HUB); clinic builds leave it unset and never show it.

import { db } from "./db";
import type { Profile } from "./store";
import { pair, type Link } from "./sync";

export const DEMO_HUB: string | null = ((import.meta.env.VITE_DEMO_HUB as string | undefined) ?? "").replace(/\/+$/, "") || null;
const DEMO_CODE = (import.meta.env.VITE_DEMO_CODE as string | undefined) || "TAKADA26";

export const isDemo = (link: Pick<Link, "url"> | null | undefined): boolean => !!DEMO_HUB && link?.url === DEMO_HUB;

export async function joinDemo(profile: Pick<Profile, "deviceId" | "worker">): Promise<Link> {
  if (!DEMO_HUB) throw new Error("This build has no demo hub");
  return pair(DEMO_HUB, DEMO_CODE, profile.deviceId, profile.worker);
}

/** The demo hub restarted and lost its copy of this phone: join again and send everything again. */
export async function rejoinDemo(): Promise<Link> {
  const rows = await db.settings.bulkGet(["deviceId", "worker"]);
  const [deviceId, worker] = rows.map((r) => r?.value);
  if (!deviceId || !worker) throw new Error("Set up the app first");
  const link = await joinDemo({ deviceId, worker });
  await db.events.toCollection().modify({ synced: 0 });
  await db.blobs.toCollection().modify({ uploaded: 0 });
  await db.settings.put({ key: "cursor", value: "0" });
  return link;
}
