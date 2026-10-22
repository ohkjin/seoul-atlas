import {FlyToInterpolator} from '@deck.gl/core';
import {fitBounds as fitViewport} from '@math.gl/web-mercator';
import {updateMap} from '@kepler.gl/actions';
import type {Bounds} from '../data/uhus';

// kepler has no camera transitions: fitBounds/updateMap jump straight to the target.
// So the flight is driven here — one updateMap per frame along deck.gl's fly-to curve,
// the same per-frame state update kepler already does while the user drags the map.
const interpolator = new FlyToInterpolator({speed: 1.6});
const DURATION_MS = 900;
let raf = 0;

type View = {latitude: number; longitude: number; zoom: number};

export function cancelFlight() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

// The part of the map NOT covered by our panels. Fitting a region to the whole
// canvas (what kepler's own fitBounds does) parks it under the Focus block or bar.
function unobstructedPadding(width: number, height: number) {
  const r = (sel: string) => {
    const el = document.querySelector(sel);
    if (!el || getComputedStyle(el).display === 'none') return null;
    const b = el.getBoundingClientRect();
    return b.width > 1 && b.height > 1 ? b : null;
  };
  const top = r('.topbar'), focus = r('.focus'), graph = r('.graph-card'), bar = r('.drawer-cols');
  const time = r('.time-card');
  const m = 24;
  // Side by side, both halves share one view and start right of the Focus text (see
  // styles.css), so nothing covers their left; the right panels still cover the right
  // half's right edge, which is the window's.
  const split = document.body.classList.contains('kepler-split');
  const right = window.innerWidth;
  const pad = {
    top: (top ? top.bottom : 0) + m,
    left: (!split && focus ? focus.right : 0) + m,
    right: right - Math.min(graph ? graph.left : right, time ? time.left : right) + m,
    bottom: height - (bar ? bar.top : height) + m
  };
  // If the panels leave too little room (small screens), fall back to an even margin.
  if (width - pad.left - pad.right < 160 || height - pad.top - pad.bottom < 160) return 40;
  return pad;
}

export function flyToBounds(dispatch: (a: any) => void, mapState: any, bounds: Bounds) {
  const {width, height} = mapState;
  const target = fitViewport({
    width, height,
    bounds: [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
    padding: unobstructedPadding(width, height),
    maxZoom: 15
  });
  flyToView(dispatch, mapState, target);
}

export function flyToView(dispatch: (a: any) => void, mapState: any, target: View) {
  cancelFlight();
  const start = {...mapState};
  const end = {...mapState, ...target};
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / DURATION_MS);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   // ease-in-out
    const p = interpolator.interpolateProps(start, end, e);
    dispatch(updateMap({latitude: p.latitude, longitude: p.longitude, zoom: p.zoom}));
    raf = t < 1 ? requestAnimationFrame(step) : 0;
  };
  raf = requestAnimationFrame(step);
}
