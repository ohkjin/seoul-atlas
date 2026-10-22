import {ArrowUpRight, Link2} from 'lucide-react';
import {VAR_BY_KEY} from '../../data/catalog';
import {KIND_LABEL, ROLES, SOURCES, type DataSource} from '../../data/sources';
import InfoTip from '../InfoTip';
import Page from './Page';

type Props = {selection: string[]; onSelect: (key: string) => void; onClose: () => void};

// Every dataset behind the atlas, grouped by the part it plays in the study: what it is,
// where it comes from, how the project made it, and the variables it gives the map.
// Public data links to its original portal; a variable chip links it to the map.
export default function DataPage({selection, onSelect, onClose}: Props) {
  // linking a variable sends you back to the map to see it; unlinking stays here
  const pick = (key: string) => {
    const linking = !selection.includes(key);
    onSelect(key);
    if (linking) onClose();
  };
  return (
    <Page label="Data" onClose={onClose}>
      <div className="page-eyebrow">Data</div>
      <h1 className="page-title">What the atlas is made of</h1>
      <p className="page-lede">
        All of it for 2024: daily weather and card sales for every neighbourhood, the heat-sensitivity index the study
        derives from them, and the urban context that helps explain it.
      </p>
      {ROLES.map(({role, sub}) => {
        const items = SOURCES.filter((s) => s.role === role);
        return (
          <section key={role} className="page-section">
            <h2 className="page-h">{role}<span> — {sub}</span></h2>
            <div className="ds-grid">{items.map((s) => <Card key={s.id} s={s} selection={selection} onPick={pick} />)}</div>
          </section>
        );
      })}
      <div className="page-foot">
        <p>
          Public sources: Korea Meteorological Administration (KMA), Seoul Open Data Plaza, Environmental Geographic
          Information Service (EGIS), Ministry of Land, Infrastructure and Transport (MOLIT) and Seoul Metro. Card sales:
          Seoul AI Foundation. Basemap © CARTO, © OpenStreetMap contributors.
        </p>
        <p>Values are exploratory research outputs, not operational estimates. Check each source's licence and attribution before reuse.</p>
      </div>
    </Page>
  );
}

function Card({s, selection, onPick}: {s: DataSource; selection: string[]; onPick: (key: string) => void}) {
  return (
    <article className="ds-card">
      <header className="ds-head">
        <h3>{s.title}</h3>
        <span className={`ds-kind ${s.kind}`}>{KIND_LABEL[s.kind]}</span>
      </header>
      <div className="ds-file">{s.file}</div>
      <p className="ds-desc">{s.description}</p>
      {s.how && <p className="ds-how"><b>How it was made</b> {s.how}</p>}
      <dl className="ds-meta">
        <div><dt>Unit</dt><dd>{s.space}</dd></div>
        <div><dt>Period</dt><dd>{s.time}</dd></div>
        <div><dt>Source</dt><dd>{s.source}</dd></div>
      </dl>
      {s.vars.length > 0 && (
        <div className="ds-vars">
          <div className="ds-sub">In this atlas</div>
          <div className="ds-chips">
            {s.vars.map((k) => {
              const x = VAR_BY_KEY[k];
              if (!x) return null;
              const on = selection.includes(k);
              return (
                <span key={k} className={`ds-chip${on ? ' on' : ''}`}>
                  <button onClick={() => onPick(k)} title={on ? 'Linked to the map — click to unlink' : 'Link to the map'}>
                    <Link2 size={12} strokeWidth={1.8} />{x.short}
                  </button>
                  <InfoTip x={x} />
                </span>
              );
            })}
          </div>
        </div>
      )}
      {s.links && (
        <div className="ds-links">
          {s.links.map((l) => (
            <a key={l.url + l.label} href={l.url} target="_blank" rel="noopener noreferrer">{l.label}<ArrowUpRight size={13} strokeWidth={1.8} /></a>
          ))}
        </div>
      )}
    </article>
  );
}
