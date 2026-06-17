# 엘리엇 진단 리포트

> 작성: 2026-06-16 | 역할: 읽기 전용 감사자 | 코드 수정 없음

---

## 0) BLUF — 치명적 근본원인 Top 3

1. **날짜 리터럴 하드코딩** (`generate-briefing.ts:291`) — `date_label` 호출부 미전달 → 모든 브리핑이 영구적으로 `"2026년 6월 12일(금)"` 출력.
2. **app_config DB 미시딩** (Supabase `app_config` 테이블 0행) — 엔진이 코드 내장 `DEFAULT_APP_CONFIG`로 폴백; DB 기반 설정이 한 번도 적용된 적 없음.
3. **루트 페이지(`/`)가 create-next-app 기본 템플릿 그대로** — "To get started, edit the page.tsx file." Vercel/Next.js 로고·링크 노출. 의도된 프로덕션 UI 없음.

---

## 1) 증상별 근본원인 매트릭스

### S1 — HTML 하단 A/B 재선택 버튼 중복 [**High**]

| 항목 | 내용 |
|---|---|
| **재현 여부** | 확인됨 (코드 경로로 검증) |
| **근본 원인** | Telegram 챗과 HTML 브리핑 페이지 양쪽에 A/B 선택 UI가 각각 존재 |
| **발생 위치** | `lib/webhook/telegram-message.ts:27-31` (챗 링크 2개) ↔ `app/briefing/page.tsx:247-265` (`view.dual` 시 A/B 버튼) |
| **메커니즘** | `buildBriefingLinks`는 A/B 두 브리핑을 단일 URL 페이로드에 묶어 보냄. 챗에 A·B 링크 2개를 보내고, HTML 안에서도 다시 A·B 전환 버튼을 렌더링. 사용자가 동일 선택을 두 번 해야 하는 UX 중복 |
| **영향 범위** | 전체 브리핑 수신 플로우 |

**추가 맥락**: `showNav` 조건(`briefing/page.tsx:160`)은 `view.dual || view.feedbackUrl`이므로 피드백 URL만 있어도 nav 영역이 렌더링됨. 또한 HTML 내 A/B 버튼의 role은 "변경 없이 재확인"이 아니라 "이미 본 챗 선택을 재현"으로 보임.

---

### S2 — Day1/Day2 체크리스트 무의미 [**High**]

| 항목 | 내용 |
|---|---|
| **재현 여부** | 확인됨 |
| **근본 원인** | ① 체크리스트가 날짜별로 분리되지 않음 (단일 리스트 1개) ② 항목이 고정 4~5개 제네릭 값만 출력 |
| **발생 위치** | `lib/engine/generate-briefing.ts:245-247` (`resolveStrollerChecklistItems` → 항상 `[]` 반환, TODO 주석 존재) |
| **메커니즘** | `buildChecklist`가 생성하는 항목: 여권·신분증, 보조배터리 (고정), 기저귀·물티슈·아이 간식 (family 모드 고정), 우산·우비 (rain_prob ≥ 50% 시, 기본 날씨 30%이므로 미출력), 교통 안내 (하드코딩 거리 기반). 유모차·수유실 동선 항목은 코드가 비어 있음. |
| **영향 범위** | 모든 브리핑 체크리스트. "Day1/Day2 체크리스트"라는 별도 UI는 없음 — HTML은 체크리스트 1개만 렌더링 (`briefing/page.tsx:223-238`) |

**추가**: `app_config` 0행 → `rain_prob_threshold: 50` 기본값. 기본 날씨 `rain_prob: "30%"` → 우산 항목 미추가. 체크리스트는 destination·장소 데이터와 무관하게 생성됨.

---

### S3 — 날짜 2026-06-12(금) 고정 출력 [**Critical**]

| 항목 | 내용 |
|---|---|
| **재현 여부** | 확인됨 (코드 리터럴 발견) |
| **근본 원인** | `input.date_label`을 전달하는 호출부가 없음 → 폴백 리터럴 항상 사용 |
| **발생 위치** | `lib/engine/generate-briefing.ts:291` |
| **코드** | `const dateLabel = input.date_label ?? "2026년 6월 12일(금)";` |
| **호출부** | `lib/webhook/briefing-urls.ts:120-125` — `generateBriefing({ normalized, places, feedback_events, config })` — `date_label` 필드 미전달 |
| **타임존** | 코드 전체에 `new Date()` 또는 KST 변환 로직 없음. `GenerateBriefingInput.date_label`은 optional (`types.ts:157`) |
| **영향 범위** | 생성되는 모든 브리핑의 헤더 날짜. 오늘(2026-06-16 월) 기준 4일 오차 + 요일 오류 |

---

### S4 — 5시간 입력 → 2일치 플랜 출력 [**Med** (코드 위험성은 High)]

| 항목 | 내용 |
|---|---|
| **재현 여부** | 정상 경로에서 재현 불가 — 코드 분석 결과 duration=5 → 1일 출력 |
| **근본 원인 (추정)** | 사용자가 Telegram 챗의 A/B 링크 2개("A · 근거리 브리핑", "B · 원거리 브리핑")를 "Day1 / Day2 플랜"으로 오인한 가능성 높음 |
| **추적 경로** | WebApp form `duration_hours:5` → `buildTripRequest` → POST `/api/journey/submit` → `parseSubmitBody` → `normalize` (`req.duration_hours = 5`) → `buildDayPlan(config, 5, moodTags)`: `5 <= 16` → 1일차 당일 코스 반환 |

**실제 잠재 버그 (별도)**: `isTripRequest` (`lib/engine/is-trip-request.ts:6-12`)는 `start_mode`, `mood_tags`, `mode`만 검증 — `duration_hours` 부재를 허용. `duration_hours`가 누락되면 `normalize`에서 `duration = undefined`, `buildDayPlan`에서 `undefined <= 16 → false` → 멀티데이 분기 진입. 이후 `Math.ceil(undefined/24) = NaN` → `Array.from({length: NaN}) = []` → 빈 days 배열. 증상(2일)이 아닌 0일 출력이지만 유효하지 않은 브리핑이 생성됨.

---

### S5 — 테스트 목업이 프로덕션 경로 점거 [**Critical**]

| 항목 | 내용 |
|---|---|
| **재현 여부** | 확인됨 (2개 경로) |
| **근본 원인 A** | `app/page.tsx` 루트 `/`가 create-next-app 기본 템플릿 — "To get started, edit the page.tsx file." Vercel·Next.js 로고·링크 그대로 |
| **발생 위치** | `app/page.tsx:17` |
| **근본 원인 B** | `fetchBriefingData`의 fixture 폴백 경로가 서버 로그에만 표시, 사용자에게 노출 안 됨 (`lib/supabase/fetch-briefing-data.ts:79-88`). Vercel cold start 3초 타임아웃(`FETCH_TIMEOUT_MS=3_000`) 초과 시 `source:"fixture"` 데이터 서빙 |
| **fixture vs DB 차이** | fixture `places.sample.json` ID: `"p001"~"p010"` (문자열). Supabase places ID: UUID 형식. fixture 데이터가 서빙되면 `backup_place_id` 참조도 문자열 "p002" 등으로 달라짐 |
| **영향 범위** | 루트 도메인 방문자 전체 (Reason A). Cold start 발생 시 브리핑 데이터 (Reason B) |

---

## 2) 데이터 레이어 실측 결과

### Supabase 테이블별 행수 (실측, 2026-06-16)

| 테이블 | 행수 | 상태 |
|---|---|---|
| `places` | **25** | ✅ 시딩됨 |
| `destinations` | **0** | ❌ 미시딩 |
| `app_config` | **0** | ❌ 미시딩 |
| `feedback_events` | **0** | ✅ (정상 — 사용 전) |

### places 분포

| destination | 행수 | category 분포 |
|---|---|---|
| 인천_근교 | 10 | view 2, cafe 3, activity 2, meal 2, kids 1 (추정) |
| 경주 | 15 | view 3, cafe 3, activity 3, meal 3, kids 1 (추정) |
| **합계** | **25** | view 5 / cafe 6 / activity 5 / meal 5 / kids 4 |

### 시딩 상태 판정

- **places**: 실 데이터 서빙 (Supabase) — fixture 아님. 단, `tags: []` (모든 rows) / `stroller_friendly: false` (다수) / `last_social_seen: null` (전체) — 메타데이터 미충전
- **app_config**: **항상 DEFAULT_APP_CONFIG 사용** (DB 미시딩). destination 게이트는 `TripRequest.destination` 기준
- **destinations**: 0행 — 현재 destinations 테이블은 엔진이 참조하지 않으므로 기능 영향 없음
- **PENDING/APPROVED**: places 테이블에 status 컬럼 없음. destinations 테이블에 `status text default 'active'` 존재하나 0행 — 현재 사용 안 됨

### 서빙 판정
**정상 경로에서는 실 DB(places 25행) 서빙**. 단 Vercel cold start 3초 초과 또는 Supabase 장애 시 fixture(10행) 폴백으로 전환 — 전환 여부는 서버 로그로만 확인 가능.

---

## 3) 버튼·CTA 인벤토리 & 중복 판정

### 미니앱 (`/webapp`)

| # | 위치 | 텍스트 | 판정 |
|---|---|---|---|
| 1 | Telegram MainButton | "브리핑 생성" | 의도됨 |
| 2 | form 내 (비텔레그램 환경) | "브리핑 생성" | 의도됨 (dev fallback) |
| 3-4 | 시작 모드 | "고정 시각" / "가용 시간" | 의도됨 |
| 5-7 | 기분 강도 프리셋 | "매우 피곤함" / "보통" / "활기참" | 의도됨 |
| 8-13 | 기분 태그 칩 | baby_tired 등 6개 | 의도됨 |
| 14-15 | 동행 모드 | "패밀리" / "연인" | 의도됨 |

### Telegram 챗 메시지

| # | 텍스트 | 판정 |
|---|---|---|
| 16 | "A · 근거리·기본형 브리핑 보기" | 의도됨 |
| 17 | "B · 원거리·확장형 브리핑 보기" | 의도됨 |
| 18 | "여정 종료 후 피드백 남기기" | 의도됨 |

### HTML 브리핑 페이지 (`/briefing`)

| # | 텍스트 | 판정 |
|---|---|---|
| 19 | "A · 근거리·기본형 브리핑 보기" (nav button) | **중복** — #16과 동일 선택을 HTML 내에서 재수행 |
| 20 | "B · 원거리·확장형 브리핑 보기" (nav button) | **중복** — #17과 동일 |
| 21 | "여정 종료 후 피드백 남기기" (link) | 의도됨 (챗 링크 #18과 동일 목적이나 다른 위치) |

### 피드백 페이지 (`/feedback`)

| # | 텍스트 | 판정 |
|---|---|---|
| 22-26 | 만족도 1-5 버튼 | 의도됨 |
| 27-33 | 아쉬웠던 점 (7개 이유) | 의도됨 |
| 34-35 | "A안" / "B안" 선택 | 의도됨 |
| 36 | "피드백 보내기" | 의도됨 |

### 루트 페이지 (`/`)

| # | 텍스트 | 판정 |
|---|---|---|
| 37 | "Deploy Now" (Vercel 링크) | **데드** — 목업/템플릿 잔재, S5 |
| 38 | "Documentation" (Next.js 링크) | **데드** — 목업/템플릿 잔재, S5 |

### 중복/데드 요약

| 구분 | 항목 |
|---|---|
| **중복** | #19, #20 (HTML A/B 버튼 — 챗 #16, #17과 동일 선택) |
| **데드** | #37, #38 (루트 페이지 Vercel/Next.js 링크) |
| **의도됨** | 나머지 전체 |

---

## 4) 의도 vs 실제 플로우 차이 맵

```
[의도된 플로우]
/start → 봇 키보드 → "여정 만들기" → /webapp(미니앱) → 8개 질문 → 제출
→ 봇 챗 응답(원거리/근거리/리뷰 포함) → 브리핑 링크 클릭 → /briefing HTML 렌더

[실제 코드 플로우]
/start → 봇 키보드 "여정 만들기" 버튼 → /webapp 미니앱(단일 폼, 7개 입력 필드) → MainButton 클릭
→ POST /api/journey/submit → relayTripBriefing → buildBriefingLinks
  → generateBriefing [A: 근거리·기본형] + generateBriefing [B: 원거리·확장형]
    → date_label 미전달 → "2026년 6월 12일(금)" 고정
    → Supabase places 25행 OR fixture 10행 (cold start 폴백)
    → app_config 0행 → DEFAULT_APP_CONFIG
  → 챗 메시지: "A 브리핑 보기" + "B 브리핑 보기" + "피드백" 링크
→ /briefing 페이지: A or B 브리핑 렌더 + 하단 A/B 재선택 버튼 + 피드백 링크
```

### 차이 목록

| # | 의도 | 실제 | 증상 |
|---|---|---|---|
| 1 | 8개 질문(순차적 플로우) | 단일 폼 7개 입력 필드 (동시 노출) | — (UX 차이, 기능 결함은 아님) |
| 2 | 날짜는 오늘(KST) | "2026년 6월 12일(금)" 고정 | S3 |
| 3 | 챗에 선택지 후 HTML은 콘텐츠만 | 챗 A/B + HTML A/B 이중 선택 | S1 |
| 4 | 실데이터 기반 체크리스트 | 고정 4~5개 제네릭 항목 | S2 |
| 5 | duration→day-count 정상 반영 | 코드는 정상; duration_hours 검증 미흡 | S4 (잠재 위험) |
| 6 | 프로덕션 홈 화면 | create-next-app 템플릿 원본 | S5-A |
| 7 | DB 기반 app_config | 항상 DEFAULT_APP_CONFIG | — (silent 폴백) |
| 8 | 챗에 "리뷰" 포함 | 리뷰 데이터·필드 없음 | 확인 불가 (아래) |

---

## 5) 확인 불가 항목

| 항목 | 이유 |
|---|---|
| "챗 응답에 원거리/근거리/리뷰 포함" — 리뷰 부분 | `telegram-message.ts`에 리뷰(rating, review text) 필드 없음. Supabase schema에도 없음. "리뷰"가 의미하는 바를 코드에서 식별 불가 |
| Vercel cold start 시 실제 fixture 폴백 빈도 | 서버 로그 접근 불가 (진단 시점) |
| 사용자가 관찰한 "2일치 플랜"의 실제 스크린샷/페이로드 | 재현 불가 — 정상 경로에서 duration=5는 1일 출력 |
| 경주 destination 브리핑의 실제 Joker fallback 여부 | places 풀·destination 게이트 미충족 시 Joker 발동 가능하나 실시간 테스트 미수행 |
| `places.tags` 실데이터 | 샘플 5건 모두 `tags: []` — 전체 25건 동일 여부 미확인 |

---

## 6) 권장 조치 (제안만 — 우선순위순, 적용 금지)

### P0 — 즉시 (서비스 정확도 직결)

1. **날짜 동적 주입** `lib/webhook/briefing-urls.ts`의 `generateBriefing` 호출부에 `date_label: formatKstDate(new Date())` 추가. `format` 함수에서 `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' })` 사용.

2. **루트 페이지 교체** `app/page.tsx`를 엘리엇 서비스 페이지(랜딩 또는 `/webapp` 리다이렉트)로 대체.

3. **app_config DB 시딩** `app_config` 테이블에 최소 필수 키(`mood_tags`, `mood_tag_effects`, `templates`, `rain_prob_threshold`) 삽입.

### P1 — 단기 (UX 품질)

4. **HTML A/B 버튼 중복 제거** 두 가지 방안 중 선택:
   - (a) 챗에 링크 1개(기본 A)만 보내고, HTML 내 A/B 버튼으로 전환 — 선택 지점을 HTML로 통일.
   - (b) 챗 링크를 유지하고, HTML에서 variant 전환 버튼 제거 — 각 링크가 고정 variant 브리핑만 표시.

5. **체크리스트 데이터화** `resolveStrollerChecklistItems`를 place 메타데이터(`stroller_friendly`, `has_nursing_room`) 기반으로 구현. places Supabase 데이터의 `stroller_friendly`/`has_nursing_room` 값 정비 병행.

6. **`duration_hours` 검증 강화** `isTripRequest`에 `start_mode === "duration"` 시 `duration_hours`가 양수 finite 숫자인지 검사 추가.

### P2 — 중기 (안정성)

7. **Supabase timeout 연장** `FETCH_TIMEOUT_MS: 3_000` → `8_000`으로 증가 (Vercel cold start 대응). 또는 fixture 폴백 발동 시 응답 헤더/바디에 `X-Data-Source: fixture` 표시.

8. **destinations 테이블 시딩** 엔진이 현재 참조하지 않으나, 향후 destination-aware 기능 대비. 경주·인천_근교 메타데이터 삽입.

9. **tags 필드 시딩** Supabase places 25건의 `tags` 배열 충전 (예: `["유모차", "실내"]` 등). 태그 기반 필터링 활성화 전제 조건.

10. **미니앱 → "8질문" 의도 정합** 현재 구현은 단일 폼(7개 필드 동시 노출). 기획 의도가 순차적 8문항이라면 스텝 UI로 재구성 필요. (현재 WebAppForm.tsx는 단일 페이지 폼)
