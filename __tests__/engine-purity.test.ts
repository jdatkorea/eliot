import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * INVARIANT 최종 정리(2026-06-18): trip-context.ts의 getFeedback() await가
 * lib/engine/ 디렉토리 경계를 위반하던 마지막 사례였다 — 호출부
 * (lib/webapp/submit-trip-request.ts)가 이미 엔진 호출 *이전에* IO를
 * resolve해 순수 데이터만 넘기고 있었으므로, resolvePriorFeedback() 자체를
 * lib/webapp/feedback-storage.ts로 옮겨 경계를 실제로 맞췄다.
 *
 * 이 테스트는 `rg "fetch\(|await " lib/engine/` 0건을 영구 가드로 고정한다 —
 * 외부 rg 바이너리에 의존하지 않고 Node fs로 직접 스캔해 CI 어디서나 동일하게
 * 동작한다. 06-17 감사가 "0건"을 잘못 확정했던 사고(미검증을 확정으로 굳힘)를
 * 반복하지 않기 위해, 매 테스트 실행마다 실제로 재스캔한다(recall 아님).
 */
function walkTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...walkTsFiles(fullPath));
    } else if (entry.endsWith(".ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("lib/engine/ 순수성 경계 — INVARIANT 영구 가드", () => {
  it("[regression] fetch(/await 매치가 0건이어야 한다 (rg \"fetch\\(|await \" lib/engine/와 동등)", () => {
    const engineDir = join(process.cwd(), "lib", "engine");
    const files = walkTsFiles(engineDir);
    const violations: { file: string; line: number; text: string }[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      content.split("\n").forEach((line, idx) => {
        if (/fetch\(|await /.test(line)) {
          violations.push({ file, line: idx + 1, text: line.trim() });
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
