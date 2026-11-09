// The info cards are native popovers: closed until asked for, closed again by Escape or a click
// anywhere else. A control's card opens above the panel of the button that opens it, so that it
// covers none of the controls.
import { mpmTitle } from '../shared/mpm.ts';

const GUTTER = 16;
const WIDTH = 340;

export function placeControlCards(): void {
  for (const card of document.querySelectorAll<HTMLElement>('.hint-card')) {
    card.addEventListener('beforetoggle', (event: ToggleEvent) => {
      if (event.newState !== 'open') return;
      const button = document.querySelector(`[popovertarget="${card.id}"]`);
      if (!button) return;
      const at = button.getBoundingClientRect();
      const above = (button.closest('.panel') ?? button).getBoundingClientRect();
      const width = Math.min(WIDTH, window.innerWidth - 2 * GUTTER);
      card.style.left = `${Math.max(GUTTER, Math.min(at.left - 12, window.innerWidth - width - GUTTER))}px`;
      card.style.bottom = `${window.innerHeight - above.top + 8}px`;
    });
  }
}

/** The reconstruction's MPM (/mpm/performance.mpm); null where it cannot be had. */
export async function fetchMpm(): Promise<Document | null> {
  const response = await fetch('../mpm/performance.mpm');
  if (!response.ok) return null;
  return new DOMParser().parseFromString(await response.text(), 'application/xml');
}

/** The page is titled as the reconstruction is: the MPM's own title, read from it. */
export async function showMpmTitle(heading: HTMLElement, mpm: Promise<Document | null>): Promise<void> {
  const doc = await mpm;
  const title = doc && mpmTitle(doc);
  if (!title) return;
  document.title = title;
  heading.textContent = title;
}
