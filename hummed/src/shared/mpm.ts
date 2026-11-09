// What the page reads from the MPM itself: its title, the comment in its metadata, and its elements
// by their ids, for naming the calls that wrote them (instructions.ts).

export const MPM_NAMESPACE = 'http://www.cemfi.de/mpm/ns/1.0';

/** The part of a DOM document this needs, so that both the browser's and xmldom's fit. */
export interface MpmDocument {
  getElementsByTagNameNS(
    namespace: string,
    localName: string,
  ): ArrayLike<{
    readonly textContent: string | null;
    readonly parentNode: { readonly nodeName: string } | null;
  }>;
}

/** The MPM's title: the text of the comment in its metadata, or null if it has none. */
export function mpmTitle(doc: MpmDocument): string | null {
  for (const comment of Array.from(doc.getElementsByTagNameNS(MPM_NAMESPACE, 'comment'))) {
    // the parent's name, without a prefix if the MPM uses one
    if (comment.parentNode?.nodeName.split(':').pop() !== 'metadata') continue;
    const title = comment.textContent?.replace(/\s+/g, ' ').trim();
    if (title) return title;
  }
  return null;
}

/** The part of a DOM document `mpmElements` needs. */
export interface MpmElementsDocument {
  getElementsByTagNameNS(
    namespace: string,
    localName: string,
  ): ArrayLike<{ getAttribute(name: string): string | null }>;
}

/** The MPM's elements that have an xml:id, each as a reader of its attributes. */
export function mpmElements(doc: MpmElementsDocument): Map<string, (name: string) => string | null> {
  const byId = new Map<string, (name: string) => string | null>();
  for (const element of Array.from(doc.getElementsByTagNameNS(MPM_NAMESPACE, '*'))) {
    const id = element.getAttribute('xml:id');
    if (id) byId.set(id, (name) => element.getAttribute(name));
  }
  return byId;
}
