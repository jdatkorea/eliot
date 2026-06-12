/**
 * 배포 게이트: anon key로 places / feedback_events / app_config
 * 각각 SELECT 1건 이상 확인.
 * migration(RLS 정책) 적용 후 실행한다.
 *
 *   pnpm tsx scripts/verify-anon-read.ts
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY가 .env.local에 없습니다.");
  process.exit(1);
}

const TABLES = ["places", "feedback_events", "app_config"] as const;

async function main() {
  const supabase = createClient(url!, anonKey!);
  let failed = false;

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("id").limit(1);

    if (error) {
      console.error(`[${table}] anon SELECT 실패:`, error.message);
      failed = true;
      continue;
    }

    if (!data || data.length < 1) {
      console.error(
        `[${table}] anon SELECT 성공했으나 행 0건 — RLS 정책 누락 또는 테이블 비어 있음`,
      );
      failed = true;
      continue;
    }

    console.log(`OK: [${table}] anon SELECT 1건`, data[0]);
  }

  if (failed) {
    process.exit(1);
  }
}

main();
