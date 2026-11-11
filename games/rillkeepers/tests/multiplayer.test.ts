import { describe, it, expect } from 'vitest';
import {
  generateRoomId,
  generateRoomSecret,
  sanitizeRoomId,
  sanitizeRoomSecret,
  isValidRoomId,
  isValidRoomSecret,
  generateInvitationUrl,
  parseInvitationUrl,
  formatCombinedInviteCode,
  parseCombinedInviteCode,
  redactInvitationUrl,
  redactSecret
} from '../src/networking/RoomCode';
import { TrysteroTransport } from '../src/networking/TrysteroTransport';
import {
  sanitizePlayerName,
  isValidGuestInput,
  isValidJoinRequest,
  isValidJoinResponse,
  isValidWorldEvent,
  PROTOCOL_VERSION
} from '../src/networking/Protocol';

describe('P2P Protocol, Room Secrets & Security Architecture', () => {
  it('generates independent cryptographically random Room IDs and Room Secrets', () => {
    const id1 = generateRoomId();
    const id2 = generateRoomId();
    const secret1 = generateRoomSecret();
    const secret2 = generateRoomSecret();

    // Independent and distinct
    expect(id1).not.toBe(id2);
    expect(secret1).not.toBe(secret2);
    expect(id1).not.toBe(secret1);

    // Formats and lengths
    expect(id1).toHaveLength(10);
    expect(secret1).toHaveLength(16);

    // Must NOT contain ambiguous characters 0, 1, I, O
    expect(id1).not.toMatch(/[01IO]/);
    expect(secret1).not.toMatch(/[01IO]/);
  });

  it('generates shareable invitation URLs with room secret strictly in fragment #key=', () => {
    const roomId = '7K2M9X4B3J';
    const roomSecret = 'A8W9K2M4P6Q7R8T9';
    const invite = generateInvitationUrl(roomId, roomSecret);

    // Query must contain room ID
    expect(invite).toContain('?room=7K2M9X4B3J');
    // Fragment must contain room secret
    expect(invite).toContain('#key=A8W9K2M4P6Q7R8T9');
    // Secret must NOT be in query string
    const url = new URL(invite);
    expect(url.searchParams.has('key')).toBe(false);
    expect(url.searchParams.get('room')).toBe(roomId);
    expect(url.hash).toBe('#key=A8W9K2M4P6Q7R8T9');
  });

  it('correctly parses invitation URLs and fragments without exposing secrets', () => {
    const urlStr = 'https://mid-nightshark.github.io/game2D/rillkeepers/?room=7K2M9X4B3J#key=A8W9K2M4P6Q7R8T9';
    const parsed = parseInvitationUrl(urlStr);

    expect(parsed).not.toBeNull();
    expect(parsed?.roomId).toBe('7K2M9X4B3J');
    expect(parsed?.roomSecret).toBe('A8W9K2M4P6Q7R8T9');

    // Missing key fragment returns null
    expect(parseInvitationUrl('https://mid-nightshark.github.io/game2D/rillkeepers/?room=7K2M9X4B3J')).toBeNull();
    // Missing room param returns null
    expect(parseInvitationUrl('https://mid-nightshark.github.io/game2D/rillkeepers/#key=A8W9K2M4P6Q7R8T9')).toBeNull();
  });

  it('formats and parses user-friendly combined invite codes', () => {
    const roomId = '7K2M9X4B3J';
    const roomSecret = 'A8W9K2M4P6Q7R8T9';
    const combined = formatCombinedInviteCode(roomId, roomSecret);
    expect(combined).toBe('7K2M9X4B3J.A8W9K2M4P6Q7R8T9');

    const parsed = parseCombinedInviteCode(combined);
    expect(parsed?.roomId).toBe(roomId);
    expect(parsed?.roomSecret).toBe(roomSecret);

    // Also parses colon-delimited or full URL
    const parsedColon = parseCombinedInviteCode('7K2M9X4B3J:A8W9K2M4P6Q7R8T9');
    expect(parsedColon?.roomId).toBe(roomId);
    expect(parsedColon?.roomSecret).toBe(roomSecret);
  });

  it('strictly validates room IDs and secrets and rejects missing secret', () => {
    expect(isValidRoomId('7K2M9X4B3J')).toBe(true);
    expect(isValidRoomId('')).toBe(false);
    expect(isValidRoomId('AB')).toBe(false); // too short

    expect(isValidRoomSecret('A8W9K2M4P6Q7R8T9')).toBe(true);
    expect(isValidRoomSecret('')).toBe(false);
    expect(isValidRoomSecret('123')).toBe(false); // too short
  });

  it('sanitizes and normalizes room identifiers cleanly', () => {
    expect(sanitizeRoomId('  7k2m9x  ')).toBe('7K2M9X');
    // Normalizes ambiguous 0 -> 8, 1/I -> J, O -> 9
    expect(sanitizeRoomId('01IO')).toBe('8JJ9');
  });

  it('sanitizes player display names and prevents HTML injection', () => {
    expect(sanitizePlayerName('  Keeper Rowan  ')).toBe('Keeper Rowan');
    expect(sanitizePlayerName('<script>alert("hack")</script>')).toBe('scriptalert(hack)script');
    expect(sanitizePlayerName('')).toMatch(/^Keeper \d+$/);
    expect(sanitizePlayerName('A'.repeat(50))).toHaveLength(24);
  });

  it('strictly validates guest input frames and rejects malformed values', () => {
    const valid = {
      seq: 1,
      dx: 1.0,
      dy: 0.0,
      dt: 0.05,
      direction: 'right'
    };
    expect(isValidGuestInput(valid)).toBe(true);

    // Reject NaN or Infinity
    expect(isValidGuestInput({ ...valid, dx: NaN })).toBe(false);
    expect(isValidGuestInput({ ...valid, dy: Infinity })).toBe(false);

    // Reject invalid delta time
    expect(isValidGuestInput({ ...valid, dt: -0.1 })).toBe(false);
    expect(isValidGuestInput({ ...valid, dt: 2.0 })).toBe(false);

    // Reject invalid directions
    expect(isValidGuestInput({ ...valid, direction: 'diagonal' })).toBe(false);

    // Reject negative seq
    expect(isValidGuestInput({ ...valid, seq: -1 })).toBe(false);
  });

  it('validates join requests and protocol version matches', () => {
    const validJoin = {
      protocolVersion: PROTOCOL_VERSION,
      playerName: 'Keeper Rowan',
      reconnectToken: 'tok_12345'
    };
    expect(isValidJoinRequest(validJoin)).toBe(true);

    // Mismatched protocol version rejected
    expect(isValidJoinRequest({ ...validJoin, protocolVersion: '0.9.0' })).toBe(false);
  });

  it('validates discrete world events', () => {
    const validEvent = {
      eventId: 'evt_1',
      eventSeq: 1,
      type: 'gate_toggled',
      targetId: 'gate_upper',
      timestamp: Date.now()
    };
    expect(isValidWorldEvent(validEvent)).toBe(true);
    expect(isValidWorldEvent({ ...validEvent, type: 'illegal_cheat' })).toBe(false);
  });

  it('redacts invitation secrets and raw secret keys for safe diagnostic logging', () => {
    const rawUrl = 'https://mid-nightshark.github.io/game2D/rillkeepers/?room=DCTM2SUX8L#key=S7NV4GN4DFJ7YJX4';
    const redacted = redactInvitationUrl(rawUrl);
    expect(redacted).toBe('https://mid-nightshark.github.io/game2D/rillkeepers/?room=DCTM2SUX8L#key=[REDACTED]');
    expect(redacted).not.toContain('S7NV4GN4DFJ7YJX4');

    expect(redactSecret('S7NV4GN4DFJ7YJX4')).toBe('[REDACTED]');
    expect(redactSecret('')).toBe('');
  });

  it('enforces that mDNS host fallback to loopback is disabled by default and collects ICE candidate stats', () => {
    const transport = new TrysteroTransport();
    // Default mDNS fallback is false unless explicit test flag is active
    expect(transport.isMdnsFallbackActive()).toBe(false);

    const stats = transport.getIceCandidateStats();
    expect(stats.hostCandidatesGathered).toBe(0);
    expect(stats.srflxCandidatesGathered).toBe(0);
    expect(stats.relayCandidatesGathered).toBe(0);
    expect(stats.selectedCandidatePair).toBeUndefined();
  });
});
