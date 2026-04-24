/**
 * config.ts
 *
 * Site-wide constants. Edit this file to configure the whole app.
 */

// ── Date range ────────────────────────────────────────────────────────────────

// Only include codings from this date onwards.
export const DATA_START_DATE = "2020-01-01";

// ── Coders ────────────────────────────────────────────────────────────────────

// Coders with 500+ codings included in all visualizations by default.
export const DEFAULT_CODER_IDS = [
  3, 10, 11, 12, 13, 14, 15, 17, 19, 20, 21, 23, 24, 25, 28, 29,
  31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46,
  47, 48, 49, 50, 52, 54, 57, 58, 59,
];

// Set to true to replace real names with pseudonyms everywhere in the app.
export const ANONYMIZE = true;

// ── Emotion code colors ───────────────────────────────────────────────────────
// Based on the Plutchik wheel of emotions.
// Keys are lowercase code names — must match the database exactly.
// These override whatever color is stored in the database.

export const CODE_COLORS: Record<string, string> = {
  // Core Plutchik wheel — keys match DB names lowercased exactly
  "anger / frustration":   "#FC5C56",  // red
  "anticipation / hope":   "#FFB05C",  // orange
  "joy / happiness":       "#D4B800",  // gold (deepened from #FFE663 for readability)
  "disturbed / disgust":   "#41DB8A",  // green (occupies disgust/fear position)
  "surprise":              "#0EA5C6",  // deeper cyan for better contrast on white
  "sadness":               "#519DFC",  // blue
  "no emotion":            "#94a3b8",  // neutral slate
  "unknown":               "#6b7280",  // dark slate

  // Additional active codes
  "confused":              "#A06D8F",  // muted mauve to separate it from no-emotion slate
  "dislike":               "#F87171",  // light red — negative but distinct from anger
  "like":                  "#86EFAC",  // light green — positive but distinct from joy
};

/**
 * Returns the display color for a code by name.
 * Falls back to a valid hex from the DB, then to a default indigo.
 */
export function getCodeColor(name: string, dbColor?: string): string {
  const key = name.trim().toLowerCase();
  if (CODE_COLORS[key]) return CODE_COLORS[key];
  if (dbColor?.startsWith("#") && dbColor.length >= 7) return dbColor;
  return "#818cf8";
}
