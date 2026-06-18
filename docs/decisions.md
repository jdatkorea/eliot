# Project Eliot — Architecture Decision Records (누적)

> 의사결정은 날짜 역순이 아닌 **시간순 누적**이다. 상세 실측·일지는 `docs/2026-06-18 연구개발일지 part *.md` 참조.

---

### [R&D-ADR] 2026-06-18: Zero-Noise UX — Telegram 단일 진입 링크·브리핑 뷰 아코디언 스왑으로 전달·조작 계층 분리

- **[Trigger]**: part B에서 DB id-row 전환으로 Telegram 메시지 길이는 4,326→724자로 줄었으나, 봇은 여전히 A/B **두 개의 인라인 링크**를 보내고 웹뷰는 상단 **A/B 탭 + 항상 노출된 스왑 버튼**으로 시각적 노이즈가 남아 있었다. day-trip 엔진 freeze 직후, ingest-time Validator보다 **전달·표현 계층의 인지 부하**가 더 즉각적인 UX 결함으로 부상.

- **[Decision]**:
  - **Telegram**: `buildTelegramLinkMessage()` — `urlA` 단일 `<a>` + `COURSE_COMPARE_HINT`만 사용자 대면 전송. `buildBriefingLinks()`·`relay-briefing.ts`는 A/B URL을 계속 생성(웹뷰 variant·내부 테스트)하되 메시지 포맷터에서 B 링크 제거.
  - **BriefingView**: A/B 탭 → **드롭다운** (`variantMenuOpen`, `history.replaceState`). 스왑 → **아코디언** (`expandedBlockKey`, 블록 탭 시에만 "다른 곳으로").
  - **공통 UI**: `components/ui/Button.tsx`, `Card.tsx`, `cn.ts` 추출 — `WebAppForm`·`feedback/page.tsx` 정리.
  - **TMA 캐시**: `buildBriefingUrl()`에 `&_ts=${Date.now()}` cache-bust (배포 후 구 UI 잔존 이슈 대응).
  - **엔진·API**: `/api/course/swap`, `saveBriefingPayload`, `buildBriefingLinks` **무변경**.

- **[Rationale]**: Telegram에서 B 링크를 제거해도 dual payload는 DB 1행에 그대로 있고, 웹뷰 드롭다운이 variant 전환을 담당하므로 기능 회귀 없음. 링크 2개 유지 대안은 길이만 줄일 뿐 "비교는 웹뷰에서"라는 단일 멘탈 모델을 깨뜨려 기각. 스왑 상시 노출 대안은 모바일에서 블록당 버튼 4~8개가 점유해 기각 — 아코디언은 동일 swap API를 **progressive disclosure**로만 노출.

> **💡 재사용 추출 포인트 (Cross-Domain Pattern)**: 듀얼 옵션을 지원할 때 **선택 UI는 페이로드를 소유한 계층(웹뷰)에만** 두고, 상위 채널(메시징·푸시)은 단일 진입점 + 짧은 안내만 남긴다. 백엔드·데이터 계약이 동결된 상태에서는 **표현 레이어(Presentation Layer)만** 손대는 것이 회귀 반경을 최소화한다.

- **[System Invariants]**:
  - 외부 API Zero (`lib/engine/`): **Pass** — `fetch`/`await` **0건** (grep + `engine-purity.test.ts`, 2026-06-18 19:06 KST 재실측).
  - 상태 국소화: **Pass** — variant·아코디언·스왑 UI 상태는 `BriefingView` 로컬 `useState`; 서버는 id-row read만.
  - 빌드·테스트: `npm run build` **성공** (Next.js 16.2.9) · `vitest run` **21 suites / 233 tests 통과**.

- **[Next Action]**: **ingest-time Validator** — freeze·UX 정리 이후 데이터 위생을 1회성(T0)에서 상시 방어로 전환. `lib/seed/validate-places.ts`(Sheets)와 `scripts/ingest-spots.ts`(Python ingest) 양쪽에 비-장소·죽은 destination 클래스 하드 리젝트 통일.
