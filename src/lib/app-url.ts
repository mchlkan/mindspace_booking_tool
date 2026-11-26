/**
 * Absolute URL for links in emails and calendar invites.
 * APP_URL wins; on Vercel it falls back to the production domain Vercel
 * provides; locally it's http://localhost:3000.
 */
export function appUrl(path = "/"): string {
  const base =
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return new URL(path, base).toString();
}
