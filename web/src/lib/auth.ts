/**
 * The lock on the door.
 *
 * This is a static site, so be clear-eyed about what this is: it keeps the
 * board private from anyone who wanders past the URL. It is not a vault. The
 * bundle is public, and a determined person with the hash can attack it
 * offline. That is why nothing personal is ever built into the bundle —
 * applications, contacts, resume text and settings live only in this browser's
 * storage, and the crawl output contains nothing but public job postings.
 *
 * The password itself is never stored anywhere. Only a PBKDF2-SHA256 digest of
 * it is, with a random salt and 210,000 iterations, which is OWASP's current
 * floor for that algorithm.
 */

const CREDENTIAL = {
  user: "kousik",
  salt: "d6f874061e3855b7dc60a9a548c33875",
  hash: "5882838f2f8453e6d79bca9310e861e5ef5844d10f4dafb285518fff63d0c4c3",
  iterations: 210000,
}

const SESSION_KEY = "joblab.session"

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/** Constant-time compare, so a wrong guess leaks nothing through timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verify(user: string, password: string): Promise<boolean> {
  if (user.trim().toLowerCase() !== CREDENTIAL.user) return false

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(CREDENTIAL.salt) as unknown as BufferSource,
      iterations: CREDENTIAL.iterations,
      hash: "SHA-256",
    },
    key,
    256,
  )
  return safeEqual(bytesToHex(bits), CREDENTIAL.hash)
}

export function startSession(): boolean {
  try {
    sessionStorage.setItem(SESSION_KEY, String(Date.now()))
    return true
  } catch {
    return false
  }
}

export function hasSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) !== null
  } catch {
    return false
  }
}

export function endSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* nothing to clear */
  }
}
