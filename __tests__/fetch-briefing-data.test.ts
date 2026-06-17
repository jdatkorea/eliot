import { afterEach, describe, expect, it, vi } from "vitest";
import placesFixture from "@/fixtures/places.sample.json";
import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config";
import { fetchBriefingData } from "@/lib/supabase/fetch-briefing-data";
import * as serverModule from "@/lib/supabase/server";

function createSupabaseMock(options: {
  places?: unknown[];
  metadata?: {
    feedback_events?: unknown[];
    app_config?: { key: string; value: unknown }[];
  };
  placesError?: Error | null;
  metadataError?: Error | null;
}) {
  const from = vi.fn(() => ({
    select: vi.fn(() =>
      Promise.resolve({
        data: options.places ?? [],
        error: options.placesError ?? null,
      }),
    ),
  }));
  const rpc = vi.fn(() =>
    Promise.resolve({
      data: {
        feedback_events: options.metadata?.feedback_events ?? [],
        app_config: options.metadata?.app_config ?? [],
      },
      error: options.metadataError ?? null,
    }),
  );

  return { from, rpc };
}

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

    const mockClient = createSupabaseMock({ places: [] });
    vi.spyOn(serverModule, "createServerSupabaseClient").mockReturnValue(
      mockClient as unknown as ReturnType<typeof serverModule.createServerSupabaseClient>,
    );

    const data = await fetchBriefingData();

    expect(data.source).toBe("fixture");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toContain("fixture fallback");
    expect(mockClient.from).toHaveBeenCalledOnce();
    expect(mockClient.rpc).toHaveBeenCalledOnce();
  });

  it("places + get_briefing_metadata RPC 2회 이하로 조회", async () => {
    const mockClient = createSupabaseMock({
      places: placesFixture,
      metadata: {
        feedback_events: [],
        app_config: [],
      },
    });
    vi.spyOn(serverModule, "createServerSupabaseClient").mockReturnValue(
      mockClient as unknown as ReturnType<typeof serverModule.createServerSupabaseClient>,
    );

    const data = await fetchBriefingData();

    expect(data.source).toBe("supabase");
    expect(data.places).toEqual(placesFixture);
    expect(mockClient.from).toHaveBeenCalledOnce();
    expect(mockClient.from).toHaveBeenCalledWith("places");
    expect(mockClient.rpc).toHaveBeenCalledOnce();
    expect(mockClient.rpc).toHaveBeenCalledWith("get_briefing_metadata");
  });
});
