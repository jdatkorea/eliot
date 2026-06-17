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

export function buildTelegramLinkMessage({
  urlA,
  urlB,
  labelA,
  labelB,
  feedbackUrl,
  briefingSummary,
}: TelegramLinkMessageParams): { text: string; parse_mode: "HTML" } {
  const summaryBlock = briefingSummary
    ? `<pre>${escapeHtml(briefingSummary)}</pre>`
    : "";

  const text = [
    summaryBlock,
    `<a href="${escapeHtmlAttr(urlA)}">A · ${escapeHtml(labelA)} 브리핑 보기</a>`,
    `<a href="${escapeHtmlAttr(urlB)}">B · ${escapeHtml(labelB)} 브리핑 보기</a>`,
    `<a href="${escapeHtmlAttr(feedbackUrl)}">여정 종료 후 피드백 남기기</a>`,
  ]
    .filter(Boolean)
    .join("\n");

  return { text, parse_mode: "HTML" };
}
