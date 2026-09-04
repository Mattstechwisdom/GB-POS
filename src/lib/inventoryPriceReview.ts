import type { PriceCandidate } from './partOrdering';

export type PriceLearningRule = { selectorFingerprint?: string; sourceKind?: string };
export type PriceResultKind = 'changed' | 'unchanged' | 'needs-review' | 'login-required' | 'failed';

export function rankPriceCandidates(candidates: PriceCandidate[], rule?: PriceLearningRule | null, exception?: PriceLearningRule | null) {
  return [...candidates].map((candidate) => {
    let score = Number(candidate.confidence || 0);
    if (candidate.sourceKind === 'current' || candidate.sourceKind === 'sale') score += .25;
    if (candidate.sourceKind === 'list') score -= .2;
    if (rule?.selectorFingerprint === candidate.selectorFingerprint) score += 1;
    if (rule?.sourceKind === candidate.sourceKind) score += .25;
    if (exception?.selectorFingerprint === candidate.selectorFingerprint) score += 1.5;
    if (exception?.sourceKind === candidate.sourceKind) score += .75;
    return { ...candidate, score };
  }).sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.value - b.value);
}

export function classifyPriceResult(previousCost: number, ranked: ReturnType<typeof rankPriceCandidates>, flags: { loginRequired?: boolean } = {}): PriceResultKind {
  if (flags.loginRequired) return 'login-required';
  const best = ranked[0];
  if (!best) return 'failed';
  const previous = Number(previousCost || 0);
  if (Math.abs(previous - best.value) < .005) return 'unchanged';
  const percentage = previous > 0 ? Math.abs(best.value - previous) / previous : 1;
  if (best.score < .7 || percentage >= 3) return 'needs-review';
  return 'changed';
}

export function priceDifference(previousCost: number, proposedCost: number) {
  const difference = Math.round((proposedCost - previousCost) * 100) / 100;
  return { difference, percentage: previousCost > 0 ? Math.round((difference / previousCost) * 10000) / 100 : null };
}
