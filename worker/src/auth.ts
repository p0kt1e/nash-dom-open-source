export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_ALLOWED_IDS: string;
}

interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

async function hmac(key: CryptoKey, value: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function authenticateTelegram(
  initData: string,
  env: Env
): Promise<TelegramUser | null> {
  if (!initData || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_ALLOWED_IDS) {
    return null;
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");

  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    return null;
  }

  const authDate = Number(params.get("auth_date"));
  const now = Math.floor(Date.now() / 1000);

  if (
    !Number.isSafeInteger(authDate) ||
    authDate > now + 60 ||
    now - authDate > 86400
  ) {
    return null;
  }

  const keys = Array.from(params.keys());
  if (new Set(keys).size !== keys.length) return null;

  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const secret = await hmac(secretKey, env.TELEGRAM_BOT_TOKEN);

  const tokenKey = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const calculatedHash = hex(await hmac(tokenKey, dataCheckString));

  let difference = 0;
  for (let i = 0; i < calculatedHash.length; i++) {
    difference |= calculatedHash.charCodeAt(i) ^ receivedHash.toLowerCase().charCodeAt(i);
  }

  if (difference !== 0) return null;

  try {
    const user = JSON.parse(params.get("user") || "null") as TelegramUser | null;

    if (!user || !Number.isSafeInteger(user.id)) return null;

    const allowedIds = env.TELEGRAM_ALLOWED_IDS
      .split(",")
      .map(id => id.trim());

    if (!allowedIds.includes(String(user.id))) return null;

    return user;
  } catch {
    return null;
  }
}
