/**
 * The empty-but-present pane a surface shows until its ticket fills it in. It
 * keeps the shell navigable end-to-end (#135) while #136–#144 land the real
 * surfaces one at a time — a placeholder, not a stub that looks broken.
 */
export function Placeholder({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section className="admin-surface" aria-labelledby={`surface-${title}`}>
      <h1 id={`surface-${title}`} className="admin-surface__title">
        {title}
      </h1>
      <p className="admin-surface__placeholder">{children ?? "Coming soon."}</p>
    </section>
  );
}
