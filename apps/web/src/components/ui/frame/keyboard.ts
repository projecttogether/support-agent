// Key handling of the app frame, without React: which keys mean what, and where they do not count.

/** In fields and editors, letters are typing, not shortcuts. */
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    ((target instanceof HTMLElement && target.isContentEditable) ||
      target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']") !== null)
  );
}

/** A dialog or menu is open: its keys win. */
export function layerOpen(): boolean {
  return (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]',
    ) !== null
  );
}

function plain(event: KeyboardEvent): boolean {
  return !event.defaultPrevented && !event.isComposing && !event.altKey;
}

/** ⌘K or Ctrl+K: the search, also while typing. */
export function isSearchKey(event: KeyboardEvent): boolean {
  return (
    plain(event) && (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "k"
  );
}

/** "/" outside a field: the search. A single-key shortcut. Shift is allowed (German keyboards: Shift+7). */
export function isSlashKey(event: KeyboardEvent): boolean {
  return plain(event) && !event.metaKey && !event.ctrlKey && event.key === "/" && !isTyping(event.target);
}

/**
 * Ctrl+/: the overview of the shortcuts. Ctrl on every system, also on a
 * Mac, where ⌘ shortcuts belong to the browser.
 */
export function isOverviewKey(event: KeyboardEvent): boolean {
  return plain(event) && event.ctrlKey && !event.metaKey && event.key === "/";
}

/** A letter without modifiers, outside fields: part of "G then a letter". */
export function letterOf(event: KeyboardEvent): string | null {
  if (!plain(event) || event.ctrlKey || event.metaKey || event.repeat || isTyping(event.target)) return null;
  return /^[a-z]$/i.test(event.key) ? event.key.toLowerCase() : null;
}

/** Letters that more than one page claims, with the pages; each letter may go to one page only. */
export function shortcutClashes(items: { label: string; shortcut?: string }[]): Map<string, string[]> {
  const pages = new Map<string, string[]>();
  for (const item of items) {
    if (!item.shortcut) continue;
    const key = item.shortcut.toLowerCase();
    pages.set(key, [...(pages.get(key) ?? []), item.label]);
  }
  return new Map([...pages].filter(([, labels]) => labels.length > 1));
}
