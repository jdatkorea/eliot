[AUTONOMOUS RUN — CODEBASE LEANING & CONFORMANCE]

너는 이 세션을 자율 진행한다. 사소한 작업(파일 읽기/편집, 로컬 git add·commit, targeted test)은
묻지 말고 바로 해라. 아래 [HARD STOP]·[CHECKPOINT]에서만 멈춘다. 그 외엔 멈추지 않는다.

═══════════════════════════════
MISSION
═══════════════════════════════
행위를 바꾸지 않고 코드베이스를 lean하게 만든다. 먼저 측정 가능한 코드 표준(rubric)을 세우고,
그 표준에 코드를 정합시킨다. 같은 동작, 더 깨끗한 형태.
목표: nice and tidy · no redundant · 어디서 어디로 연결되는지 한눈에. 단순한 앱이지만 완성도 있게.

═══════════════════════════════
GOLDEN RULE — 리팩터 안전 모델 (최우선)
═══════════════════════════════
1. 행위 보존(behavior-preserving). 리팩터는 형태만 바꾼다. 동작이 바뀌면 그건 리팩터가 아니다 → STOP.
2. 테스트가 계약이다. 모든 변경 전후로 관련 테스트 GREEN. 테스트가 깨지면 그 리팩터가 틀린 것.
3. STEP 0의 baseline 커밋이 안전망. 모든 정리는 atomic commit으로 — 무엇이든 되돌릴 수 있게.
4. "가차없이 삭제"는 노이즈(죽은 코드·중복 주석·미사용 import)에만. load-bearing 코드엔 외과적으로.

═══════════════════════════════
SCOPE FENCE
═══════════════════════════════
IN-SCOPE: 전 코드베이스 정리 — naming, 주석, dead code, 중복, 파일 구조, import 정리.
PROTECTED (정리는 하되 로직·시그니처·동작 불변):
  lib/engine/** 의 동작·순수성 / 모든 public 함수 시그니처 / 테스트가 검증하는 행위.
OUT-OF-SCOPE (금지): 기능 추가·변경, 의존성 추가·교체, 런타임 외부 API, DB 마이그레이션, 배포, git push.

═══════════════════════════════
[HARD STOP] — 멈추고 보고
═══════════════════════════════
1. 테스트가 깨지는데 "테스트가 틀렸다"는 판단이 들면 → STOP. 테스트는 행위 계약이라 함부로 안 고친다.
2. 행위를 바꿔야만 더 lean해지는 경우 → 실행 말고 [CHECKPOINT]에 제안만.
3. 삭제 대상의 non-use 증명이 안 되면 → STOP. 증명 = grep 0-ref AND 동적참조 없음 AND public API 아님.
4. ⚠️ 프레임워크 관례 파일은 import-grep만으로 절대 "죽은 코드" 판정 금지:
   - Next.js app/**/route.ts·page.tsx·layout.tsx (파일경로 라우팅으로 사용됨, import 0이 정상)
   - supabase/migrations/**, *.config.*, 이름으로 호출되는 scripts/**, fixtures/**
   이들은 삭제·이동 대상에서 제외(또는 STOP).
5. lib/engine 순수성/시그니처 변경 필요 → STOP.
6. 의존성 추가·제거, push, 배포, 마이그레이션 → 금지.

═══════════════════════════════
UNIT ECONOMICS (폭주·과금 방지)
═══════════════════════════════
- 3-strike: 같은 테스트/에러 3회 실패 시 thrash 금지 — 멈추고 [원인 1줄 → 막힌 지점] 보고.
- targeted test 중간, 풀스위트(vitest)는 각 STEP 종료 시 1회만.
- 이건 cleanup이지 rewrite 아님. "온 김에 기능 개선" 금지.
- 과도 추상화 제거 OK. 새 추상화 도입은 보수적 — indirection만 늘리는 추상화 금지.

═══════════════════════════════
TASKS (순차, 각 STEP 끝 atomic commit)
═══════════════════════════════
STEP 0 — Baseline & 척도 수립
  - 풀스위트 GREEN 확인 → "chore: baseline before leaning" 커밋(안전망).
  - 코드베이스 스캔 후 CONVENTIONS.md 작성 (1페이지, 측정 가능 기준):
    · naming 규칙 · 파일/모듈 배치 원칙
    · 주석 정책: WHY만(WHAT 재진술 금지), commented-out 코드 0, 모듈 상단 docblock = [역할 + 입력/출력 + 파이프라인 위치 1줄]
    · 함수 크기/단일책임 가이드 · import 규율(미사용 0, 정렬)
    · error 처리 패턴 통일
    · 아키텍처 불변식(빌드문서 §2.2: 런타임 외부 API 0 / engine 순수 / 무상태 / read2-write1 등)을 enforced rule로 명문화
  - 정리 인벤토리 출력: 파일별 hotspot(dead code/중복/스파게티/주석노이즈)와 처리 방침.

STEP 1 — Dead code & 중복 제거 (proof-gated)
  - 미사용 export/file/import/var: non-use 증명 후 삭제. commented-out 블록 전부 삭제. noise/stale TODO 주석 삭제.
  - 중복 로직 통합(예: journey/submit ↔ webhook 양 경로 공통부, 타입가드 등). 동작 동일 보장, 테스트 GREEN.

STEP 2 — 주석 정합화 (중구난방 → 일관)
  - 전 주석을 CONVENTIONS.md 정책에 맞춤: WHAT 재진술 삭제, WHY/비자명 결정만 유지.
  - 각 모듈 파일 상단 docblock 부여(역할 + 입출력 + 파이프라인 위치). 포맷 통일.

STEP 3 — 구조/네이밍 정합화 (나라시 평탄화)
  - 과분할 1-함수 파일 병합 / 비대 파일 분리. 단 동작·시그니처 불변, import 경로 변경 시 전수 갱신 + 테스트 GREEN.
  - 네이밍 컨벤션 통일. (PROTECTED·관례파일 규칙 준수)

STEP 4 — 핵심 기능 lean 검토 (행위 보존)
  - normalize/generateBriefing/deliverTripBriefing 등 핵심 함수의 lean 여지 검토.
  - 행위 보존 범위의 단순화만 실행. 행위가 바뀌어야 하는 "개선"은 실행하지 말고 [CHECKPOINT]에 제안.

STEP 5 — 검증 & 정합 리포트
  - 풀스위트 GREEN. 불변식 재확인: `rg "fetch\(|await " lib/engine/` 0건.
  - CONVENTIONS.md 대비 conformance 체크리스트(각 기준 충족 Y/N).
  - dataflow 1장(텍스트): 어디서 어디로 연결되는지. 빌드문서 §2.1 파이프라인과 일치 여부.

═══════════════════════════════
[CHECKPOINT] — 모아서 한 번에
═══════════════════════════════
  - 행위를 바꿔야만 더 lean해지는 제안(STEP 4)
  - non-use 증명 안 되는데 죽은 것 같은 코드
  - 테스트가 의심스러운 행위를 검증하는 경우
이외엔 자율 진행. 발생 시 한 메시지로 묶어 제시하고 나머지 작업은 계속.

═══════════════════════════════
FINAL REPORT
═══════════════════════════════
BLUF + 표:
  - 삭제 목록(각 non-use 증명 1줄) / 통합·이동 목록 / 주석 before→after 수
  - 풀스위트 결과 / 불변식 grep 결과 / CONVENTIONS.md 대비 conformance
  - 남은 행위-변경 제안(승인 대기)
사과·서론 금지.
