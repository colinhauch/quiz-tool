/**
 * The image visual aid: a served image shown beside the prompt — the flag in
 * "This is the flag of what country?" (spec #180). A plain `<img>`, not inline
 * SVG, so the browser caches it and image-loaded SVG can't run script.
 *
 * Flags vary wildly in aspect ratio (square, 2:1, the odd non-rectangle), so the
 * image is *contained* in a fixed-height box rather than stretched, and a subtle
 * border keeps white-edged flags (Japan, Nigeria) from bleeding into the page.
 * Kept behind a tiny props interface, like `MapAid`, so `VisualAid` owns the
 * `kind` dispatch and this component stays swappable.
 *
 * `alt` comes from the descriptor already generic ("Flag of a country") — it must
 * not name the answer, so the answer never reaches assistive tech or view-source.
 */
export function ImageAid({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="image-aid">
      <img className="image-aid__img" src={src} alt={alt} />
    </div>
  );
}
