const baseUrl = "https://stockandcryptotracker.com";
const locales = ["en", "zh"] as const;

/**
 * Build canonical + hreflang alternates for a page.
 * Pass the path WITHOUT locale prefix (e.g. "/pricing", "/blog/my-post", or "" for homepage).
 */
export function buildAlternates(path: string, locale: string) {
  const languages: Record<string, string> = {};
  for (const loc of locales) {
    languages[loc] = `${baseUrl}/${loc}${path}`;
  }
  languages["x-default"] = `${baseUrl}/en${path}`;

  return {
    canonical: `${baseUrl}/${locale}${path}`,
    languages,
  };
}
