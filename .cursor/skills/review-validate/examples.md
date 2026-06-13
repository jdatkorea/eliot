# Review Validate — Classification Examples

## Critical

**리뷰:** "이 SQL은 사용자 입력을 그대로 concat하고 있어요."

**코드:** `db.query(\`SELECT * FROM users WHERE id = ${req.params.id}\`)`

**분류:** Critical — SQL injection, 인증 우회·데이터 유출 가능.

---

**리뷰:** "await 없이 Promise를 반환해서 에러가 삼켜집니다."

**코드:** 웹훅 핸들러에서 `processPayment()`를 await 없이 호출, 실패 시 200 OK 반환.

**분류:** Critical — 결제/주문 상태 불일치, 운영 장애로 이어질 수 있음.

## Major

**리뷰:** "이 분기에서 null일 때 NPE가 납니다."

**코드:** `user.profile.name` 접근 전 null 체크 없음, 실제 런타임 경로에서 `profile`이 optional.

**분류:** Major — 특정 입력에서 500/기능 실패.

---

**리뷰:** "비즈니스 로직이 API route에 있어 테스트하기 어렵습니다."

**코드:** 200줄 이상의 조건 분기가 `route.ts`에 직접 존재, 동일 로직 단위 테스트 없음.

**분류:** Major — 기능 버그는 아니나 유지보수·회귀 위험 큼.

## Minor

**리뷰:** "변수명 `data`보다 `briefingPayload`가 낫겠습니다."

**코드:** 동작은 정상, 스코프가 좁고 타입이 명확함.

**분류:** Minor — 가독성 개선 권장.

---

**리뷰:** "import 순서를 프로젝트 컨벤션에 맞춰 주세요."

**코드:** 기능·보안 이슈 없음.

**분류:** Minor — 컨벤션 정리.

## Invalid

**리뷰:** "여기서 반드시 Redis 캐시를 써야 합니다."

**코드:** TRIP-PREP 단계에서 Supabase만 읽는 불변식이 문서·아키텍처에 명시됨.

**분류:** Invalid — 프로젝트 맥락·요구사항을 잘못 이해한 코멘트.

---

**리뷰:** "`generateBriefing`이 async여야 합니다."

**코드:** 함수가 순수 동기 함수로 설계되어 있고, 호출부도 동기적으로 사용 중.

**분류:** Invalid — 현재 설계 의도와 맞지 않는 과도한 제안.

---

**리뷰:** "이미 위에서 null 체크했는데 여기서 또 해야 합니다."

**코드:** 상단 guard clause로 이미 동일 조건 처리됨.

**분류:** Invalid — 중복 지적, 수정 불필요.
