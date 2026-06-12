import { afterEach, describe, expect, it, vi } from "vitest";
import placesFixture from "@/fixtures/places.sample.json";
import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";
import { fetchBriefingData } from "@/lib/supabase/fetch-briefing-data";
import * as serverModule from "@/lib/supabase/server";

describe("fetchBriefingData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Supabase 미설정 시 fixtures로 fallback하고 source=fixture", async () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const data = await fetchBriefingData();

    expect(data.places).toEqual(placesFixture);
    expect(data.feedback_events).toEqual([]);
    expect(data.config).toEqual(DEFAULT_APP_CONFIG);
    expect(data.source).toBe("fixture");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toContain("fixture fallback");

    if (originalUrl !== undefined) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }
    if (originalKey !== undefined) {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    }
  });

  it("places 0행 → source==='fixture' + warn 1회", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mockClient = {
      from: (_table: string) => ({
        select: (_fields?: string) =>
          Promise.resolve({ data: [], error: null }),
      }),
    };
    vi.spyOn(serverModule, "createServerSupabaseClient").mockReturnValue(
      mockClient as ReturnType<typeof serverModule.createServerSupabaseClient>,
    );

    const data = await fetchBriefingData();

    expect(data.source).toBe("fixture");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toContain("fixture fallback");
  });
});
