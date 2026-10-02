/** A timestamp for the admin pages, in UTC so it reads the same on the server and in the browser. */
export function formatWhen(value: Date | string | null | undefined): string {
  if (!value) return "Never";
  const iso = (typeof value === "string" ? new Date(value) : value).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** How the admin audit log words each action ("<admin> <label> <user>"). */
export const AUDIT_LABELS: Record<string, string> = {
  PASSWORD_RESET_LINK_CREATED: "created a password reset link for",
  PASSWORD_RESET_EMAIL_SENT: "emailed a password reset link to",
  SUPERUSER_GRANTED: "granted superuser access to",
  SUPERUSER_REVOKED: "revoked superuser access from",
};
