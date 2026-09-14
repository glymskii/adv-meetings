import { config } from "../config.js";

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

/**
 * Разрешён ли домен почты. Пустой allowlist (ALLOWED_EMAIL_DOMAINS) = любой домен (режим разработки).
 * Домены агентств из таблицы agencies также входят в allowlist.
 */
export function isEmailAllowed(email: string, extraDomains: string[] = []): boolean {
  const allowed = new Set([...config().ALLOWED_EMAIL_DOMAINS, ...extraDomains].map((d) => d.toLowerCase()));
  if (allowed.size === 0) return true;
  const domain = emailDomain(email);
  return allowed.has(domain);
}
