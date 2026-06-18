import {
  formatBriefingFamilyTime,
  sanitizeTelegramMarkdown,
} from "@/lib/engine/format-briefing";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(url: string): string {
  return url.replace(/&/g, "&amp;");
}

export type TelegramLinkMessageParams = {
  urlA: string;
  urlB: string;
  labelA: string;
  labelB: string;
  feedbackUrl: string;
  briefingSummary?: string;
};

const COURSE_COMPARE_HINT = "💡 웹뷰에서 두 가지 코스 옵션을 비교할 수 있습니다.";

export function buildTelegramLinkMessage({
  urlA,
  feedbackUrl,
  briefingSummary,
}: TelegramLinkMessageParams): { text: string; parse_mode: "HTML" } {
  const summaryBlock = briefingSummary
    ? `<pre>${escapeHtml(briefingSummary)}</pre>`
    : "";

  const text = [
    summaryBlock,
    COURSE_COMPARE_HINT,
    `<a href="${escapeHtmlAttr(urlA)}">🔗 여정 브리핑 확인하기</a>`,
    `<a href="${escapeHtmlAttr(feedbackUrl)}">여정 종료 후 피드백 남기기</a>`,
  ]
    .filter(Boolean)
    .join("\n");

  return { text, parse_mode: "HTML" };
}
