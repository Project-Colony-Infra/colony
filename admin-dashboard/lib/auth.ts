// Beta grade admin auth. Credentials are checked against the environment and a
// signed token is stored in an httpOnly cookie. The token is an HMAC of the
// username, so it cannot be forged without the secret. Route handlers validate
// it before proxying to the Coordinator.
import crypto from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "colony_session";

function secret(): string {
  return process.env.AUTH_SECRET || "colony-dev-secret";
}

function adminUser(): string {
  return process.env.ADMIN_USERNAME || "admin";
}

function adminPass(): string {
  return process.env.ADMIN_PASSWORD || "admin";
}

export function checkCredentials(username: string, password: string): boolean {
  return username === adminUser() && password === adminPass();
}

export function sessionToken(): string {
  return crypto.createHmac("sha256", secret()).update(adminUser()).digest("hex");
}

// isAuthenticated reads the session cookie and validates it against the expected
// token. Used by route handlers.
export function isAuthenticated(): boolean {
  const value = cookies().get(SESSION_COOKIE)?.value;
  if (!value) return false;
  const expected = sessionToken();
  // Constant time compare to avoid leaking timing information.
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
