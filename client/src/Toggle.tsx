/** An on/off switch drawn as a sliding knob, with its label beside it. */
export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (on: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" className="toggle" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="toggle-track">
        <span className="toggle-knob" />
      </span>
      <span className="toggle-text">
        <span>{label}</span>
        {hint && <span className="muted small">{hint}</span>}
      </span>
    </button>
  );
}
