import { describe, expect, it } from "vitest";
import placesFixture from "@/fixtures/places.sample.json";
import { fetchBriefingData } from "@/lib/supabase/fetch-briefing-data";

describe("fetchBriefingData", () => {
  it("Supabase 미설정 시 fixtures로 fallback", async () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const data = await fetchBriefingData();

    expect(data.places).toEqual(placesFixture);
    expect(data.feedback_events).toEqual([]);

    if (originalUrl !== undefined) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }
    if (originalKey !== undefined) {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    }
  });
});
