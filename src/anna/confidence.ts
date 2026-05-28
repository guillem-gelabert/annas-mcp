export type ConfidenceLevel = "high" | "low" | "unverified";

const JACCARD_THRESHOLD = 0.5;

function normalizeTitle(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return new Set(words);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const union = new Set([...a, ...b]);
  const intersection = [...a].filter((w) => b.has(w));
  return intersection.length / union.size;
}

export function computeConfidence(
  annasTitle: string,
  crossrefTitle: string | null
): ConfidenceLevel {
  if (crossrefTitle === null) return "unverified";

  const a = normalizeTitle(annasTitle);
  const b = normalizeTitle(crossrefTitle);

  if (a.size === 0 && b.size === 0) return "high";
  if (a.size === 0 || b.size === 0) return "low";

  return jaccardSimilarity(a, b) >= JACCARD_THRESHOLD ? "high" : "low";
}
