import {ArrowUpRight, Link2} from 'lucide-react';
import {VAR_BY_KEY} from '../../data/catalog';
import {KIND_LABEL, ROLES, SOURCES, periodTextOf, type DataSource} from '../../data/sources';
import {PROJECTS} from '../../data/projects';
import InfoTip from '../InfoTip';
import Page from './Page';

type Props = {selection: string[]; onSelect: (key: string) => void; onClose: () => void; only?: string | null};

// Every dataset behind the atlas, in two parts: Public — open data about Seoul, as its
// publisher gives it — and Research — each study, what it asks and over which period, and
// under it the data it is built on (its own and what it was given), grouped by the part each
// plays in it. Public data links to its original portal; a variable chip links it to the map.
export default function DataPage({selection, onSelect, onClose, only = null}: Props) {
  // linking a variable sends you back to the map to see it; unlinking stays here
  const pick = (key: string) => {
    const linking = !selection.includes(key);
    onSelect(key);
    if (linking) onClose();
  };
  const card = (s: DataSource) => <Card key={s.id} s={s} selection={selection} onPick={pick} out={!!only && !s.projects.includes(only)} />;
  const pub = SOURCES.filter((s) => s.kind === 'public');
  return (
    <Page label="Data" onClose={onClose}>
      <div className="page-eyebrow">Data</div>
      <h1 className="page-title">What the atlas is made of</h1>
      <p className="page-lede">
        Public data about Seoul, and the studies built on it. Each study names its question, its period and the data it
        uses; the public data says which studies use it.
      </p>
      <section className="page-section dp-part">
        <PartHead title="Public" sub="Open data about Seoul, as published" count={`${pub.length} dataset${pub.length === 1 ? '' : 's'}`} />
        <div className="ds-grid">{pub.map(card)}</div>
      </section>
      <section className="page-section dp-part">
        <PartHead title="Research" sub="The lab’s studies, and the data each is built on" count={`${PROJECTS.length} stud${PROJECTS.length === 1 ? 'y' : 'ies'}`} />
        {PROJECTS.map((p) => {
          const own = SOURCES.filter((s) => s.kind !== 'public' && s.projects.includes(p.id));
          return (
            <div key={p.id} className={`dp-study${only && only !== p.id ? ' out' : ''}`}>
              <div className="dp-head">
                <div className="dp-kicker">✧ Study</div>
                <h3 className="dp-name">{p.id} · {p.name}</h3>
                <p className="dp-about">{p.about}</p>
                <dl className="dp-meta">
                  <div><dt>Question</dt><dd>{p.question}</dd></div>
                  <div><dt>Index</dt><dd>{p.index}</dd></div>
                  <div><dt>Data</dt><dd>{p.data}</dd></div>
                  <div><dt>Period</dt><dd>{p.period}</dd></div>
                  <div><dt>By</dt><dd>{p.by}</dd></div>
                </dl>
              </div>
              {ROLES.filter(({role}) => own.some((s) => s.role === role)).map(({role, sub}) => (
                <div key={role} className="dp-role">
                  <h4 className="dp-role-h">{role}<span> — {sub}</span></h4>
                  <div className="ds-grid">{own.filter((s) => s.role === role).map(card)}</div>
                </div>
              ))}
            </div>
          );
        })}
        <p className="dp-soon">✧ More studies coming</p>
      </section>
      <div className="page-foot">
        <p>
          Public sources: Korea Meteorological Administration (KMA), Seoul Open Data Plaza, Environmental Geographic
          Information Service (EGIS), Ministry of Land, Infrastructure and Transport (MOLIT) and Seoul Metro. Card sales:
          Seoul AI Foundation. Basemap © CARTO, © OpenStreetMap contributors.
        </p>
        <p>Values are exploratory research outputs, not operational estimates. Check each source's license and attribution before reuse.</p>
      </div>
    </Page>
  );
}

// a part's title — the biggest thing after the page title, so the split between the parts reads
function PartHead({title, sub, count}: {title: string; sub: string; count: string}) {
  return (
    <header className="dp-part-head">
      <div className="dp-part-row"><h2 className="dp-part-h">{title}</h2><span className="dp-part-count">{count}</span></div>
      <p className="dp-part-sub">{sub}</p>
    </header>
  );
}

function Card({s, selection, onPick, out = false}: {s: DataSource; selection: string[]; onPick: (key: string) => void; out?: boolean}) {
  return (
    <article className={`ds-card${out ? ' out' : ''}`}>
      <header className="ds-head">
        <h3>{s.title}</h3>
        <span className={`ds-kind ${s.kind}`}>{KIND_LABEL[s.kind]}</span>
      </header>
      <div className="ds-file">{s.file}</div>
      <p className="ds-desc">{s.description}</p>
      {s.how && <p className="ds-how"><b>How it was made</b> {s.how}</p>}
      <dl className="ds-meta">
        <div><dt>Unit</dt><dd>{s.space}</dd></div>
        <div><dt>Period</dt><dd>{periodTextOf(s)}</dd></div>
        <div><dt>Source</dt><dd>{s.source}</dd></div>
        {/* public data: which studies use it (a study's own data sits under that study) */}
        {s.kind === 'public' && s.projects.length > 0 && <div><dt>Used by</dt><dd>{s.projects.join(', ')}</dd></div>}
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
                  <button onClick={() => onPick(k)} title={selection[0] === k ? 'On the map, as the main' : on ? 'Linked to the map — click to unlink' : 'Link to the map'}>
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
