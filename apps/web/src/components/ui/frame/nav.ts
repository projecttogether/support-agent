// Which navigation item is current, without React.

type Matchable = { href: string; exact?: boolean; match?: string[] };

function pathOf(href: string): string {
  return href.split(/[?#]/)[0] ?? href;
}

const within = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

/**
 * The item that is active: the longest path the current one starts with
 * ("/" and `exact` items only on themselves; `match` paths with their sub-pages).
 */
export function activeHref<T extends Matchable>(pathname: string, items: T[]): string | undefined {
  let best: { href: string; length: number } | undefined;
  for (const item of items) {
    const path = pathOf(item.href);
    const own = path === "/" || item.exact ? pathname === path : within(pathname, path);
    const lengths = [
      own ? path.length : -1,
      ...(item.match ?? []).map((extra) => (within(pathname, extra) ? extra.length : -1)),
    ];
    const length = Math.max(...lengths);
    if (length >= 0 && (best === undefined || length > best.length)) best = { href: item.href, length };
  }
  return best?.href;
}
