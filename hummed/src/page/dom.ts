/** The element with this id, which must be of this type: the page's markup is part of its contract. */
export function element<T extends Element>(id: string, type: abstract new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`#${id} is missing or is not a ${type.name}`);
  return el;
}

export const formatTime = (t: number): string =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
