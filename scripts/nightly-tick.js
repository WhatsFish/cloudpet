#!/usr/bin/env node
// Nightly cron job. NOT the source of truth (the game is fully correct on
// compute-on-read alone). Two best-effort jobs, then a liveness heartbeat:
//   1. Retention: prune high-volume action_log / voice_log rows older than the
//      window the UI ever reads (diary LIMIT 30/40; loadRows only needs the
//      latest action). Keeps the largest table on the SHARED db from growing
//      without bound. checkin/complete/evolve are kept (low-volume, milestone).
//   2. Heartbeat: confirm the web app is reachable so /status shows the cron ran.
// (Phase 2 will add 订阅消息 reminders here.) ALWAYS exits 0 so a transient blip
// never trips the heartbeat — the cron's `&& touch <heartbeat>` only fires on
// exit 0, which is exactly the signal we want.

const http = require("node:http");
const { execFile } = require("node:child_process");

const URL = process.env.CLOUDPET_HEALTH_URL || "http://127.0.0.1:3012/cloudpet";
const DB_CONTAINER = process.env.CLOUDPET_DB_CONTAINER || "traffic-monitor-db-1";
const RETENTION_DAYS = parseInt(process.env.CLOUDPET_RETENTION_DAYS || "90", 10);
const stamp = new Date().toISOString();

const RETENTION_SQL =
  `DELETE FROM action_log WHERE created_at < now() - interval '${RETENTION_DAYS} days' ` +
  `AND verb NOT IN ('checkin','complete','evolve'); ` +
  `DELETE FROM voice_log WHERE created_at < now() - interval '${RETENTION_DAYS} days';`;

function heartbeat() {
  const req = http.get(URL, { timeout: 8000 }, (res) => {
    res.resume();
    console.log(`[${stamp}] nightly-tick: GET ${URL} -> ${res.statusCode}`);
    process.exit(0);
  });
  req.on("timeout", () => { console.log(`[${stamp}] nightly-tick: timeout`); req.destroy(); process.exit(0); });
  req.on("error", (e) => { console.log(`[${stamp}] nightly-tick: ${e.message}`); process.exit(0); });
}

// Run retention via the shared db container's local psql (umami superuser, trust auth inside
// the container). Best-effort: any failure is logged and ignored so the heartbeat still fires.
execFile(
  "docker",
  ["exec", DB_CONTAINER, "psql", "-U", "umami", "-d", "cloudpet", "-c", RETENTION_SQL],
  { timeout: 20000 },
  (err, stdout, stderr) => {
    if (err) console.log(`[${stamp}] retention skipped: ${err.message}`);
    else console.log(`[${stamp}] retention: ${String(stdout).trim().replace(/\n/g, " ")}${stderr ? " | " + String(stderr).trim() : ""}`);
    heartbeat();
  },
);
