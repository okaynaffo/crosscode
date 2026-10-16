const PAID_TIERS = ["starter", "builder"]

export function isPaidTier(tier?: string | null) {
  return !!tier && PAID_TIERS.includes(tier)
}


