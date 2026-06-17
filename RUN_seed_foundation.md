[AUTONOMOUS RUN — SEED DATA FOUNDATION]

너는 이 세션을 자율 진행한다. 사소한 작업(파일 읽기/열기/편집/생성, 로컬 git add·commit,
targeted test 실행)은 묻지 말고 바로 해라. 아래 [HARD STOP]에 걸릴 때, 그리고 [CHECKPOINT]
조건일 때만 멈춘다. 그 외엔 멈추지 않는다.

═══════════════════════════════
MISSION
═══════════════════════════════
ELIOT의 SEED 데이터 기반을 2-레이어 소싱 구조로 재편한다.
- Layer A (canonical): 공공 관광 오픈데이터 CSV → places base (좌표·카테고리·영업시간)
- Layer B (selection/tags): 기존 소셜 큐레이션 경로 유지 (이번 런에서 코드 변경 X)
그리고 destinations 시트/테이블 추가 + tags 분류 정리 + 값싼 릴리즈 블로커(B1~B4) 해소.

═══════════════════════════════
SCOPE FENCE
═══════════════════════════════
IN-SCOPE (이것만 건드린다):
  supabase/migrations/**, lib/seed/**, scripts/**, lib/config/**,
  lib/engine/types.ts (타입 추가만), fixtures/**, __tests__/**
OUT-OF-SCOPE (절대 건드리지 마라):
  lib/engine/** 의 로직·순수성, app/** 런타임, lib/webhook/**, lib/supabase/fetch-briefing-data.ts

═══════════════════════════════
[HARD STOP] — 아래는 하지 말고 멈춰서 보고
═══════════════════════════════
1. lib/engine/** 에 fetch/async/외부 IO 추가가 필요해지면 → 즉시 STOP. (순수성 불변식)
2. 런타임 경로(app/**, webhook)에 외부 API 호출 추가가 필요해지면 → STOP.
3. 라이브 Supabase에 마이그레이션 적용(db push), git push, Vercel 배포, setWebhook → 절대 금지. 전부 operator 수동.
4. 라이브 외부 API 호출(관광데이터 API 포함) → 이번 런 금지. Layer A는 로컬 CSV만 읽는다.
5. fixtures/ 또는 데이터 파일 삭제 → 목록 먼저 출력하고 STOP.
6. 신규 heavy 의존성 설치 → STOP하고 1줄 사유 + 대안 제시. 기존 라이브러리/stdlib 우선.

═══════════════════════════════
UNIT ECONOMICS (비용 폭주 방지)
═══════════════════════════════
- 3-strike: 같은 에러/실패 테스트에 3회 시도 실패하면 thrashing 금지 — 멈추고 [원인 1줄 → 막힌 지점] 보고.
- 반복 중엔 targeted test만 (해당 파일). 풀스위트(vitest)는 각 STEP 종료 시 1회만.
- scope 밖 "온 김에 리팩터" 금지. speculative 개선 금지.
- 같은 큰 파일 반복 재read 금지 — 한 번 파악하면 기억해서 진행.

═══════════════════════════════
TASKS (순차, 각 STEP 끝나면 로컬 commit 1개)
═══════════════════════════════
STEP 0 — Baseline 격리
  - git status로 미커밋 작업 확인 → 현재 상태를 "chore: baseline before seed-foundation" 로컬 커밋(격리용).
  - lib/seed/validate-places.ts의 PLACE_SHEET_HEADERS 배열 순서를 출력하고, 시트 컬럼
    (…, notes(N), tags(O), status(P)) 인덱스와 1:1 대조. 불일치 시 → [CHECKPOINT].

STEP 1 — destinations 테이블
  - supabase/migrations/ 에 신규 마이그레이션: destinations(destination_id, name, center_lat,
    center_lng, default_radius_km, home_drive_min, season_note, status).
  - RLS 정책은 멱등(`drop policy if exists` 선행 — B3 패턴). anon SELECT 허용.

STEP 2 — places 스키마 정리 (tags 분류)
  - 마이그레이션(멱등): places에 boolean 컬럼 stroller_friendly, has_nursing_room 추가
    (default false). family-constraint를 tags에서 컬럼으로 승격.
  - places.destination 값이 destinations에 존재하는지 검증하는 로직을 sync에 추가(없으면 silent drop 방지, 경고 출력).

STEP 3 — tags 컨트롤드 보캐뷸러리
  - lib/config/ 에 tag vocabulary 상수 정의(시트 아님 — 단일사용자 defer 결정). vibe/preference 축만 허용.
  - validate-places.ts: tags 파싱 시 (a) family-constraint 토큰(유모차친화/수유실완비 등)→ boolean 컬럼 매핑,
    (b) operational 토큰(웨이팅 등)→ drop, (c) 나머지→ vocab 화이트리스트 검증.

STEP 4 — Layer A importer (로컬 CSV, 오프라인)
  - scripts/import-tour-data.ts: data/tour-source/<region>.csv 를 읽어 places base로 매핑.
    CSV 컬럼→places 컬럼 매핑이 모호하면 → [CHECKPOINT] (실제 CSV 헤더 보고 제안).
  - dry-run 기본(SYNC_EXECUTE 없으면 파일/리포트만, DB write X). 라이브 API 호출 없음.

STEP 5 — Freshness flag
  - Layer A에 존재하지만 최근 사회적 언급 신호 없는 장소를 "폐기 후보"로 플래그하는 리포트
    (last_verified 기준, 없으면 last_social_seen 필드 최소 추가). 자동 삭제 금지 — 리포트만.

STEP 6 — 값싼 릴리즈 블로커 (코드 안에서 끝나는 것만)
  - B1: places=[] 일 때 throw (빈 Safe Pool 사일런트 통과 차단).
  - B2: radius cap 충돌 시 min() 최보수값 채택 + 조합 테스트.
  - B4: scripts/verify-anon-read.ts 를 places뿐 아니라 feedback_events·app_config 3테이블로 확장.

STEP 7 — 검증
  - 신규 로직 단위테스트 작성. 풀스위트 vitest GREEN 확인.
  - 불변식 재확인: `rg "fetch\(|await " lib/engine/` 결과 0건인지(순수성), 런타임 외부 API 0건.

═══════════════════════════════
[CHECKPOINT] — 한 번에 모아서 묻는다 (드립 금지)
═══════════════════════════════
멈춰서 물어야 할 진짜 결정:
  - PLACE_SHEET_HEADERS 순서 불일치(STEP 0)
  - 이미 시딩된 데이터를 재시딩해야 하는 스키마 변경
  - 공공데이터 CSV 컬럼 매핑 모호(STEP 4)
이외엔 자율 진행. 발생 시 한 메시지에 묶어서 제시하고 그 외 작업은 계속 진행해라.

═══════════════════════════════
FINAL REPORT
═══════════════════════════════
종료 시: STEP별 [완료/CHECKPOINT대기/STOP] 표 + 생성/수정 파일 + 풀스위트 결과 + 다음 operator 수동 액션(마이그레이션 적용·커밋 push 등) 1줄씩.
사과·서론 금지. BLUF.
