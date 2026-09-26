/**
 * Keyboard behaviour shared by every language popover (Header desktop
 * dropdown, Header mobile drawer section, Sidebar flyout). Each of
 * those renders its own `role="menu"` of `role="menuitemradio"`
 * buttons - the markup stays inline where the existing layout tests
 * expect it, and only the behaviour is shared here.
 *
 * Pure DOM, no React state: the "current" item is simply whichever
 * button has focus, so this works identically for a portalled flyout
 * and an inline list.
 */

const ITEM_SELECTOR = '[role="menuitemradio"]';

function itemsOf(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
}

function focusItem(item: HTMLElement | undefined) {
  if (!item) return;
  item.focus({ preventScroll: true });
  // "nearest" scrolls the list itself (and, for the mobile drawer, the
  // drawer around it) only as far as needed to reveal the row - it never
  // yanks the whole page.
  item.scrollIntoView({ block: "nearest" });
}

/**
 * Arrow keys move between languages (wrapping), Home/End jump to the
 * ends, and typing a letter jumps to the next language whose label
 * starts with it. Escape is left to each menu's own document-level
 * handler, which also returns focus to the trigger.
 */
export function handleLanguageMenuKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  const items = itemsOf(event.currentTarget);
  if (items.length === 0) return;

  const index = items.indexOf(document.activeElement as HTMLElement);
  let next = -1;

  switch (event.key) {
    case "ArrowDown":
      next = index < 0 ? 0 : (index + 1) % items.length;
      break;
    case "ArrowUp":
      next = index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length;
      break;
    case "Home":
    case "PageUp":
      next = 0;
      break;
    case "End":
    case "PageDown":
      next = items.length - 1;
      break;
    default: {
      if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return;
      const char = event.key.toLocaleLowerCase();
      for (let step = 1; step <= items.length; step += 1) {
        const candidate = (index + step) % items.length;
        const label = (items[candidate].textContent ?? "").trim().toLocaleLowerCase();
        if (label.startsWith(char)) {
          next = candidate;
          break;
        }
      }
      if (next < 0) return;
    }
  }

  event.preventDefault();
  focusItem(items[next]);
}

/**
 * Called right after a language menu opens: brings the list itself into
 * view (matters inside the scrolling mobile drawer, where the list used
 * to open partly below the fold with no hint that it continued) and
 * puts focus on the currently selected language so the arrow keys start
 * from it. Given several containers, only the one that is actually
 * displayed is used - Header renders its desktop and mobile menus from
 * the same open state, with one of them `display: none` at any width.
 */
export function focusCurrentLanguageItem(containers: Array<HTMLElement | null>) {
  const container = containers.find((c) => c && c.offsetParent !== null) ?? null;
  if (!container) return;

  container.scrollIntoView({ block: "nearest" });

  const items = itemsOf(container);
  const checked = items.find((item) => item.getAttribute("aria-checked") === "true");
  focusItem(checked ?? items[0]);
}
