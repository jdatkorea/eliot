/**
 * 만료된 briefings 행 삭제 — 수동/주기 실행용 (T1, 2026-06-18).
 *
 * briefings.expires_at은 생성 시 now()+7일로 기본 설정된다(읍 read 시에도
 * 만료 행은 "찾을 수 없음"으로 처리되어 안전하지만, 무한 누적 방지를 위해
 * 이 스크립트로 실제 삭제까지 수행한다). 자동 스케줄링(pg_cron 등)은
 * 별도 인프라 결정 사항으로 범위 밖 — 운영자가 주기적으로 직접 실행하거나
 * 외부 cron에 연결한다.
 *
 * 실행: npx tsx scripts/purge-expired-briefings.ts
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import { createServiceRoleClient } from "./lib/place-sync";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
config({ path: resolve(process.cwd(), ".env"), quiet: true });

async function main() {
  const supabase = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("briefings")
    .delete()
    .lt("expires_at", nowIso)
    .select("id");

  if (error) {
    throw error;
  }

  console.log(`[purge-expired-briefings] 만료 행 ${data?.length ?? 0}건 삭제 완료.`);
}

main().catch((err: unknown) => {
  console.error("[purge-expired-briefings] 실패:", err);
  process.exit(1);
});
