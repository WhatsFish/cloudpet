// One-time EXP migration for the V2 §2 level-curve swap.
//
// The new curve (web/src/lib/game/levels.ts) makes per-level gaps bigger, so the SAME stored exp
// would map to a LOWER level number. This script repositions each pet's stored exp so that after
// the swap every pet keeps its EXACT current displayed level AND its progress fraction into that
// level — nobody's level visibly drops on cutover.
//
// Run ORDER at cutover: deploy the new code (new levels.ts) and run this ONCE, together, in the
// same maintenance window. It is NOT idempotent (re-running would migrate already-migrated values),
// so it writes a one-shot marker row and refuses to run twice unless --force is passed.
//
//   node scripts/migrate-exp-v2.mjs            # DRY RUN — prints the table, writes nothing
//   node scripts/migrate-exp-v2.mjs --apply    # APPLY  — updates pet_state.exp inside one tx
//
// Connects with the same creds as the app (env: PG* or DATABASE_URL). On this VM run via the
// cloudpet env: `set -a; . ~/.config/cloudpet.env; set +a` first, or pass PG* explicitly.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
// `pg` lives in web/node_modules (scripts/ has none) — resolve it from there.
const pg = require(require.resolve("pg", { paths: [join(here, "../web/node_modules")] }));

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

// --- OLD curve (what stored exp currently means) ---
const oldCum = (N) => 60 * (N - 1) + 10 * (N - 1) ** 2;
const oldLevel = (exp) => 1 + Math.floor((-60 + Math.sqrt(3600 + 40 * Math.max(0, exp))) / 20);

// --- NEW curve (must match web/src/lib/game/levels.ts) ---
const gap = (n) => Math.round(90 + 20 * n + 1.1 * n * n);
const REACH = [0, 0];
for (let L = 2; L <= 201; L++) REACH[L] = REACH[L - 1] + gap(L - 1);
const newReach = (L) => (L <= 1 ? 0 : L <= 200 ? REACH[L] : REACH[200] + gap(200) * (L - 200));
const newLevel = (exp) => { let lv = 1; while (lv < 200 && REACH[lv + 1] <= Math.max(0, exp)) lv++; return lv; };

// migrate: keep the same level AND the same progress fraction into that level
function migrate(exp) {
  const L = oldLevel(exp);
  const olo = oldCum(L), ohi = oldCum(L + 1);
  const frac = ohi > olo ? (exp - olo) / (ohi - olo) : 0;
  const nlo = newReach(L), nhi = newReach(L + 1);
  return Math.round(nlo + frac * (nhi - nlo));
}

const MARKER = "exp_v2_curve";

async function main() {
  const client = new pg.Client(
    process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : undefined,
  );
  await client.connect();
  try {
    // one-shot marker table (idempotency guard)
    await client.query(`CREATE TABLE IF NOT EXISTS migration_marker (name text primary key, applied_at timestamptz not null default now())`);
    const done = await client.query(`SELECT 1 FROM migration_marker WHERE name=$1`, [MARKER]);
    if (done.rowCount && APPLY && !FORCE) {
      console.error(`✋ migration '${MARKER}' already applied. Use --force to override (NOT recommended).`);
      process.exit(1);
    }

    const { rows } = await client.query(
      `SELECT p.id, p.name, p.archetype_key AS arch, s.exp::float8 AS exp
       FROM pet p JOIN pet_state s ON s.pet_id = p.id ORDER BY s.exp DESC`,
    );

    console.log(`\n${APPLY ? "APPLY" : "DRY RUN"} — ${rows.length} pets\n`);
    console.log("name".padEnd(16), "arch".padEnd(8), "oldExp".padStart(7), "Lv".padStart(3), " ->", "newExp".padStart(7), "Lv".padStart(3));
    let drops = 0;
    for (const r of rows) {
      const oldExp = Math.round(r.exp);
      const oL = oldLevel(oldExp);
      const newExp = migrate(oldExp);
      const nL = newLevel(newExp);
      if (nL !== oL) drops++;
      console.log(
        String(r.name).slice(0, 16).padEnd(16), String(r.arch).padEnd(8),
        String(oldExp).padStart(7), String(oL).padStart(3), " ->",
        String(newExp).padStart(7), String(nL).padStart(3), nL !== oL ? "  ⚠️ LEVEL CHANGED" : "",
      );
    }
    console.log(`\nlevel-preservation check: ${drops === 0 ? "✅ all pets keep their level" : `❌ ${drops} pets changed level — DO NOT APPLY`}`);

    if (!APPLY) { console.log("\n(dry run — nothing written. Re-run with --apply to commit.)"); return; }
    if (drops !== 0 && !FORCE) { console.error("\nRefusing to apply: some pets would change level."); process.exit(1); }

    // exact per-row apply (authoritative — uses the same JS migrate() the dry-run printed)
    await client.query("BEGIN");
    for (const r of rows) {
      await client.query(`UPDATE pet_state SET exp = $2 WHERE pet_id = $1`, [r.id, migrate(Math.round(r.exp))]);
    }
    await client.query(`INSERT INTO migration_marker(name) VALUES($1) ON CONFLICT (name) DO UPDATE SET applied_at = now()`, [MARKER]);
    await client.query("COMMIT");
    console.log(`\n✅ applied to ${rows.length} pets and recorded marker '${MARKER}'.`);
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
