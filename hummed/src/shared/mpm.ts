// What the page reads from the MPM itself: its title, the comment in its metadata.

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
