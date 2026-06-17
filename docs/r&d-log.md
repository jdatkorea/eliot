# ELIOT R&D 일지

> 기술 리드 세션 기록. 최신 항목이 상단.

---

## 2026-06-17 — Zero-Noise 7필드 아키텍처 · 맛지도 시딩 · 멀티-블록 엔진

**전략적 연결:** 6/12 P2 M3(Config Decoupling)에서 확립한 "Engine 순수 함수 + Supabase 스냅샷" 불변식 위에, 6/13 Seed Foundation이 제안했던 데이터 내재화·태그 정규화 방향이 오늘 **7필드 구조화**로 코드·DDL에 고정되었다. 6/16 Geocoding & Seeding 파이프라인이 쌓아 둔 CSV·매칭 자산은 `archive/`로 격리되고, 동일 목적의 **멱등 ingest 경로**(`pnpm run ingest`)가 그 자리를 대체했다. 어제까지 단일 5시간 블록에 머물던 코스 생성기는, WebApp의 `duration` 입력(당일·1박2일·2박3일)과 맞물리도록 **멀티-블록 루프**로 확장되었다.

### 1. 스키마 및 아키텍처 혁신 — 16필드 → 7필드 Zero-Noise

| Before (16-field) | After (7-field + 파생) |
|-------------------|------------------------|
| `lat`/`lng` NOT NULL, Kakao geocode 의존 | 좌표 제거 → TMA `LocationManager` 런타임 해석 |
| `naver_url`, `backup_place_id`, `break_time`, `last_verified`, `notes`, `curtail_count` | 운영 메타 제거 → Sheets·SEED 영역으로 격리 |
| 비결정적 후보 선택 | `deterministicIndex()` + `passesRegionGate()` + `JOKER_FALLBACK` |

4단계 커밋 체인(`e22d298` → `22d3b2e` → `6a0eca9` → `6b7aa34`)으로 저장·가공·입력·검증 계층을 일괄 정합.

| 계층 | 핵심 산출물 |
|------|-------------|
| 저장층 | `places` DDL 7-field 정규화, `geocode-kakao-spots.ts`·`match-spots.ts` → `archive/` |
| 가공층 | `trip-context.ts`, `format-briefing.ts`, `pool_exhausted` 실패 경로 |
| 입력층 | `telegram-native.ts` — CloudStorage 피드백 루프, 네이티브 좌표→destination |
| 검증 | Vitest **172건** 회귀 스위트, `docs/cms-architecture.md` Before/After 다이어그램 |

**런타임 불변식 유지:** Engine은 `Place[]` + `AppConfig` + `FeedbackEvent[]`만 입력. Google/Kakao API 호출 0건.

### 2. 데이터 파이프라인 완성 — 맛지도 시딩

- **멀티-모델 파싱:** Perplexity·Gemini 이중 경로로 외부 맛집 큐레이션(이상호 셰프 맛지도 등)을 7필드 규격(`slug`, `destination`, `name`, `category`, `is_outdoor`, `no_kids_zone`, `tags`)으로 정규화. 총 **140건+** gastronomy 스팟 확보.
- **멱등 병합 파이프라인:** `scripts/ingest-spots.ts` — `data/incoming/*.csv` → `master_spots.csv` 병합(복합키 `destination_slug`) → `upsertPlaces()` → Supabase 동기화 → `data/archive/` 아카이빙. `pnpm run ingest` 한 줄로 재실행 가능.
- **마스터 스냅샷:** `data/master_spots.csv` **496건** (헤더 제외) — 경주·부산·가평 등 다목적지 Safe Pool.

### 3. 엔진 확장성 — 멀티-블록 루프

| 함수 | 역할 |
|------|------|
| `generateCourse()` | 단일 일차 · `COURSE_BLOCK_HOURS=5` · half-day 템플릿(4블록) |
| `generateMultiDayCourse()` | `duration` 일수만큼 루프 · `visitedIds` 누적 · 일차 간 중복 방지 |
| `assertNoCrossDayDuplicates()` | 1박2일·2박3일 교차일 중복 무결성 검증 |

- `app/api/course/generate/route.ts` — 멀티데이 코스 API 노출.
- `__tests__/course-generator.test.ts` — 단일 블록·excludeIds·멀티데이·중복 방지 계약 테스트.
- WebApp `TRIP_DURATION_OPTIONS` (당일치기 / 1박2일 / 2박3일)과 `normalize`·`build-trip-request` 경로 연동.

### 당일 커밋 타임라인 (요약)

| 해시 | 메시지 |
|------|--------|
| `6058e5e` | WebApp 폼 단순화 — 고정 조건 카드 + 가변 4필드 |
| `e22d298` | 7-field 스키마 피벗 & 레거시 스크립트 아카이브 |
| `22d3b2e` | 결정론적 destination 필터 & 실패 로직 |
| `6a0eca9` | TMA CloudStorage 피드백 루프 & 네이티브 geolocation |
| `6b7aa34` | 172-suite 회귀 & 아키텍처 문서 정합 |
| `65ad061` | 맛지도 140+ ingest & 멀티-블록 엔진 |

> **엔지니어링 한 줄:** 사령관의 "텔레그램에 실릴 것만 남긴다"는 직관이 7필드 스키마로 형식화되었고, AI 파싱은 데이터 공장·엔진은 결정론 공장으로 역할이 분리되었다 — 노이즈는 ingest에서 걸러지고, 런타임은 항상 동일 입력→동일 출력을 유지한다.

---

## 2026-06-16 — Geocoding 파이프라인 & 진단 핫픽스

**전략적 연결:** 6/13 경주·공공데이터 Layer A 시딩 이후, 좌표·설정 누락이 프로덕션 UX(S1~S5)로 표면화. 감사(`docs/elliott_diagnosis.md`) 기반 핫픽스 일괄 적용.

| 항목 | 조치 |
|------|------|
| 날짜 하드코딩 | KST 동적 `date_label` 전달 (`2c59441`) |
| `app_config` 0행 | 시딩 SQL + DEFAULT 폴백 경고 (`e7f1203`) |
| 루트 템플릿 노출 | `/` → `/webapp` 리다이렉트 (`8143a3f`) |
| duration 가드 | `duration_hours` 양수 finite 검증 (`aa97882`) |
| Geocoding | Kakao 기반 좌표 파이프라인 구축 (`78f4d19`) |

---

## 2026-06-13 — Seed Foundation (2-Layer 소싱)

**전략적 연결:** P2 M2 Sheets CMS 이후, 공공 관광 오픈데이터(Layer A)와 소셜 큐레이션(Layer B) 이원 구조 확립.

| STEP | 산출물 |
|------|--------|
| destinations 테이블 | `center_lat/lng`, `default_radius_km`, anon SELECT RLS |
| places 확장 | `stroller_friendly`, `has_nursing_room` boolean 승격 |
| tag vocabulary | family→bool, operational→drop, vibe 화이트리스트 |
| Layer A importer | `scripts/import-tour-data.ts` — 로컬 CSV, dry-run 기본 |
| Freshness | `last_social_seen` + stale 리포트 (삭제 없음) |
| 릴리즈 블로커 | B1 빈 풀 throw, B2 radius cap, B4 anon-read 3테이블 |

경주 Google Sheets→Supabase 시딩 파이프라인 최초 개통 (`c90fe12`).

---

## 2026-06-12 — P2 M3 완료 · Config Decoupling · Handoff

**전략적 연결:** P0 E2E → P1 DDL → P2 M1~M2 데이터·피드백 루프를 거쳐, 운영 설정까지 Sheets SSOT로 이전 완료.

| 마일스톤 | 핵심 |
|----------|------|
| P0 | Telegram WebApp → 웹훅 → Engine×2(A/B) → 정적 브리핑 E2E |
| P1 | `places`, `feedback_events` DDL |
| P2 M2 | Google Sheets CMS, `cms:sync`, Zod 부분 동기화 |
| P2 M3 | `app_config` 탭 → Supabase → Engine 주입, `DEFAULT_APP_CONFIG` fail-over |

Vitest 36건 → 이관 문서 `docs/handoff-20260612.md` 작성. **3-Phase 불변식 확립:** SEED only Google API · TRIP-PREP LLM 0건 · FEEDBACK generic event schema.

---

*ELIOT Project — R&D Log*
