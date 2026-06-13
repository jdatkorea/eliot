/**
 * 배포 게이트: anon key와 service-role key 양쪽으로 count를 비교해
 * RLS SELECT 정책 누락 여부를 테이블별로 검증한다.
 * migration(RLS 정책) 적용 후 실행한다.
 *
 *   pnpm tsx scripts/verify-anon-read.ts
 *
 * 판정 규칙:
 *   places        : anon === service AND service >= 1  (Safe Pool 비면 실패)
 *   app_config    : anon === service                   (0이면 통과하되 warn)
 *   feedback_events: anon === service                  (0 허용)
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY가 .env.local에 없습니다.");
  process.exit(1);
}
if (!serviceKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY가 .env.local에 없습니다.");
  process.exit(1);
}

const anon = createClient(url, anonKey);
const service = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

type TableName = "places" | "feedback_events" | "app_config";

interface TableRule {
  requireNonEmpty: boolean;
}

const TABLES: Record<TableName, TableRule> = {
  places: { requireNonEmpty: true },
  app_config: { requireNonEmpty: false },
  feedback_events: { requireNonEmpty: false },
};

async function countRows(
  client: ReturnType<typeof createClient>,
  table: TableName,
): Promise<number | null> {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) return null;
  return count ?? 0;
}

async function main() {
  let failed = false;

  for (const [table, rule] of Object.entries(TABLES) as [TableName, TableRule][]) {
    const serviceCount = await countRows(service as unknown as ReturnType<typeof createClient>, table);
    const anonCount = await countRows(anon as unknown as ReturnType<typeof createClient>, table);

    if (serviceCount === null) {
      console.error(`[${table}] service-role SELECT 실패 — 연결 또는 권한 오류`);
      failed = true;
      continue;
    }

    if (anonCount === null) {
      console.error(`[${table}] anon SELECT 실패 — RLS SELECT 정책 누락`);
      failed = true;
      continue;
    }

    if (anonCount !== serviceCount) {
      console.error(
        `[${table}] RLS SELECT 정책 누락: anon=${anonCount} service=${serviceCount}`,
      );
      failed = true;
      continue;
    }

    if (rule.requireNonEmpty && serviceCount < 1) {
      console.error(`[${table}] Safe Pool 비어 있음 — 장소 데이터 로드 필요`);
      failed = true;
      continue;
    }

    if (!rule.requireNonEmpty && serviceCount === 0) {
      console.warn(`[${table}] OK (행 0건 — 정상, 미동기화 가능)`);
    } else {
      console.log(`OK: [${table}] anon=${anonCount} service=${serviceCount}`);
    }
  }

  if (failed) {
    process.exit(1);
  }
}

main();
