import {useEffect, useMemo, useRef} from 'react';
import {createPortal} from 'react-dom';
import {WebMercatorViewport, lngLatToWorld} from '@math.gl/web-mercator';
import type {UhusData} from '../data/uhus';
import {useKepler} from './useKepler';

// Gu and dong names and dashed boundaries, drawn over the map. kepler's layers cannot
// dash a line, and the basemap's own labels and borders come from OpenStreetMap — not our
// 25 districts and 422 neighbourhoods — and sit under the data layers. So they are drawn
// here, on one transparent canvas above the map and below the panels, redrawn only when
// the camera moves — never on a playback step. The ~25k boundary points are turned into
// web-mercator world coordinates once; a redraw is then one matrix multiply per point
// (projecting each from longitude/latitude took 12–22 ms a redraw). It ignores the
// pointer, so hovering and clicking still reach the map.
//   names: district names on the whole city, neighbourhood names once zoomed in;
//   boundaries: districts in a dashed line, neighbourhoods in a finer one once zoomed in.
// Lines lie on the ground, so with the map tilted into 3D they would cut across raised
// areas; boundaries are left out then, the names stay.
export type Annotations = {names: boolean; boundaries: boolean; hexFar: boolean};   // hexFar: layers.ts cellView

const DONG_NAMES_FROM = 12;        // zoom at which neighbourhood names replace district names
const DONG_LINES_FROM = 11.2;      // zoom at which neighbourhood boundaries appear
// rings as flat [x0, y0, x1, y1, …] in world coordinates
type Shape = {name: string; centre: [number, number]; rings: Float64Array[]};

function shapesOf(table: any, nameField: string, places: {code: string; centre: [number, number]}[], codeField: string): Shape[] {
  const at = (n: string) => table.fields.findIndex((f: any) => f.name === n);
  const iGeo = at('_geojson'), iName = at(nameField), iCode = at(codeField);
  const centreOf = new Map(places.map((p) => [p.code, p.centre]));
  return table.rows.map((r: any[]) => {
    const g = r[iGeo]?.geometry ?? r[iGeo];
    const polys = g?.type === 'MultiPolygon' ? g.coordinates : g?.type === 'Polygon' ? [g.coordinates] : [];
    const rings = (polys.flat() as [number, number][][]).map((ring) => {
      const out = new Float64Array(ring.length * 2);
      ring.forEach((pt, i) => { const [x, y] = lngLatToWorld(pt); out[2 * i] = x; out[2 * i + 1] = y; });
      return out;
    });
    return {name: String(r[iName]), centre: centreOf.get(String(r[iCode])) ?? [0, 0], rings};
  });
}

export default function MapAnnotations({data, show}: {data: UhusData; show: Annotations}) {
  const kepler = useKepler();
  const m = kepler?.mapState;
  const canvas = useRef<HTMLCanvasElement>(null);
  const gus = useMemo(() => shapesOf(data.gu, 'gu_name', data.gus, 'gu_code'), [data]);
  const dongs = useMemo(() => shapesOf(data.dong, 'dong_name', data.dongs, 'dong_code'), [data]);
  const split = kepler?.visState?.splitMaps?.length ?? 0;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !m) return;
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth, H = window.innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!show.names && !show.boundaries) return;
    const tilted = (m.pitch ?? 0) > 2;
    // one viewport per map on screen: the whole map, or each half side by side
    const boxes = [...document.querySelectorAll('.kepler-gl .maps > div')].map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 1 && r.height > 1);
    for (const box of boxes.length ? boxes : [new DOMRect(0, 0, W, H)]) {
      const vp = new WebMercatorViewport({width: box.width, height: box.height, longitude: m.longitude, latitude: m.latitude,
        zoom: m.zoom, pitch: m.pitch ?? 0, bearing: m.bearing ?? 0});
      const px = (p: [number, number]) => { const [x, y] = vp.project(p); return [x + box.left, y + box.top]; };
      ctx.save();
      ctx.beginPath(); ctx.rect(box.left, box.top, box.width, box.height); ctx.clip();

      if (show.boundaries && !tilted) {
        // world → screen with the viewport's own matrix (flat map: no perspective divide needed,
        // but kept so it stays right)
        const M = vp.pixelProjectionMatrix;
        const stroke = (shapes: Shape[], width: number, colour: string, dash: number[]) => {
          ctx.lineWidth = width; ctx.strokeStyle = colour; ctx.setLineDash(dash);
          ctx.beginPath();
          for (const s of shapes) for (const ring of s.rings) {
            for (let i = 0; i < ring.length; i += 2) {
              const wx = ring[i], wy = ring[i + 1];
              const w = M[3] * wx + M[7] * wy + M[15];
              const x = (M[0] * wx + M[4] * wy + M[12]) / w + box.left, y = (M[1] * wx + M[5] * wy + M[13]) / w + box.top;
              if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
            }
          }
          ctx.stroke();
        };
        if (m.zoom >= DONG_LINES_FROM) stroke(dongs, 0.6, 'rgba(236, 240, 246, 0.28)', [2, 3]);
        stroke(gus, 1, 'rgba(236, 240, 246, 0.6)', [5, 4]);
        ctx.setLineDash([]);
      }

      if (show.names) {
        const dong = m.zoom >= DONG_NAMES_FROM;
        const shapes = dong ? dongs : gus;
        ctx.font = dong ? '500 10px "Manrope Variable", "Segoe UI", system-ui, sans-serif' : '700 10px "Manrope Variable", "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10, 12, 15, 0.75)';
        ctx.fillStyle = dong ? 'rgba(236, 240, 246, 0.82)' : 'rgba(236, 240, 246, 0.92)';
        // a name that would overlap one already placed is skipped
        const placed: [number, number, number, number][] = [];
        for (const s of shapes) {
          const [x, y] = px(s.centre);
          if (x < box.left - 40 || x > box.right + 40 || y < box.top - 20 || y > box.bottom + 20) continue;
          const text = dong ? s.name : s.name.toUpperCase();
          const w = ctx.measureText(text).width + (dong ? 0 : text.length * 1.2), h = 12;
          const r: [number, number, number, number] = [x - w / 2 - 3, y - h / 2, x + w / 2 + 3, y + h / 2];
          if (placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;
          placed.push(r);
          if (!dong) (ctx as any).letterSpacing = '1.2px';
          ctx.strokeText(text, x, y);
          ctx.fillText(text, x, y);
          (ctx as any).letterSpacing = '0px';
        }
      }
      ctx.restore();
    }
  }, [m?.longitude, m?.latitude, m?.zoom, m?.pitch, m?.bearing, m?.width, m?.height, split, show.names, show.boundaries, gus, dongs]);   // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(<canvas ref={canvas} className="map-annotations" aria-hidden />, document.body);
}
