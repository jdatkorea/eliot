import type { Block, Briefing } from "./types";

export type BriefingContextLine = {
  label: string;
  value: string;
};

export const BRIEFING_HEADER_TITLE = "여정 명세서 · 패밀리타임";
export const BRIEFING_CHECKLIST_HEADING = "체크리스트";

function flattenLine(text: string): string {
  return text.replace(/\t/g, " ").replace(/[ \u00a0]+/g, " ").trim();
}

function joinLines(lines: string[]): string {
  return lines.map(flattenLine).filter(Boolean).join("\n");
}

export function formatDestinationLabel(destination: string): string {
  return destination.replace(/_/g, " ");
}

export function getBriefingContextLines(briefing: Briefing): BriefingContextLine[] {
  const ctx = briefing.context_meta;
  if (ctx) {
    return [
      { label: "작전 시간", value: ctx.operation_time },
      { label: "베이스캠프", value: ctx.base_camp },
      ...(ctx.weather_text
        ? [{ label: "날씨", value: ctx.weather_text }]
        : []),
      ...(ctx.energy_level !== undefined
        ? [{ label: "에너지 활성화도", value: `${ctx.energy_level}%` }]
        : []),
      ...(ctx.sunset_time ? [{ label: "일몰", value: ctx.sunset_time }] : []),
      ...(ctx.constraints ? [{ label: "제약", value: ctx.constraints }] : []),
    ];
  }

  return [
    {
      label: "날씨",
      value: `${briefing.weather.summary}, ${briefing.weather.temp}, 강수 ${briefing.weather.rain_prob}`,
    },
  ];
}

export function formatContextLine(line: BriefingContextLine): string {
  return `${line.label}: ${line.value}`;
}

export function formatBlockLine(block: Block): string {
  const note = block.weather_note ? ` (${block.weather_note})` : "";
  return `${block.time_label} · ${block.title} — ${block.desc}${note}`;
}

export function formatBriefingFamilyTime(
  briefing: Briefing,
  variantLabel?: string,
): string {
  const header = [
    BRIEFING_HEADER_TITLE,
    flattenLine(
      `${briefing.date_label} · ${formatDestinationLabel(briefing.destination)}`,
    ),
    variantLabel ? `코스: ${variantLabel}` : "",
  ];

  const contextLines = getBriefingContextLines(briefing).map(formatContextLine);

  const courseLines = briefing.days.flatMap((day) => [
    `— ${day.title} —`,
    ...day.blocks.map(formatBlockLine),
  ]);

  const checklistLine = briefing.checklist.length
    ? `— ${BRIEFING_CHECKLIST_HEADING} —\n${briefing.checklist.join(" / ")}`
    : "";

  return joinLines([
    ...header,
    "",
    ...contextLines,
    "",
    ...courseLines,
    "",
    checklistLine,
  ]);
}

export function sanitizeTelegramMarkdown(text: string): string {
  return text
    .split("\n")
    .map((line) => flattenLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
