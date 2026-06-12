import { describe, expect, it } from "vitest";
import {
  hasValidationErrors,
  validateFeedbackForm,
} from "@/lib/feedback/validate";

describe("validateFeedbackForm", () => {
  it("satisfaction·failure_reason 모두 유효하면 에러 없음", () => {
    const errors = validateFeedbackForm({
      satisfaction: 4,
      failure_reason: "timing",
      note: "",
    });

    expect(errors).toEqual({});
    expect(hasValidationErrors(errors)).toBe(false);
  });

  it("failure_reason 누락 시 검증 에러", () => {
    const errors = validateFeedbackForm({
      satisfaction: 3,
      failure_reason: null,
      note: "",
    });

    expect(errors.failure_reason).toBeTruthy();
    expect(hasValidationErrors(errors)).toBe(true);
  });

  it("satisfaction 누락 시 검증 에러", () => {
    const errors = validateFeedbackForm({
      satisfaction: null,
      failure_reason: "none",
      note: "",
    });

    expect(errors.satisfaction).toBeTruthy();
    expect(hasValidationErrors(errors)).toBe(true);
  });
});
