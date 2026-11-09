/** The element with this id, which must be of this type: the page's markup is part of its contract. */
export function element<T extends Element>(id: string, type: abstract new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`#${id} is missing or is not a ${type.name}`);
  return el;
}

export const formatTime = (t: number): string =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** How far a range input's track is filled, from its left end (the stylesheet draws it). */
export const setFill = (input: HTMLInputElement, fraction: number): void => {
  input.style.setProperty('--p', `${fraction * 100}%`);
};

/**
 * Something on the page that is written only when its value changes. The page is drawn many times a
 * second, and a write, even of what is there already, can have the browser work out styles and
 * layout again.
 */
export class Written<T> {
  readonly #write: (value: T) => void;
  #last: { readonly value: T } | null = null;

  constructor(write: (value: T) => void) {
    this.#write = write;
  }

  set(value: T): void {
    if (this.#last && Object.is(this.#last.value, value)) return;
    this.#last = { value };
    this.#write(value);
  }
}

/** What is remembered between visits (conveniences: the page works without them). */
export const recall = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
export const remember = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: kept for this visit only
  }
};
