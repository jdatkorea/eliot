import type { FailureReason } from "@/lib/engine/types";

export const FAILURE_REASONS: readonly FailureReason[] = [
  "timing",
  "food",
  "kids",
  "mood",
  "weather",
  "other",
  "none",
] as const;

export const FAILURE_REASON_LABELS: Record<FailureReason, string> = {
  timing: "시간·동선",
  food: "음식",
  kids: "아이 동선",
  mood: "분위기",
  weather: "날씨",
  other: "기타",
  none: "특별히 없음",
};

export type FeedbackFormInput = {
  satisfaction: number | null;
  failure_reason: FailureReason | null;
  note: string;
};

export type FeedbackFormErrors = {
  satisfaction?: string;
  failure_reason?: string;
};

export function validateFeedbackForm(
  input: FeedbackFormInput,
): FeedbackFormErrors {
  const errors: FeedbackFormErrors = {};

  if (
    input.satisfaction === null ||
    input.satisfaction < 1 ||
    input.satisfaction > 5
  ) {
    errors.satisfaction = "만족도를 1~5 중에서 선택해 주세요.";
  }

  if (
    input.failure_reason === null ||
    !FAILURE_REASONS.includes(input.failure_reason)
  ) {
    errors.failure_reason = "불만족 사유를 선택해 주세요.";
  }

  return errors;
}

export function hasValidationErrors(errors: FeedbackFormErrors): boolean {
  return Object.keys(errors).length > 0;
}
