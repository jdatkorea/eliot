import { loadBriefingPayload } from "@/lib/supabase/briefing-store";
import { resolveBriefingPayload } from "@/lib/webhook/briefing-urls";
import BriefingView from "./BriefingView";

export default async function BriefingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { id } = await params;
  const { variant: variantParam } = await searchParams;
  const variant = variantParam === "B" ? "B" : "A";

  let payload;
  try {
    payload = await loadBriefingPayload(id);
  } catch {
    payload = null;
  }

  if (!payload) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-50 px-2">
        <p className="text-xs leading-snug text-rose-600">
          브리핑을 찾을 수 없습니다. 링크가 만료되었거나 잘못되었습니다.
        </p>
      </div>
    );
  }

  const resolved = resolveBriefingPayload(payload, variant);

  return (
    <BriefingView
      briefing={resolved.briefing}
      variantLabel={resolved.variantLabel}
      variant={resolved.variant}
      feedbackUrl={resolved.feedbackUrl}
      dual={resolved.dual}
    />
  );
}
