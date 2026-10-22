import {useEffect, type ReactNode} from 'react';
import {X} from 'lucide-react';

// A full-screen page over the map (Data, About) — the earlier Seoul Data Atlas's credits
// overlay: a dark frosted scrim, one centred column that rises in, and ✕ at the top
// right. The top bar stays above it, so another tab is always one click away. Closes on
// ✕, a click on the scrim, or Escape.
export default function Page({label, onClose, children}: {label: string; onClose: () => void; children: ReactNode}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="page" role="dialog" aria-modal="true" aria-label={label}>
      <div className="page-scrim" onClick={onClose} />
      <button className="page-close" aria-label={`Close ${label}`} title="Close (Esc)" onClick={onClose}>
        <X size={18} strokeWidth={1.6} />
      </button>
      <div className="page-scroll" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="page-inner">{children}</div>
      </div>
    </div>
  );
}
