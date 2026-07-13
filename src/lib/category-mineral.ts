/**
 * Category → mineral accent mapping.
 *
 * The branded nyuchi components (listing card, calendar dots, programme dots,
 * ticket accent) tint each event by a mineral drawn from the Five African
 * Minerals palette. nhimbe's brand *primary* stays tanzanite (see globals.css
 * `--primary: var(--tanzanite)`); this per-event accent is a categorisation
 * cue, not a rebrand. Unknown / uncategorised events fall back to tanzanite —
 * the nhimbe lead — so the brand mineral is always the default face.
 *
 * Client-safe (no `server-only`): the mapping is pure data, consumed by the
 * client listing cards that render event grids.
 */

export type Mineral = "cobalt" | "tanzanite" | "malachite" | "gold" | "terracotta";

/** The nhimbe brand mineral — the default accent when a category is unknown. */
export const NHIMBE_LEAD_MINERAL: Mineral = "tanzanite";

// keyword → mineral. A category (id or display name) is lower-cased and matched
// by substring against these keyword lists. Tanzanite is checked first so it
// wins ties for the arts/culture families the brand leads with.
const MINERAL_KEYWORDS: [Mineral, string[]][] = [
  // Tanzanite (nhimbe lead) — arts, culture, music, entertainment.
  ["tanzanite", ["music", "festival", "concert", "art", "culture", "heritage", "film", "comedy", "theatre", "dance", "fashion", "photograph", "writing", "book", "entertain", "gaming", "esport"]],
  // Cobalt — knowledge, tech, business, civic (information mineral).
  ["cobalt", ["tech", "ai-", "machine", "startup", "business", "finance", "invest", "trade", "commerce", "education", "research", "academ", "conference", "workshop", "network", "diaspora", "governance", "policy", "advocacy", "human-rights", "language"]],
  // Malachite — outdoors, sport, wellness, environment, health (green).
  ["malachite", ["outdoor", "hike", "hiking", "trail", "run", "walk", "sport", "football", "fitness", "wellness", "mindful", "environment", "climate", "wildlife", "conservation", "nature", "health", "medicine", "mental", "adventure", "cycling", "swim", "climb", "marathon", "parkrun"]],
  // Gold — food, faith, agriculture, markets (prosperity / earth).
  ["gold", ["food", "drink", "dinner", "tasting", "menu", "faith", "spiritual", "religious", "worship", "church", "prayer", "agricultur", "farming", "market"]],
  // Terracotta — community, family, ubuntu, social gatherings (earth/clay).
  ["terracotta", ["community", "family", "parent", "ubuntu", "social", "meetup", "mixer", "volunteer", "charity", "civic"]],
];

/** Map an event category (id or display name) to a mineral accent. */
export function categoryToMineral(category?: string | null): Mineral {
  if (!category) return NHIMBE_LEAD_MINERAL;
  const c = category.toLowerCase();
  for (const [mineral, keywords] of MINERAL_KEYWORDS) {
    if (keywords.some((k) => c.includes(k))) return mineral;
  }
  return NHIMBE_LEAD_MINERAL;
}
