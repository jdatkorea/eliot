/**
 * 장소 신선도 리포트 — 폐기 후보 플래그 (자동 삭제 없음, 리포트만)
 *
 * 판정 기준:
 *   last_social_seen 기준으로 STALE_DAYS 이상 업데이트 없으면 "폐기 후보" 출력.
 *
 * 실행:
 *   npx tsx scripts/freshness-report.ts [--stale-days=180]
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import { createServiceRoleClient } from "./lib/place-sync";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
config({ path: resolve(process.cwd(), ".env"), quiet: true });

const DEFAULT_STALE_DAYS = 180;

function parseStaleDaysArg(): number {
  const arg = process.argv.find((a) => a.startsWith("--stale-days="));
  if (!arg) return DEFAULT_STALE_DAYS;
  const n = Number(arg.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STALE_DAYS;
}

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

async function main() {
  const staleDays = parseStaleDaysArg();
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("places")
    .select("id, name, destination, last_social_seen")
    .order("last_social_seen", { ascending: true, nullsFirst: true });

  if (error) {
    console.error(`places SELECT 실패: ${error.message}`);
    process.exit(1);
  }

  const rows = data ?? [];
  const stale: typeof rows = [];
  const fresh: typeof rows = [];

  for (const row of rows) {
    const signalDate = row.last_social_seen;
    const age = daysSince(signalDate);
    if (age === null || age >= staleDays) {
      stale.push(row);
    } else {
      fresh.push(row);
    }
  }

  console.log(`\n=== 신선도 리포트 (기준: ${staleDays}일, 오늘: ${new Date().toISOString().slice(0, 10)}) ===`);
  console.log(`총 ${rows.length}건 — 신선 ${fresh.length}건 / 폐기후보 ${stale.length}건\n`);

  if (stale.length > 0) {
    console.log("⚠ 폐기 후보 (최신 신호 없음 또는 기준일 초과):");
    for (const row of stale) {
      const age = daysSince(row.last_social_seen);
      console.log(
        `  - ${row.id} | ${row.name} | ${row.destination} | last_social_seen=${row.last_social_seen ?? "(없음)"} | ${age ?? "날짜불명"}일 경과`,
      );
    }
  }

  if (fresh.length > 0) {
    console.log(`\n✓ 신선 (${staleDays}일 미만):`);
    for (const row of fresh) {
      console.log(`  - ${row.id} | ${row.name}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
