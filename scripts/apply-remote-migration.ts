/**
 * schema_migrations_pkey 충돌 등으로 `supabase db push`가 실패할 때
 * 원격 places 테이블의 16-field 레거시 컬럼을 SQL Editor와 동일하게 DROP한다.
 *
 *   pnpm tsx scripts/apply-remote-migration.ts
 *
 * DDL 실행: supabase db query --linked (Management API)
 * 검증: SUPABASE_SERVICE_ROLE_KEY + PostgREST OpenAPI 스키마
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const LEGACY_COLUMNS = [
  "lat",
  "lng",
  "naver_url",
  "backup_place_id",
  "break_time",
  "last_verified",
  "notes",
  "curtail_count",
] as const;

const DROP_SQL = `
-- places 7-field 정규화: 레거시 컬럼 강제 DROP (idempotent)
${LEGACY_COLUMNS.map((col) => `alter table public.places drop column if exists ${col};`).join("\n")}

-- 신규 컬럼 idempotent 보강
alter table public.places
  add column if not exists tags text[] not null default '{}';

alter table public.places
  add column if not exists stroller_friendly boolean not null default false,
  add column if not exists has_nursing_room boolean not null default false;
`.trim();

function runRemoteSql(sql: string): void {
  const tmpFile = path.join(PROJECT_ROOT, "supabase", ".temp", "apply-remote-drop.sql");
  fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
  fs.writeFileSync(tmpFile, sql, "utf8");

  console.log("[apply-remote-migration] 원격 DB에 DROP SQL 적용 중...");
  execSync(`npx supabase db query --linked -f "${tmpFile}"`, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    shell: true,
  });
}

async function fetchPlacesColumns(): Promise<Set<string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.",
    );
  }

  const res = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/openapi+json",
    },
  });

  if (!res.ok) {
    throw new Error(`OpenAPI 스키마 조회 실패: HTTP ${res.status}`);
  }

  const spec = (await res.json()) as {
    definitions?: { places?: { properties?: Record<string, unknown> } };
    components?: { schemas?: { places?: { properties?: Record<string, unknown> } } };
  };

  const places =
    spec.definitions?.places ?? spec.components?.schemas?.places;
  const props = places?.properties ?? {};
  return new Set(Object.keys(props));
}

async function verifyLegacyColumnsDropped(): Promise<void> {
  const columns = await fetchPlacesColumns();
  const remaining = LEGACY_COLUMNS.filter((col) => columns.has(col));

  if (remaining.length > 0) {
    throw new Error(
      `레거시 컬럼이 아직 남아 있습니다: ${remaining.join(", ")}`,
    );
  }

  console.log("[apply-remote-migration] 검증 완료 — 레거시 컬럼 없음");
  console.log(
    `[apply-remote-migration] 현재 places 컬럼: ${[...columns].sort().join(", ")}`,
  );
}

async function main(): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY가 .env.local에 없습니다.");
  }

  runRemoteSql(DROP_SQL);
  await verifyLegacyColumnsDropped();

  console.log("원격 DB 7필드 정규화 완료. 레거시 컬럼 DROP 성공.");
}

main().catch((err: unknown) => {
  console.error("[apply-remote-migration] 실패:", err);
  process.exit(1);
});
