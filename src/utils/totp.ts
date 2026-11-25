const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generates a cryptographically random 160-bit Base32 secret (32 chars)
 * compatible with Google Authenticator, Authy, and 1Password.
 */
export function generateBase32Secret(byteLength = 20): string {
  const randomBytes = new Uint8Array(byteLength);
  crypto.getRandomValues(randomBytes);

  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < randomBytes.length; i += 1) {
    value = (value << 8) | randomBytes[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32ToBytes(base32: string): Uint8Array {
  const cleaned = base32
    .toUpperCase()
    .replace(/[\s=-]/g, '');

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i += 1) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error('Chave secreta Base32 inválida.');
    }
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

async function generateTotpAtCounter(
  secret: string,
  counter: number
): Promise<string> {
  const keyBytes = base32ToBytes(secret);
  const keyBuffer = keyBytes.buffer.slice(
    keyBytes.byteOffset,
    keyBytes.byteOffset + keyBytes.byteLength
  ) as ArrayBuffer;

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const counterBytes = new Uint8Array(8);
  let temp = counter;
  for (let i = 7; i >= 0; i -= 1) {
    counterBytes[i] = temp & 0xff;
    temp = Math.floor(temp / 256);
  }

  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    counterBytes.buffer
  );
  const hmac = new Uint8Array(signature);

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, '0');
}

/**
 * Validates a 6-digit TOTP code against a Base32 secret using standard
 * 30-second HMAC-SHA1 windows (±1 step tolerance for clock drift).
 */
export async function verifyTotpCode(
  secret: string,
  code: string,
  windowSteps = 1
): Promise<boolean> {
  const normalized = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized) || !secret.trim()) {
    return false;
  }

  const currentCounter = Math.floor(Date.now() / 1000 / 30);
  for (let offset = -windowSteps; offset <= windowSteps; offset += 1) {
    const expected = await generateTotpAtCounter(secret, currentCounter + offset);
    if (expected === normalized) {
      return true;
    }
  }

  return false;
}

export function buildOtpAuthUri(accountName: string, secret: string): string {
  const label = encodeURIComponent(accountName.trim() || 'Usuario');
  return `otpauth://totp/RotaJusta:${label}?secret=${secret}&issuer=RotaJusta`;
}
