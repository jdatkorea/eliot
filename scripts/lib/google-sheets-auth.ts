/**
 * Google Sheets API 인증 — SEED 전용.
 * `GOOGLE_SERVICE_ACCOUNT_KEY`(JSON) 또는
 * `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` 조합을 지원한다.
 */
export function parseGoogleServiceAccountCredentials(): Record<string, unknown> {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim();
  if (rawJson) {
    try {
      return JSON.parse(rawJson) as Record<string, unknown>;
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY JSON 파싱에 실패했습니다.");
    }
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.trim();
  if (email && privateKey) {
    if (privateKey.includes("...")) {
      throw new Error(
        "GOOGLE_PRIVATE_KEY가 플레이스홀더(...) 상태입니다. 서비스 계정 JSON의 전체 private_key를 .env.local에 붙여넣으세요.",
      );
    }
    return {
      type: "service_account",
      client_email: email,
      private_key: privateKey.replace(/\\n/g, "\n"),
    };
  }

  throw new Error(
    "Google 서비스 계정 인증 정보가 없습니다. GOOGLE_SERVICE_ACCOUNT_KEY 또는 GOOGLE_SERVICE_ACCOUNT_EMAIL+GOOGLE_PRIVATE_KEY를 .env.local에 설정하세요.",
  );
}

export function resolveSpreadsheetId(): string {
  const id =
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ||
    process.env.GOOGLE_SHEET_ID?.trim();
  if (!id) {
    throw new Error(
      "GOOGLE_SHEETS_SPREADSHEET_ID(또는 GOOGLE_SHEET_ID)가 .env.local에 없습니다.",
    );
  }
  return id;
}

export function hasGoogleSheetsEnv(): boolean {
  const hasAuth = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim() ||
      (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
        process.env.GOOGLE_PRIVATE_KEY?.trim()),
  );
  const hasSheet = Boolean(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ||
      process.env.GOOGLE_SHEET_ID?.trim(),
  );
  return hasAuth && hasSheet;
}
