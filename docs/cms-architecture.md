# ELIOT CMS Architecture — Google Sheets Headless CMS

## 개요

ELIOT의 마스터 데이터(Safe Pool 장소, 운영 설정)는 **Google Sheets**에서 관리한다.  
런타임(TRIP-PREP 웹훅, Engine, Web App)은 Supabase에 이미 동기화된 스냅샷만 읽으며, **Google API 호출은 SEED 단계 스크립트에서만** 수행한다.

```
┌─────────────────────┐     SEED only      ┌──────────────────────┐
│  Google Sheets      │ ─────────────────► │  scripts/sync-sheets │
│  (SSOT / Master)    │   googleapis       │  .ts                 │
└─────────────────────┘                    └──────────┬───────────┘
                                                      │ upsert
                                                      ▼
                                           ┌──────────────────────┐
                                           │  Supabase `places`   │
                                           │  (Runtime Snapshot)  │
                                           └──────────┬───────────┘
                                                      │ select *
                                                      ▼
┌─────────────────────┐                    ┌──────────────────────┐
│  Telegram Webhook   │ ◄── fetch only ──│  fetch-briefing-data │
│  Engine (pure fn)   │                    │  (Supabase client) │
└─────────────────────┘                    └──────────────────────┘
```

## 아키텍처 불변식 (Invariants)

| # | 규칙 | 근거 |
|---|------|------|
| 1 | **런타임 Google API 호출 0건** | 웹훅 응답 SLA·외부 의존성 격리 |
| 2 | **Sheets → DB 단방향** | Sheets가 SSOT, Supabase는 배포 스냅샷 |
| 3 | **Engine 순수 함수 유지** | `places: Place[]` 인자만 받음, IO 없음 |
| 4 | **웹훅은 Supabase만 조회** | `fetchBriefingData()` 경로 고정 |

## 스프레드시트 구조

### 시트 1: `places` (Safe Pool)

첫 행은 헤더. 데이터 행은 2행부터. `id`가 비어 있거나 `status=archived`인 행은 동기화에서 제외한다.

| 컬럼 (Sheet) | `places` 테이블 | TypeScript (`Place`) | 타입 | 필수 | 변환 규칙 |
|--------------|-----------------|----------------------|------|------|-----------|
| `id` | `id` | `id` | `text` | ✓ | 슬러그(`p001`) 또는 UUID. 슬러그는 `uuid v5`로 결정적 매핑 (`scripts/lib/place-sync.ts`) |
| `destination` | `destination` | `destination` | `text` | ✓ | 예: `인천_근교` |
| `name` | `name` | `name` | `text` | ✓ | 표시명 |
| `category` | `category` | `category` | `enum` | ✓ | `meal` \| `cafe` \| `activity` \| `view` \| `kids` |
| `lat` | `lat` | `lat` | `number` | ✓ | WGS84 위도 |
| `lng` | `lng` | `lng` | `number` | ✓ | WGS84 경도 |
| `curtail_count` | `curtail_count` | `curtail_count` | `integer` | ✓ | 브리핑 블록 수 상한에 사용 |
| `is_outdoor` | `is_outdoor` | `is_outdoor` | `boolean` | ✓ | `TRUE`/`FALSE`, `1`/`0`, `예`/`아니오` |
| `no_kids_zone` | `no_kids_zone` | `no_kids_zone` | `boolean` | ✓ | 동일 |
| `break_time` | `break_time` | `break_time` | `text` | | 빈 셀 → `null` |
| `naver_url` | `naver_url` | `naver_url` | `text` | ✓ | 네이버 지도 URL |
| `backup_place_id` | `backup_place_id` | `backup_place_id` | `text` | | 빈 셀 → `null`. `id`와 동일한 UUID 매핑 규칙 적용 |
| `last_verified` | `last_verified` | `last_verified` | `date` | ✓ | `YYYY-MM-DD` |
| `notes` | `notes` | `notes` | `text` | | 빈 셀 → `null` |
| `status` | *(미저장)* | — | `enum` | | `active` \| `archived`. `archived` 행은 upsert 제외 |

#### Supabase `places` DDL (PRD 정합)

```sql
create table public.places (
  id              uuid primary key,
  destination     text not null,
  name            text not null,
  category        text not null check (category in ('meal','cafe','activity','view','kids')),
  lat             double precision not null,
  lng             double precision not null,
  curtail_count   integer not null default 0,
  is_outdoor      boolean not null default false,
  no_kids_zone    boolean not null default false,
  break_time      text,
  naver_url       text not null,
  backup_place_id uuid references public.places(id),
  last_verified   date not null,
  notes           text
);
```

Engine 계약 타입: `lib/engine/types.ts` → `Place`.

### 시트 2: `config` (운영 설정, P2 M2+)

M2 스캐폴딩 단계에서는 **문서화만** 수행한다. 런타임 설정(`lib/config/mood-tags.config.ts` 등)은 후속 마일스톤에서 Sheets 동기화 대상이 된다.

| 컬럼 | 설명 | 예시 |
|------|------|------|
| `key` | 설정 키 | `default_destination` |
| `value` | JSON 또는 스칼라 | `인천_근교` |
| `scope` | 적용 범위 | `global` \| `destination:인천_근교` |
| `updated_at` | 수정일 | `2026-06-12` |

## 동기화 파이프라인

### 1. 인증 (SEED 전용)

`.env.local`:

```env
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
GOOGLE_SHEETS_SPREADSHEET_ID=<spreadsheet-id>
GOOGLE_SHEETS_PLACES_RANGE=places!A2:O
```

- `GOOGLE_SERVICE_ACCOUNT_KEY`: 서비스 계정 JSON (한 줄 문자열)
- 스프레드시트는 서비스 계정 이메일에 **뷰어 이상** 권한 공유

### 2. 읽기 — `scripts/sync-sheets.ts`

1. `googleapis`로 `spreadsheets.values.get` 호출
2. 헤더-인덱스 매핑 후 `SheetPlaceRow[]` 파싱
3. `status !== 'archived'` 필터
4. `Place[]`로 정규화 (boolean/date/coerce)

### 3. 쓰기 — `scripts/lib/place-sync.ts`

1. `mapPlaceRow()` — 슬러그 ID → UUID v5, `backup_place_id` 2-pass 해석
2. `upsertPlaces()` — `onConflict: "id"` upsert
3. 기존 `scripts/seed-supabase.ts`(fixture)와 **동일 upsert 경로** 공유

### 4. 실행

```bash
# Fixture 기반 (기존)
npm run db:seed

# Sheets 기반 (M2 스캐폴딩 — 실행은 SYNC_EXECUTE=true 시에만)
npm run cms:sync
```

| 스크립트 | 데이터 소스 | Google API | Supabase 쓰기 |
|----------|-------------|------------|---------------|
| `db:seed` | `fixtures/places.sample.json` | ✗ | ✓ |
| `cms:sync` | Google Sheets | ✓ (SEED only) | ✓ (opt-in) |

## 격리 검증 체크리스트

- [ ] `app/` · `lib/engine/` · `lib/webhook/`에 `googleapis` import 없음
- [ ] 웹훅 핸들러가 `fetchBriefingData()` → Supabase만 사용
- [ ] Engine 함수 시그니처에 `Place[]` 외 DB/CMS 의존성 없음
- [ ] `cms:sync`는 `scripts/` 트리에만 존재, Next.js 번들 미포함

## 후속 작업 (M2 이후)

- `config` 시트 → Supabase `app_config` 테이블 동기화
- CI/CD에서 `cms:sync` 스케줄 (배포 전 스냅샷 갱신)
- 동기화 diff 리포트 및 `archived` 행 soft-delete 정책
