import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const COOKIE_NAME = "private_chat_session";
const DAY_IN_SECONDS = 24 * 60 * 60;

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left, right) {
  const leftHash = createHmac("sha256", "password-comparison").update(left).digest();
  const rightHash = createHmac("sha256", "password-comparison").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function passwordMatches(candidate, expected) {
  return typeof candidate === "string" && safeEqual(candidate, expected);
}

export function createSessionToken(secret, remember = true, now = Date.now()) {
  const lifetime = (remember ? 30 : 1) * DAY_IN_SECONDS;
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(now / 1000) + lifetime,
    nonce: randomBytes(16).toString("base64url"),
  })).toString("base64url");

  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token, secret, now = Date.now()) {
  if (typeof token !== "string") return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;

  const expected = sign(payload, secret);
  if (!safeEqual(signature, expected)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isInteger(decoded.exp) && decoded.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

export function readSessionCookie(request) {
  const cookies = request.headers.cookie?.split(";") || [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator === -1) continue;
    const name = cookie.slice(0, separator).trim();
    if (name === COOKIE_NAME) {
      return decodeURIComponent(cookie.slice(separator + 1));
    }
  }
  return null;
}

export function setSessionCookie(response, token, { isProduction, remember }) {
  const attributes = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${(remember ? 30 : 1) * DAY_IN_SECONDS}`,
  ];
  if (isProduction) attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
}

export function clearSessionCookie(response, isProduction) {
  const attributes = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];
  if (isProduction) attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
}
