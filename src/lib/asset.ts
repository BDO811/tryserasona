/**
 * Resolve a file in `public/` against the app's base path.
 *
 * A literal "/images/foo.jpg" only works when the app is served from a domain
 * root. Deployed under a subpath (demos.amplifierhealth.com/sona2/) those URLs
 * resolve against the domain root instead and 404 — which broke the logo and,
 * more seriously, the libflacjs encoder the recorder depends on.
 *
 * Vite sets BASE_URL from the build's `base` and always ends it with a slash.
 */
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
