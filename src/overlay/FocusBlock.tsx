import {Fragment, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useDispatch} from 'react-redux';
import {Filter, Link2, Settings, Unlink2} from 'lucide-react';
import {THEMES, VAR_BY_KEY, isTemporal, type Variable} from '../data/catalog';
import {displayNameOf, type Place, type UhusData} from '../data/uhus';
import type {Focus} from './Overlay';
import {useKepler} from './useKepler';
import {extentOf, fmt, focusValue, histogramOf, type Scope} from './focusValues';
import {dataIdFor, openMapSettings, selectionEntries, type Grain} from './layers';
import {BIVARIATE, PAIR_FIELD, cellOf, isBivariateLayer, isDailyBivariate} from './pair';
import InfoTip from './InfoTip';
import PlaceSentence from './PlaceSentence';
import RangeFilter from './RangeFilter';
import VarPicker from './VarPicker';
import {uiZoom} from './uiScale';
import {placeSeries} from './scatter';
import type {Ranges} from './ourFilters';

const THEME_LABEL = Object.fromEntries(THEMES.map((t) => [t.key, t.label]));
const DAY = 86400000;

type Props = {data: UhusData; focus: Focus; onSeoul: () => void; onGu: (g: Place) => void; onDong: (d: Place) => void;
  grain: Grain; onGrain: (g: Grain) => void; selection: string[]; linked: boolean; pairable: boolean; onLink: () => void;
  ranges: Ranges; onRange: (key: string, range: [number, number] | null) => void;
  onSelect: (key: string, as: 'main' | 'link') => void};

export default function FocusBlock({data, focus, onSeoul, onGu, onDong, grain, onGrain, selection, linked, pairable, onLink, ranges, onRange,
  onSelect}: Props) {
  const dispatch = useDispatch();
  const kepler = useKepler();
  const visState = kepler?.visState;

  const place = focus.level === 'seoul' ? 'Seoul' : focus.level === 'gu' ? focus.gu.name : focus.dong.name;
  const placeRef = useFitWidth(place);
  const crumbs = focus.level === 'seoul' ? [] : focus.level === 'gu' ? ['SEOUL'] : ['SEOUL', focus.gu.name.toUpperCase()];
  // a pair layer is built a moment after linking; its cards appear once it is there
  const onMap = selectionEntries(visState, selection, linked, grain, !!kepler?.mapState?.dragRotate).filter((e) => e.layer);
  const splitMaps: any[] = visState?.splitMaps || [];

  // A one-day playback window holds exactly one midnight — that is the date shown.
  const time = visState?.filters?.find((f: any) => f.id === 'time');
  const day = time?.value ? Math.ceil(time.value[0] / DAY) * DAY : null;

  // The atlas's own filter: a value range on each variable, opened from the card. How many
  // places pass both, at this grain (and, for a daily variable, on the playing day) — within
  // the district in focus when neighbourhoods are mapped, else across Seoul. Its bars too.
  const [filterOpen, setFilterOpen] = useState<Record<string, boolean>>({});
  // A card's name picks another variable for its place on the map — the main's card the
  // main, the second's the second — and "+ Compare with…" links one when there is only a
  // main. One selection: the drawer's marks and the map follow.
  const [picking, setPicking] = useState<{slot: 'main' | 'link'; left: number; top: number} | null>(null);
  const openPicker = (slot: 'main' | 'link') => (e: React.MouseEvent<HTMLElement>) => {
    if (picking?.slot === slot) { setPicking(null); return; }
    const r = e.currentTarget.getBoundingClientRect(), z = uiZoom();
    setPicking({slot, left: r.left / z, top: (r.bottom + 8) / z});
  };
  const pickVar = (key: string) => {
    const slot = picking?.slot;
    setPicking(null);
    if (!slot || key === selection[slot === 'main' ? 0 : 1]) return;
    // the second picked as the main swaps them, and so does the main picked as the second
    if (slot === 'link' && key === selection[0]) onSelect(selection[1], 'main');
    else onSelect(key, slot);
  };
  const anyFilter = Object.keys(ranges).length > 0 || Object.values(filterOpen).some(Boolean);
  const scopeGu = grain === 'dong' && focus.level !== 'seoul' ? focus.gu : null;
  const scopeDongs = useMemo(() => scopeGu ? new Set(data.dongs.filter((d) => d.guCode === scopeGu.code).map((d) => d.code)) : null,
    [scopeGu?.code, data]);   // eslint-disable-line react-hooks/exhaustive-deps
  const passed = anyFilter
    ? placeSeries(visState?.datasets, onMap.map((e) => e.variable).filter((x, i, a) => a.findIndex((y) => y.key === x.key) === i),
      grain, visState?.filters || [])[0] ?? null
    : null;
  const passing = passed && (scopeDongs ? [...passed.keys()].filter((c) => scopeDongs.has(c)).length : passed.size);
  const places = scopeDongs ? scopeDongs.size : grain === 'dong' ? data.dongs.length : data.gus.length;
  // a district-only variable (daily weather) has no neighbourhood rows: its district's rows
  const scopeOf = (source: any): Scope | undefined => !scopeGu || !scopeDongs ? undefined
    : source?.fields.some((f: any) => f.name === 'dong_code') ? {id: scopeGu.code, field: 'dong_code', codes: scopeDongs}
    : {id: scopeGu.code, field: 'gu_code', codes: new Set([scopeGu.code])};

  return (
    <section className="focus">
      <div className="crumbs">
        {crumbs.length ? crumbs.map((c, i) => (
          <button key={c} className="crumb" onClick={() => (i === 0 ? onSeoul() : focus.level === 'dong' && onGu(focus.gu))}>{c}</button>
        )) : <span className="crumb muted">SEOUL METROPOLITAN CITY</span>}
      </div>
      <h1 ref={placeRef} className="place">{place}</h1>
      <PlaceSentence data={data} focus={focus} grain={grain} onSeoul={onSeoul} onGu={onGu} onDong={onDong} onGrain={onGrain} />

      <div className="layer-cards">
        {onMap.map(({layer, variable: sel, pairPart}, i) => {
          const dataset = visState.datasets[layer.config.dataId];
          // the cells hold each place's value many times over: an average over them would weigh
          // a place by its area, so a card on the cells reads the places themselves
          const cells = layer.config.dataId.endsWith('_cells');
          // Colour by another column, picked in kepler's settings: the card shows that one —
          // what the map shows — named, valued and ranged as it is.
          const cf: string | undefined = !pairPart ? layer.config.colorField?.name : undefined;
          const recoloured = !!cf && cf !== sel.key && !!dataset?.fields.some((f: any) => f.name === cf);
          const x: Variable = recoloured ? (VAR_BY_KEY[cf!] ?? {...sel, key: cf!, short: displayNameOf(cf!), full: displayNameOf(cf!), unit: '', how: 'mean'}) : sel;
          // the daily pair's grid and raised areas sit on the areas; its values live in the daily rows
          const onLayer = dataset?.fields.some((f: any) => f.name === x.key);
          const areas = visState.datasets[grain];
          const source = recoloured ? (cells && areas?.fields.some((f: any) => f.name === x.key) ? areas : dataset)
            : !onLayer && isTemporal(x) ? visState.datasets[dataIdFor(x, grain)]
            : cells ? visState.datasets[isTemporal(x) ? dataIdFor(x, grain) : grain] : dataset;
          const value = focusValue(source, x.key, focus, x.how, visState.filters);
          const extent = extentOf(source, x.key);
          const colors: string[] = layer.config.visConfig?.colorRange?.colors || [];
          // A pair of variables shares one layer. In 2D each keeps its own axis of the
          // colour grid (A up the rows, B along the columns); in 3D A is colour, B height.
          const bivariate = !!pairPart && isBivariateLayer(layer);
          // B of a pair: the height of raised areas, or the size of daily points
          const size = pairPart === 'b' && layer.type === 'point';
          const height = pairPart === 'b' && !bivariate && !size;
          const grid = bivariate ? gridOf(layer) : BIVARIATE;
          const axis = bivariate ? (pairPart === 'a' ? grid.map((row) => row[0]) : grid[0]) : null;
          // side by side, each card says which half of the split map is its own
          const half = splitMaps.findIndex((m: any) => m.layers?.[layer.id]);
          const role = bivariate ? (pairPart === 'a' ? '↑ grid rows' : 'grid columns →')
            : height ? 'height' : size ? 'circle size' : pairPart === 'a' ? 'color' : splitMaps.length && half >= 0 ? (half === 0 ? '◧ left map' : 'right map ◨') : null;
          // Daily data exists per district only: at neighbourhood focus the value shown
          // is the district's, and the card has to say so rather than pass it off as local.
          const coarser = focus.level === 'dong' && !(source?.id ?? layer.config.dataId).startsWith('dong');
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
                <button className={`lc-name lc-pick${picking?.slot === (sel.key === selection[0] ? 'main' : 'link') ? ' open' : ''}`}
                  aria-haspopup="listbox" onClick={openPicker(sel.key === selection[0] ? 'main' : 'link')}
                  title={recoloured ? `Color set to ${x.short} in map settings (was ${sel.short}) — click for another variable` : 'Another variable here'}>
                  {x.long ?? x.short}
                </button>
                {VAR_BY_KEY[x.key] && <InfoTip x={x} />}
                <button className={`lc-filter${ranges[x.key] ? ' on' : ''}${filterOpen[x.key] ? ' open' : ''}`}
                  title={ranges[x.key] ? 'Filtered — click to edit' : 'Filter places by this value'} aria-pressed={!!ranges[x.key]}
                  onClick={() => setFilterOpen((o) => ({...o, [x.key]: !o[x.key]}))}>
                  <Filter size={12} strokeWidth={1.9} />
                </button>
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
                      {pairPart === 'a' && <BivariateGrid grid={grid} here={focusCell(layer, dataset, focus)} />}
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
              {extent && (filterOpen[x.key] || ranges[x.key]) && (
                <RangeFilter domain={extent} value={ranges[x.key] ?? null} hist={histogramOf(source, x.key, extent, 24, scopeOf(source))} unit={x.unit}
                  count={passing != null ? [passing, places] : null} where={scopeGu?.name} onChange={(r) => onRange(x.key, r)} />
              )}
            </article>
            </Fragment>
          );
        })}
        {onMap.length === 0 && <p className="empty-note">Nothing on the map. Open the bar below and turn a variable on.</p>}
        {selection.length === 1 && onMap.length > 0 && (
          <button className={`lc-compare${picking?.slot === 'link' ? ' open' : ''}`} onClick={openPicker('link')}>＋ Compare with…</button>
        )}
      </div>
      {picking && (
        <VarPicker left={picking.left} top={picking.top} current={selection[picking.slot === 'main' ? 0 : 1] ?? null} onMap={selection}
          onPick={pickVar} onClose={() => setPicking(null)}
          clear={picking.slot === 'link' && selection[1] ? {label: '✕  No comparison', onClick: () => { setPicking(null); onSelect(selection[1], 'link'); }} : undefined} />
      )}
    </section>
  );
}

// The 3×3 key of the bivariate map: A rises up the rows, B runs along the columns. The
// focused place's own cell is ringed, so the card says where it falls.
function BivariateGrid({grid, here}: {grid: string[][]; here: [number, number] | null}) {
  return (
    <div className="bi-grid" aria-hidden>
      {[2, 1, 0].map((la) => [0, 1, 2].map((lb) => (
        <i key={`${la}${lb}`} className={here && here[0] === la && here[1] === lb ? 'here' : ''} style={{background: grid[la][lb]}} />
      )))}
    </div>
  );
}

// The pair's nine colours as kepler holds them — a person may have changed them in the
// settings — in the order the pair wrote its classes (A's third, then B's). The daily
// pair recolours by place every day from the atlas's own nine, so it keeps those.
function gridOf(layer: any): string[][] {
  if (isDailyBivariate(layer)) return BIVARIATE;
  const range = layer.config.visConfig?.colorRange;
  const nine: string[] = range?.colorMap?.length === 9 ? range.colorMap.map((c: [string, string]) => c[1]) : range?.colors || [];
  return nine.length === 9 ? [nine.slice(0, 3), nine.slice(3, 6), nine.slice(6, 9)] : BIVARIATE;
}

// The focused place's cell: from the static pair's class label, or the daily pair's colour
// of the day (its colour map is keyed by place code).
function focusCell(layer: any, dataset: any, focus: Focus): [number, number] | null {
  const colorMap: [string, string][] = layer.config.visConfig?.colorRange?.colorMap || [];
  if (isDailyBivariate(layer)) {
    if (focus.level === 'seoul') return null;
    const byDong = layer.config.dataId === 'dong';
    if (byDong && focus.level !== 'dong') return null;   // a district holds many dong classes
    const code = byDong ? (focus as any).dong.code : focus.gu.code;
    return cellOf(colorMap.find((c) => c[0] === code)?.[1]);
  }
  const label = focusClass(dataset, focus);
  const at = label ? colorMap.findIndex((c) => c[0] === label) : -1;
  return at >= 0 ? [Math.floor(at / 3), at % 3] : null;
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

// The place name on one line at its full display size where it fits; a longer name
// (Gangnam-gu, Cheongunhyoja-dong) steps down until it does, never below MIN_PX.
// Measured again once the serif has loaded, as the fallback face runs narrower.
const MIN_PX = 30;
function useFitWidth(text: string) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';
      el.style.whiteSpace = '';
      const full = parseFloat(getComputedStyle(el).fontSize);
      if (el.scrollWidth <= el.clientWidth) return;
      el.style.fontSize = `${Math.max(MIN_PX, Math.floor(full * el.clientWidth / el.scrollWidth))}px`;
      if (el.scrollWidth > el.clientWidth) el.style.whiteSpace = 'normal';   // too long even at MIN_PX: wrap
    };
    fit();
    document.fonts?.ready.then(fit);
  }, [text]);
  return ref;
}
