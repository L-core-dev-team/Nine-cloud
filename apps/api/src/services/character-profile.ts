// Player-authored display metadata. This module has no dependency on the rules or host.
export const profileLimits = { name: 80, personality: 320, origin: 500, appearance: 500, goal: 500 } as const;
export type ProfileField = keyof typeof profileLimits;
export type CharacterProfile = Partial<Record<ProfileField, string>>;

export function isCharacterProfile(value: unknown): value is CharacterProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (!entries.length || entries.length > 5) return false;
  for (const [key, text] of entries) {
    if (!Object.hasOwn(profileLimits, key) || typeof text !== 'string' || !text.trim()
      || text.length > profileLimits[key as ProfileField] || text.includes('\0') || /[\uD800-\uDFFF]/u.test(text)) return false;
  }
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 4096;
}
