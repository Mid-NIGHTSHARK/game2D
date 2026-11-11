// Crockford-style Base32 room code and cryptographic secret generator & parser for Rillkeepers
// Avoids ambiguous characters: 0, 1, I, O

export const SAFE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generate cryptographically secure random string using browser crypto API.
 */
export function generateCryptoRandomString(length: number = 10, alphabet: string = SAFE_ALPHABET): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for non-browser/test environments
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let result = '';
  for (let i = 0; i < length; i++) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}

/**
 * Generate an independent public Room ID (10 chars, Safe Base32).
 */
export function generateRoomId(): string {
  return generateCryptoRandomString(10, SAFE_ALPHABET);
}

/**
 * Generate an independent private Room Secret (16 chars, Safe Base32).
 */
export function generateRoomSecret(): string {
  return generateCryptoRandomString(16, SAFE_ALPHABET);
}

/**
 * Backwards compatibility helper.
 */
export function generateRoomCode(length: number = 10): string {
  return generateCryptoRandomString(length, SAFE_ALPHABET);
}

/**
 * Clean and normalize a Room ID.
 * Maps ambiguous characters: 0 -> 8, 1/I -> J, O -> 9.
 */
export function sanitizeRoomId(raw: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .toUpperCase()
    .replace(/0/g, '8')
    .replace(/[1I]/g, 'J')
    .replace(/O/g, '9')
    .replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '')
    .slice(0, 16);
}

export function sanitizeRoomCode(raw: string): string {
  return sanitizeRoomId(raw);
}

/**
 * Clean and normalize a Room Secret.
 */
export function sanitizeRoomSecret(raw: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .toUpperCase()
    .replace(/0/g, '8')
    .replace(/[1I]/g, 'J')
    .replace(/O/g, '9')
    .replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '')
    .slice(0, 32);
}

export function isValidRoomId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  const sanitized = sanitizeRoomId(id);
  return sanitized.length >= 4 && sanitized.length <= 16;
}

export function isValidRoomCode(id: string): boolean {
  return isValidRoomId(id);
}

export function isValidRoomSecret(secret: string): boolean {
  if (!secret || typeof secret !== 'string') return false;
  const sanitized = sanitizeRoomSecret(secret);
  return sanitized.length >= 6 && sanitized.length <= 32;
}

/**
 * Generate shareable invitation URL:
 * https://mid-nightshark.github.io/game2D/rillkeepers/?room=ROOM_ID#key=ROOM_SECRET
 *
 * Note: Secret key is placed in the URL hash fragment (#key=...), so it is NEVER
 * transmitted to web servers or HTTP access logs.
 */
export function generateInvitationUrl(roomId: string, roomSecret: string, baseUrl?: string): string {
  const base = baseUrl || (typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}`
    : 'https://mid-nightshark.github.io/game2D/rillkeepers/');

  const cleanRoom = sanitizeRoomId(roomId);
  const cleanSecret = sanitizeRoomSecret(roomSecret);

  // Construct URL with query param ?room=... and fragment #key=...
  const url = new URL(base, 'https://mid-nightshark.github.io/game2D/rillkeepers/');
  url.searchParams.set('room', cleanRoom);
  url.hash = `key=${cleanSecret}`;
  return url.toString();
}

/**
 * Parse an invitation URL or fragment into roomId and roomSecret.
 */
export function parseInvitationUrl(input: string): { roomId: string; roomSecret: string } | null {
  if (!input) return null;

  try {
    const url = new URL(input, 'https://mid-nightshark.github.io/game2D/rillkeepers/');
    const roomId = sanitizeRoomId(url.searchParams.get('room') || '');

    let roomSecret = '';
    const hash = url.hash.replace(/^#/, '');
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      roomSecret = sanitizeRoomSecret(hashParams.get('key') || '');
    }

    if (isValidRoomId(roomId) && isValidRoomSecret(roomSecret)) {
      return { roomId, roomSecret };
    }
  } catch {
    // If not a full URL, try regex matching query and hash
    const roomMatch = input.match(/[?&]room=([A-Za-z0-9]+)/);
    const keyMatch = input.match(/[#&]key=([A-Za-z0-9]+)/);
    if (roomMatch && keyMatch) {
      const roomId = sanitizeRoomId(roomMatch[1]);
      const roomSecret = sanitizeRoomSecret(keyMatch[1]);
      if (isValidRoomId(roomId) && isValidRoomSecret(roomSecret)) {
        return { roomId, roomSecret };
      }
    }
  }

  return null;
}

/**
 * Format a user-friendly combined invite code (e.g. ROOMID.ROOMSECRET).
 */
export function formatCombinedInviteCode(roomId: string, roomSecret: string): string {
  return `${sanitizeRoomId(roomId)}.${sanitizeRoomSecret(roomSecret)}`;
}

/**
 * Parse a combined invite code, URL, or separate tokens.
 */
export function parseCombinedInviteCode(input: string): { roomId: string; roomSecret: string } | null {
  if (!input) return null;
  const trimmed = input.trim();

  // 1. Try parsing as invitation URL
  const fromUrl = parseInvitationUrl(trimmed);
  if (fromUrl) return fromUrl;

  // 2. Try parsing dot-delimited or hyphen-delimited combined code (ROOMID.SECRET or ROOMID-SECRET)
  if (trimmed.includes('.')) {
    const parts = trimmed.split('.');
    if (parts.length === 2) {
      const roomId = sanitizeRoomId(parts[0]);
      const roomSecret = sanitizeRoomSecret(parts[1]);
      if (isValidRoomId(roomId) && isValidRoomSecret(roomSecret)) {
        return { roomId, roomSecret };
      }
    }
  }

  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    if (parts.length === 2) {
      const roomId = sanitizeRoomId(parts[0]);
      const roomSecret = sanitizeRoomSecret(parts[1]);
      if (isValidRoomId(roomId) && isValidRoomSecret(roomSecret)) {
        return { roomId, roomSecret };
      }
    }
  }

  return null;
}

/**
 * Redact secret parameters from an invitation URL for secure logging.
 * Replaces the private hash fragment key with #key=[REDACTED].
 */
export function redactInvitationUrl(url: string): string {
  if (!url) return '';
  return url.replace(/#key=[^&]+/i, '#key=[REDACTED]');
}

/**
 * Redact a room secret string for secure logging.
 */
export function redactSecret(secret?: string): string {
  if (!secret) return '';
  return '[REDACTED]';
}
