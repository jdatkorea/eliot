import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import type { Place } from "@/lib/engine/types";
import {
  createServiceRoleClient,
  upsertPlaces,
} from "./lib/place-sync";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
config({ path: resolve(process.cwd(), ".env"), quiet: true });

async function main() {
  const fixturePath = resolve(process.cwd(), "fixtures/places.sample.json");
  const fixtures = JSON.parse(readFileSync(fixturePath, "utf-8")) as Place[];

  const supabase = createServiceRoleClient();
  const data = await upsertPlaces(supabase, fixtures);

  console.log(`Seeded ${data.length} places into Supabase.`);
  for (const row of data) {
    console.log(`  - ${row.name} (${row.id})`);
  }
}

main().catch((error) => {
  console.error("db:seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
