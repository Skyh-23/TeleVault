/**
 * AuroraBackground — the floating pastel orb layer behind every screen.
 * Pure CSS animations for smooth 60fps drifting.
 */
export function AuroraBackground() {
  return (
    <div className="aurora-canvas" aria-hidden>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="orb orb-4" />
    </div>
  );
}
