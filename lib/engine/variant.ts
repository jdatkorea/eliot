export function deriveVariantB(moodTagsA: string[]): string[] {
  if (moodTagsA.includes("extend_range")) {
    return moodTagsA.filter((t) => t !== "extend_range");
  }
  if (moodTagsA.includes("relaxed_pace")) {
    return [...moodTagsA.filter((t) => t !== "relaxed_pace"), "extend_range"];
  }
  return [...moodTagsA, "extend_range"];
}

export function variantLabel(moodTags: string[]): string {
  return moodTags.includes("extend_range") ? "원거리·확장형" : "근거리·기본형";
}
