---
name: review-validate
description: >-
  Validates and classifies code review comments as Critical, Major, Minor, or
  Invalid against the actual codebase. Use when the user asks to validate,
  triage, or classify a code review comment, PR review feedback, or reviewer
  suggestion, or runs /review-validate.
---

# Review Validate

코드 리뷰 코멘트가 타당한지 검증하고 심각도를 분류한다.

## When to use

- 사용자가 리뷰 코멘트·PR 피드백·리뷰어 제안의 타당성을 묻는 경우
- `/review-validate` 실행
- "이 리뷰 반영해야 해?", "리뷰 코멘트 분류해줘" 등의 요청

## Classification (verbatim)

사용자가 코드 리뷰 코멘트를 입력하면 다음 중 하나로 분류해줘

- **Critical**: 리뷰가 타당하며, 즉시 수정하지 않으면 장애/보안/데이터 손실로 이어질 수 있는 이슈
- **Major**: 리뷰가 타당하며, 기능적 문제나 유지보수성 저하로 이어질 수 있는 중요한 수정 사항
- **Minor**: 리뷰가 타당하지만, 개선을 권장하는 수준의 수정 사항 (가독성, 컨벤션 등)
- **Invalid**: 리뷰가 부정확하거나 과도하며, 현재 코드 기준에서는 수정이 필요 없거나 맥락을 잘못 이해한 코멘트

## Workflow

### 1. Collect inputs

필수:
- 리뷰 코멘트 원문

가능하면 함께 수집:
- 대상 파일 경로·라인 번호
- 관련 PR/브랜치
- 사용자가 제공한 추가 맥락

입력이 부족하면 **한 번만** 짧게 묻는다. 파일·라인이 없어도 리뷰 텍스트만으로 추론 가능하면 진행한다.

### 2. Launch subagent

`generalPurpose` 서브에이전트를 **정확히 1개** 실행한다.

- `readonly: true`
- `run_in_background: false` (명시적 요청이 없는 한)
- `description: "Review Validate"`

프롬프트 형식:

```text
Full Repository Path: <absolute repository path>
Review Comment: <verbatim review comment>
Target: <file:line or "infer from comment">
Additional Context: <only when user provided extra context>
```

`Target`이 없으면 리뷰 코멘트와 저장소에서 관련 코드를 스스로 찾는다.

### 3. Subagent instructions (include in prompt)

서브에이전트에 아래 지시를 포함한다.

1. 리뷰가 가리키는 코드를 읽고, 호출 경로·테스트·주변 맥락을 확인한다.
2. 리뷰 주장이 **현재 코드 기준**에서 사실인지 검증한다.
3. 위 4단계 분류 기준에 따라 **하나만** 선택한다.
4. 근거는 코드 사실에 기반한다. 추측은 "추정"으로 표시한다.
5. 수정이 필요하면 최소한의 구체적 제안을 1~2문장으로 적는다. `Invalid`이면 왜 틀렸는지 명시한다.

분류 우선순위 (동시에 해당할 때):
`Critical` > `Major` > `Minor` > `Invalid`

### 4. Summarize result

서브에이전트 완료 후 아래 형식으로 요약한다.

```markdown
## 분류: <Critical | Major | Minor | Invalid>

**리뷰 요지:** <한 줄>

**판단 근거:**
- <코드·맥락 기반 bullet 2~4개>

**권장 조치:** <반영 / 선택적 반영 / 반영 불필요 + 이유>
```

여러 코멘트가 한 번에 오면 코멘트마다 위 블록을 반복한다.

## Rules

- 코드를 읽기 전에 분류하지 않는다.
- 리뷰어 톤·정치적 요소는 무시하고 기술적 타당성만 판단한다.
- `Invalid`는 리뷰가 틀렸거나 과도할 때만 사용한다. 단순히 우선순위가 낮은 타당한 리뷰는 `Minor`다.
- 수정·리팩터링은 사용자가 명시적으로 요청할 때만 수행한다.

## Examples

상세 분류 예시는 [examples.md](examples.md)를 참고한다.
