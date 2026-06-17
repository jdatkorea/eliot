# ELIOT 시스템 무결성 감사 보고서

> 작성: 2026-06-17 | 감사자: Chief Architect 세션 | 범위: 전체 코드베이스 + git 이력(`e22d298` → `65ad061`) + 172/192-suite 테스트
> 선행 문서: `docs/elliott_diagnosis.md`(2026-06-16, S1~S5 진단) — 본 보고서는 그 이후의 변경분(7-field 전환 완료, TMA 피드백 루프, 140+ 스팟 시딩)을 대상으로 한다.

---

## 1) Executive Summary

**현재 시스템 안정성 등급: B-**

| 평가축 | 판정 | 근거 |
|---|---|---|
| 테스트 무결성 | ✅ Green | `npx vitest run` → 18 suites / 192 tests 전부 통과 (커밋 메시지의 "172-suite"보다 실제로 늘어남) |
| 7-field 스키마 정합성 | ✅ 정합 | DDL(`places.sql`)·`Place` 타입·`mapPlaceRow()` upsert 3곳 모두 7-field(+2 파생 컬럼) 일치. 16-field 잔재(lat/lng/naver_url 등) 없음 |
| 서비스 롤 클라이언트 | ✅ 정합 | `scripts/lib/place-sync.ts`의 `createServiceRoleClient()` + `upsertPlaces()`가 `sync-sheets.ts`·`ingest-spots.ts`·`seed-busan.ts` 전부에서 공유됨. 런타임(`app/**`)에는 service-role key 노출 없음(anon만 사용) — 격리 정상 |
| Engine 순수성 불변식 | ✅ 유지 | `rg "fetch\(|await " lib/engine/` 0건. `course-generator.ts`/`generate-briefing.ts` 모두 `Place[]`·`AppConfig`만 인자로 받음 |
| **신규 시딩 데이터의 실사용 가능성** | ❌ **불일치 발견** | 140+ 스팟 중 "송도" 외 지역(경주·가평·속초·부산·제주 등 약 96%)이 **현재 프로덕션 플로우에서 도달 불가** — 상세 §3-1 |
| 엔진 로직 일관성 | ⚠️ 부분 중복 | 1일 코스(인라인) vs 멀티데이 코스(`course-generator.ts`)가 거의 동일하지만 미세하게 다른 두 구현으로 분기 — 상세 §3-2 |

**한 줄 요약**: 스키마·테스트·서비스 격리 같은 "구조적" 무결성은 양호하지만, 지난 세션에서 시딩한 140+ 맛집 데이터의 실질적 가치는 **목적지 선택 메커니즘 부재로 현재 막혀 있다**. 이건 버그라기보다 "다음 마일스톤에서 반드시 풀어야 할 구조적 갭"이며, 사령관님의 향후 목표(권역 확장)와 정면으로 충돌한다.

---

## 2) Changes Log (e22d298 → 65ad061, 5개 커밋)

| 커밋 | 계층 | 핵심 변화 |
|---|---|---|
| `e22d298` refactor(data): pivot to 7-field schema | 저장층 | 16-field DDL → 7-field(`id, destination, name, category, is_outdoor, no_kids_zone, tags`) + 파생 2컬럼. Kakao geocode 스크립트 `archive/` 격리 |
| `22d3b2e` refactor(engine): deterministic destination filter | 가공/출력층 | `trip-context.ts` 신설, `deterministicIndex()`/`passesRegionGate()`/`JOKER_FALLBACK_PLACE`/`pool_exhausted` 도입, `format-briefing.ts` 분리 |
| `6a0eca9` feat(tma): cloud storage feedback loop & native geolocation | 입력/저장층 | `telegram-native.ts`(LocationManager·CloudStorage), `feedback-storage.ts`, admin 대시보드(`DashboardView.tsx` 등) 추가 |
| `6b7aa34` test: 172-suite regression | 검증 | 7-field 회귀 테스트 확충, `cms-architecture.md`/`audit-20260612.md` 문서화 |
| `65ad061` chore(data): ingest 140+ gastronomy spots | 데이터 + **가공/출력층 동시 변경** | `data/master_spots.csv`(497행) 추가, `scripts/ingest-spots.ts` 신설. **동시에** `lib/engine/course-generator.ts`(341줄, 멀티데이 엔진), `app/api/course/generate/route.ts`(신규 API, 115줄), `generate-briefing.ts` 100줄 변경이 같은 커밋에 포함됨 |

**커밋 위생 노트**: `65ad061`은 메시지상 "데이터 적재(chore)"이지만 실제로는 엔진 신규 모듈(`course-generator.ts`)과 신규 API 라우트까지 포함한 기능 커밋이다. 되돌리기 단위(atomic revert)가 깨져 있다 — 우선순위 낮음, 향후 분리 권장.

---

## 3) Technical Debt — Top 3 (실행 가능 로드맵)

### #1 — [P0] 신규 권역 데이터가 프로덕션에서 도달 불가 (목적지 게이트 미연결)

**증상**: `data/master_spots.csv` 497행 중 "송도" 목적지는 일부뿐이고 나머지(경주·가평·속초·부산·제주·전북 등 약 30개 권역)가 압도적 다수다. 그러나 실제 브리핑 생성 경로에서 `destination`(homeRegion) 값은 다음 두 갈래로만 결정된다:

- `lib/webapp/telegram-native.ts::resolveDestinationFromCoords()` → Songdo 경계 내부면 `"송도"`, 그 외 전부 `"인천_근교"` (고정값, 실제 위치 무관)
- `WebAppForm.tsx`에는 사용자가 목적지를 직접 고르는 UI가 전혀 없음 (`grep destination app/webapp/WebAppForm.tsx` → 좌표→`resolveDestinationFromCoords` 호출 한 곳뿐)

`passesRegionGate()`는 `place.destination === homeRegion`(또는 부분 포함) 검사이므로, `homeRegion`이 `"인천_근교"`로 고정되는 한 경주·가평·속초 등의 신규 스팟은 **영구히 풀(pool)에서 걸러지고 Joker fallback(`송도 현대프리미엄아울렛`)이 대신 채워진다.** 테스트(`__tests__/course-generator.test.ts`)도 전부 `fixtures/places.sample.json` + `FIXED_DESTINATION`만 사용해 이 갭을 검증하지 않는다.

**이미 있는 토대, 연결만 안 됨**: `supabase/migrations/20260613_destinations.sql`에 `destinations(destination_id, center_lat, center_lng, default_radius_km, ...)` 테이블이 정확히 이 문제(좌표→권역 매핑)를 풀기 위해 스캐폴딩되어 있다. 하지만:
- 0행 (시딩 안 됨)
- `resolveDestinationFromCoords()`가 이 테이블을 전혀 참조하지 않고 Songdo 경계 하드코딩만 사용
- `scripts/sync-sheets.ts`는 `destinations` 테이블 존재 여부를 **경고만** 출력 (`places.destination "X"이 destinations 테이블에 없습니다`), 적재를 막지 않음
- 신규 파이프라인 `scripts/ingest-spots.ts`(140+ 스팟 적재 주체)는 이 검증조차 호출하지 않음

**로드맵 (사령관님의 "더 많은 권역 데이터 시딩" 목표 직결)**:
1. `destinations` 테이블에 `master_spots.csv`의 고유 destination 30여 개 시딩 (center_lat/lng는 대표 좌표).
2. `resolveDestinationFromCoords()`를 Songdo 하드코딩 → `destinations` 테이블 기반 최근접 권역 탐색(`default_radius_km` 이용)으로 교체.
3. 그래도 좌표가 모든 권역을 커버 못 하므로(예: 사용자가 인천에서 "경주 여행 계획"을 미리 짜는 경우), `WebAppForm.tsx`에 **명시적 목적지 선택 UI**(또는 `app/api/course/generate`의 `destination` 파라미터를 노출하는 셀렉터)를 추가해야 함 — 좌표 기반 단독으로는 여행 계획 앱의 핵심 시나리오(현재 위치 ≠ 목적지)를 풀 수 없음.

---

### #2 — [P1] 1일 코스 / 멀티데이 코스 엔진 로직 이중화 — 가중치 변경 시 두 곳 동시 수정 필요

**증상**: `generate-briefing.ts`는 `normalized.trip_days > 1`일 때만 `course-generator.ts::generateMultiDayCourse()`를 호출한다. `trip_days <= 1`(대다수 실사용 케이스)에서는 **자체 인라인 구현**(`filterPool`/`weightedScore`/`selectPlace`/`passesRegionGate`, `generate-briefing.ts:139~457`)을 사용하며, 이는 `course-generator.ts`의 동명 함수들과 거의 동일하지만 **완전히 별도의 복붙 코드**다.

미세하지만 실질적인 차이가 이미 존재한다:
- `course-generator.ts::passesRegionGate` (line 105-115): 정확 일치 **또는 부분 포함**(`place.destination.includes(homeRegion) || homeRegion.includes(place.destination)`) 허용
- `generate-briefing.ts::passesRegionGate` (line 107-114): **정확 일치만** 허용

즉 동일한 목적지 문자열이라도 1일 코스와 2박3일 코스가 풀 필터링 기준이 다르게 동작한다. 사령관님이 향후 "엔진 가중치 강화"를 추진하면, `weightedScore()`를 두 파일에서 각각 고쳐야 하고 누락 시 1일/멀티데이 결과가 또 갈라진다.

**로드맵**:
1. `generate-briefing.ts`의 단일-블록 인라인 구현을 제거하고, `trip_days` 분기 없이 항상 `generateMultiDayCourse({ duration: 1, ... })`를 호출하도록 통합 (course-generator.ts가 이미 `duration:1`을 정상 처리함 — `clampTripDuration`).
2. 통합 전 회귀 테스트로 현재 1일 코스 출력과 통합 후 출력이 동일한지 스냅샷 비교 (behavior-preserving 보장).
3. 통합 후 `weightedScore`/`passesRegionGate`는 `course-generator.ts` 1곳에만 존재 — 향후 가중치 튜닝의 단일 진입점 확보.

---

### #3 — [P2] 이중 시딩 파이프라인의 검증 비대칭 + 미사용 API 라우트

**증상 A**: `places` 테이블에 쓰는 경로가 두 개다 — ① `scripts/sync-sheets.ts`(Google Sheets, `docs/cms-architecture.md`가 명시한 SSOT 경로, `destinations` 테이블 대조 경고 포함) ② `scripts/ingest-spots.ts`(로컬 CSV, 140+ 스팟 적재 주체, **destinations 대조 없음**). 둘 다 `scripts/lib/place-sync.ts`의 `upsertPlaces()`를 공유해 스키마 레벨 정합성은 보장되지만, "이 스팟이 어디서 왔고 어떻게 검증됐는지"의 단일 경로가 없다. `destinations` 테이블이 0행인 지금은 두 파이프라인의 검증 차이가 드러나지 않지만, #1을 해결해 `destinations`를 시딩하는 순간 `sync-sheets.ts`만 경고를 내고 `ingest-spots.ts`는 조용히 통과하는 비대칭이 실제로 발생한다.

**증상 B**: `65ad061`에서 신설된 `app/api/course/generate/route.ts`(115줄)는 코드베이스 전체에서 **호출하는 곳이 없다** (`grep -r "course/generate"` → 라우트 파일 자신뿐). 검증 스크립트 `scripts/test-multi-day-course.ts`도 이 라우트를 거치지 않고 `generateMultiDayCourse()`를 직접 호출한다. 프로덕션에 배포되는 API 엔드포인트가 사실상 미사용 상태로 떠 있다.

**로드맵**:
1. `ingest-spots.ts`에도 `sync-sheets.ts`와 동일한 `destinations` 대조 경고 로직 추가 (또는 공통 헬퍼로 양쪽에서 재사용) — 두 파이프라인의 검증 정책을 동기화.
2. `app/api/course/generate`는 ①목적지 선택 UI(§1 로드맵)의 백엔드로 정식 채택하거나, ②현재처럼 미사용이면 의도를 문서화(예: "향후 멀티 목적지 UI용 사전 스캐폴딩")하거나 제거. 현재처럼 "출처 불명 API"로 방치하지 않는 것이 중요.

---

## 4) 부가 확인 사항 (참고용, 우선순위 외)

- **app_config / destinations 실측 행수 미확인**: 2026-06-16 진단 시점엔 둘 다 0행이었고, 이후 `e7f1203`(app_config 시딩 SQL)이 커밋됐으나 라이브 Supabase에 실제 적용됐는지는 이 감사(로컬 코드 분석)로 확인 불가. 운영자가 `select count(*) from app_config`로 직접 확인 권장.
- **S3(날짜 하드코딩)·S5-A(루트 템플릿) 등 2026-06-16 진단 항목은 코드 레벨에서 해결 확인됨** — `generate-briefing.ts`가 이제 `Intl.DateTimeFormat`으로 KST 동적 날짜 생성, `app/page.tsx`는 `/webapp` 리다이렉트로 교체됨.
- **테스트 그린 상태**: 18 suites / 192 tests 전부 통과. 단, §3-1에서 지적한 "신규 권역 도달 불가" 케이스는 어떤 테스트도 커버하지 않음 — 통과율은 높지만 커버리지 사각지대가 존재.
