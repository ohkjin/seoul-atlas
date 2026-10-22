import {Fragment} from 'react';
import {useDispatch} from 'react-redux';
import {Link2, Settings, Unlink2} from 'lucide-react';
import {THEMES, isTemporal} from '../data/catalog';
import type {Place, UhusData} from '../data/uhus';
import type {Focus} from './Overlay';
import {useKepler} from './useKepler';
import {extentOf, fmt, focusValue} from './focusValues';
import {openMapSettings, selectionEntries, type Grain} from './layers';
import {BIVARIATE, PAIR_FIELD} from './pair';
import InfoTip from './InfoTip';

const THEME_LABEL = Object.fromEntries(THEMES.map((t) => [t.key, t.label]));
const DAY = 86400000;

type Props = {data: UhusData; focus: Focus; onSeoul: () => void; onGu: (g: Place) => void; onDong: (d: Place) => void;
  grain: Grain; onGrain: (g: Grain) => void; selection: string[]; linked: boolean; pairable: boolean; onLink: () => void};

export default function FocusBlock({data, focus, onSeoul, onGu, onDong, grain, onGrain, selection, linked, pairable, onLink}: Props) {
  const dispatch = useDispatch();
  const kepler = useKepler();
  const visState = kepler?.visState;

  const place = focus.level === 'seoul' ? 'Seoul' : focus.level === 'gu' ? focus.gu.name : focus.dong.name;
  const crumbs = focus.level === 'seoul' ? [] : focus.level === 'gu' ? ['SEOUL'] : ['SEOUL', focus.gu.name.toUpperCase()];
  const guCode = focus.level === 'seoul' ? '' : focus.gu.code;
  const dongsInGu = guCode ? data.dongs.filter((d) => d.guCode === guCode) : [];
  // a pair layer is built a moment after linking; its cards appear once it is there
  const onMap = selectionEntries(visState, selection, linked, grain, !!kepler?.mapState?.dragRotate).filter((e) => e.layer);
  const splitMaps: any[] = visState?.splitMaps || [];

  // A one-day playback window holds exactly one midnight — that is the date shown.
  const time = visState?.filters?.find((f: any) => f.id === 'time');
  const day = time?.value ? Math.ceil(time.value[0] / DAY) * DAY : null;

  return (
    <section className="focus">
      <div className="crumbs-row">
        <div className="crumbs">
          {crumbs.length ? crumbs.map((c, i) => (
            <button key={c} className="crumb" onClick={() => (i === 0 ? onSeoul() : focus.level === 'dong' && onGu(focus.gu))}>{c}</button>
          )) : <span className="crumb muted">SEOUL METROPOLITAN CITY</span>}
        </div>
        <div className="grain" role="group" aria-label="Map detail" title="Map detail — draw the map per district or per neighbourhood">
          {(['gu', 'dong'] as Grain[]).map((g) => (
            <button key={g} className={g === grain ? 'on' : ''} aria-pressed={g === grain} onClick={() => onGrain(g)}>
              {g === 'gu' ? 'Gu' : 'Dong'}
            </button>
          ))}
        </div>
      </div>
      <h1 className="place">{place}</h1>

      <div className="pickers">
        <select value={guCode} onChange={(e) => {
          const g = data.gus.find((x) => x.code === e.target.value);
          if (g) onGu(g); else onSeoul();
        }}>
          <option value="">All gu</option>
          {data.gus.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
        </select>
        <select value={focus.level === 'dong' ? focus.dong.code : ''} disabled={!guCode} onChange={(e) => {
          const d = dongsInGu.find((x) => x.code === e.target.value);
          if (d) onDong(d); else if (focus.level !== 'seoul') onGu(focus.gu);
        }}>
          <option value="">{guCode ? 'All dong' : 'Pick a gu first'}</option>
          {dongsInGu.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
        </select>
      </div>

      <div className="layer-cards">
        {onMap.map(({layer, variable: x, pairPart}, i) => {
          const dataset = visState.datasets[layer.config.dataId];
          const value = focusValue(dataset, x.key, focus, x.how, visState.filters);
          const extent = extentOf(dataset, x.key);
          const colors: string[] = layer.config.visConfig?.colorRange?.colors || [];
          // A pair of variables shares one layer. In 2D each keeps its own axis of the
          // colour grid (A up the rows, B along the columns); in 3D A is colour, B height.
          const bivariate = !!pairPart && layer.config.colorField?.name === PAIR_FIELD;
          // B of a pair: the height of raised areas, or the size of daily points
          const size = pairPart === 'b' && layer.type === 'point';
          const height = pairPart === 'b' && !bivariate && !size;
          const axis = bivariate ? (pairPart === 'a' ? BIVARIATE.map((row) => row[0]) : BIVARIATE[0]) : null;
          // side by side, each card says which half of the split map is its own
          const half = splitMaps.findIndex((m: any) => m.layers?.[layer.id]);
          const role = bivariate ? (pairPart === 'a' ? '↑ grid rows' : 'grid columns →')
            : height ? 'height' : size ? 'circle size' : pairPart === 'a' ? 'colour' : splitMaps.length && half >= 0 ? (half === 0 ? '◧ left map' : 'right map ◨') : null;
          // Daily data exists per district only: at neighbourhood focus the value shown
          // is the district's, and the card has to say so rather than pass it off as local.
          const coarser = focus.level === 'dong' && !layer.config.dataId.startsWith('dong');
          // Each variable has its own point in time: daily data shows the playing day,
          // static data the year its source names. No year in the source → no date shown.
          const when = isTemporal(x)
            ? (day != null ? new Date(day).toISOString().slice(0, 10) : null)
            : (x.source.match(/\b(19|20)\d{2}\b/)?.[0] ?? null);
          return (
            <Fragment key={`${layer.id}:${x.key}`}>
            {/* between two neighbourhood cards: one shared map, or two maps side by side */}
            {i === 1 && pairable && (
              <button className={`link-btn${linked ? ' on' : ''}`} onClick={onLink} aria-pressed={linked}
                title={linked ? 'Show them side by side, each with its own settings' : 'Combine them into one map'}>
                {linked ? <Link2 size={15} strokeWidth={1.75} /> : <Unlink2 size={15} strokeWidth={1.75} />}
                <span>{linked ? 'Linked · one map' : 'Side by side'}</span>
              </button>
            )}
            {/* hidden with the eye in kepler's panel: still selected, shown dimmed */}
            <article className={`layer-card${layer.config.isVisible ? '' : ' off'}`}
              title={layer.config.isVisible ? undefined : 'Hidden in map settings'}>
              <div className="lc-meta">
                <span className="lc-theme">{THEME_LABEL[x.theme]}</span>
                {when && <span className="lc-date">{when}</span>}
                {/* one way into kepler's settings for the whole map, on the first card */}
                {i === 0 && (
                  <button className="icon-btn sm lc-settings" title="Map layer settings" aria-label="Map layer settings"
                    onClick={() => openMapSettings(dispatch, visState)}>
                    {/* an SVG gear: the ⚙ glyph drew thin and faint at this size */}
                    <Settings size={19} strokeWidth={1.75} />
                  </button>
                )}
              </div>
              <div className="lc-row">
                <span className="lc-name">{x.short}</span>
                <InfoTip x={x} />
              </div>
              <div className="lc-value">
                {fmt(value)}
                {x.unit !== 'ratio' && <span className="lc-unit">{x.unit}</span>}
                <span className="lc-how">{coarser ? 'district value' : x.how}</span>
              </div>
              {extent && (height || size || colors.length > 0) && (
                <div className="legend">
                  {axis ? (
                    <div className="legend-axis">
                      <div className="legend-steps">{axis.map((c) => <i key={c} style={{background: c}} />)}</div>
                      {pairPart === 'a' && <BivariateGrid focusClass={focusClass(dataset, focus)} labels={layer.config.visConfig?.colorRange?.colorMap} />}
                    </div>
                  ) : height
                    ? <div className="legend-heights" aria-hidden><i /><i /><i /><i /><i /></div>
                    : size
                    ? <div className="legend-sizes" aria-hidden><i /><i /><i /><i /></div>
                    : <div className="legend-bar" style={{background: `linear-gradient(90deg, ${colors.join(', ')})`}} />}
                  <div className="legend-ends">
                    <span>{fmt(extent[0])}</span>
                    {/* how the circles carry this variable: its size, its colour, or both */}
                    {role && <span className="legend-size">{role}</span>}
                    <span>{fmt(extent[1])}</span>
                  </div>
                </div>
              )}
            </article>
            </Fragment>
          );
        })}
        {onMap.length === 0 && <p className="empty-note">Nothing on the map. Open the bar below and turn a variable on.</p>}
      </div>
    </section>
  );
}

// The 3×3 key of the bivariate map: A rises up the rows, B runs along the columns. The
// focused place's own cell is ringed, so the card says where it falls.
function BivariateGrid({focusClass, labels}: {focusClass: string | null; labels?: [string, string][]}) {
  return (
    <div className="bi-grid" aria-hidden>
      {[2, 1, 0].map((la) => [0, 1, 2].map((lb) => {
        const label = labels?.[la * 3 + lb]?.[0];
        return <i key={`${la}${lb}`} className={label && label === focusClass ? 'here' : ''} style={{background: BIVARIATE[la][lb]}} />;
      }))}
    </div>
  );
}

// The bivariate class of the focused dong or district, read from the pair's dataset.
function focusClass(dataset: any, focus: Focus): string | null {
  if (!dataset || focus.level === 'seoul') return null;
  const byDong = focus.level === 'dong' && dataset.id.startsWith('dong');
  const codeName = byDong ? 'dong_code' : 'gu_code';
  const code = byDong ? (focus as any).dong.code : focus.gu.code;
  if (!byDong && dataset.id.startsWith('dong')) return null;   // a district holds many dong classes
  const fields = dataset.fields;
  const ci = fields.findIndex((f: any) => f.name === codeName), bi = fields.findIndex((f: any) => f.name === PAIR_FIELD);
  const dc = dataset.dataContainer;
  for (let r = 0; r < dc.numRows(); r++) if (String(dc.valueAt(r, ci)) === code) return dc.valueAt(r, bi);
  return null;
}
