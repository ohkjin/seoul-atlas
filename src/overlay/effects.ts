import {addEffect, addLayer, layerVisConfigChange, removeEffect, removeLayer, updateLayerBlending} from '@kepler.gl/actions';
import {isOurs} from './layers';

type Dispatch = (a: any) => void;
type GetVisState = () => any;

// The night-city light of the earlier Seoul Data Atlas, with kepler's own means. 3D has two
// looks, picked in Settings → Effects:
//   glow  — kepler's layer blending set to additive, so where the raised areas overlap they
//           add up to light (the earlier atlas's "faux bloom");
//   solid — normal blending: the same areas in their own solid colours.
// Both have kepler's Light & Shadow effect (a low summer-afternoon sun shading the raised
// areas and casting their shadows) and its vignette (the edges drawn darker). The flat map
// has neither: the vignette's post-processing pass roughened the area borders, and additive
// blending makes the dark borders vanish — there only the bubbles glow.
//   halo  — under each bubble layer, a twin of it: the same data, larger and faint (the
//           earlier pointCore + pointHalo), lit up by the glow. A switch of its own.
export type Look3d = 'glow' | 'solid';
export type Fx = {look3d: Look3d; halo: boolean};
export const FX_DEFAULT: Fx = {look3d: 'solid', halo: true};
const LIGHT_ID = 'fx:light', VIGNETTE_ID = 'fx:vignette';
export const HALO_PREFIX = 'halo:';
export const isHaloId = (id: string) => id.startsWith(HALO_PREFIX);

export function syncEffects(dispatch: Dispatch, visState: any, fx: Fx, is3d: boolean) {
  // (not the halos: they are removed only after their bubbles, by syncHalos)
  const bubbles = (visState.layers || []).some((l: any) => l.type === 'point' && l.config.isVisible && !isHaloId(l.id));
  const blend = (is3d ? fx.look3d === 'glow' : bubbles) ? 'additive' : 'normal';
  if (visState.layerBlending !== blend) dispatch(updateLayerBlending(blend));
  const has = (id: string) => (visState.effects || []).some((e: any) => e.id === id);
  const want = (id: string, on: boolean, config: any) => {
    if (on && !has(id)) dispatch(addEffect({id, ...config}));
    if (!on && has(id)) dispatch(removeEffect(id));
  };
  // 1 Aug 2024, 16:30 in Seoul: the sun low in the west-southwest, long soft shadows
  want(LIGHT_ID, is3d, {type: 'lightAndShadow', parameters: {
    timestamp: Date.UTC(2024, 7, 1, 7, 30), timeMode: 'pick', shadowIntensity: 0.45,
    sunLightIntensity: 1, ambientLightIntensity: 0.85, sunLightColor: [255, 236, 214], ambientLightColor: [200, 214, 255]}});
  want(VIGNETTE_ID, is3d, {type: 'vignette', parameters: {amount: 0.55, radius: 0.62}});
}

// A halo's settings, from its bubble layer's: same data, columns, colour and size fields,
// three times the radius, faint; out of kepler's layer list and legend (hidden).
function haloConfigOf(base: any) {
  const c = base.config;
  const names = (cols: any) => Object.fromEntries(Object.entries(cols || {}).map(([k, v]: any) => [k, v?.value ?? v]));
  const vc = c.visConfig;
  return {
    id: HALO_PREFIX + base.id, type: 'point',
    config: {dataId: c.dataId, label: `${c.label} · halo`, columns: names(c.columns), isVisible: true, hidden: true,
      colorField: c.colorField ? {name: c.colorField.name, type: c.colorField.type} : null, colorScale: c.colorScale,
      sizeField: c.sizeField ? {name: c.sizeField.name, type: c.sizeField.type} : null, sizeScale: c.sizeScale,
      visConfig: {...vc, opacity: 0.16, outline: false, filled: true, radius: (vc.radius ?? 20) * 3,
        radiusRange: (vc.radiusRange ?? [6, 26]).map((r: number) => r * 3)}},
    visualChannels: {
      colorField: c.colorField ? {name: c.colorField.name, type: c.colorField.type} : null, colorScale: c.colorScale,
      sizeField: c.sizeField ? {name: c.sizeField.name, type: c.sizeField.type} : null, sizeScale: c.sizeScale}
  };
}
// what a halo must match: when its bubbles change any of it, the halo is rebuilt (its
// colours alone — the daily recolouring — are just passed on)
const haloShape = new Map<string, string>();   // halo id → the bubble shape it was built for
const shapeOf = (l: any) => [l.config.dataId, l.config.colorField?.name, l.config.colorScale, l.config.sizeField?.name,
  l.config.sizeScale].join('|');

// One halo per visible bubble layer of the atlas's, kept in step with it; none when off.
export function syncHalos(dispatch: Dispatch, get: GetVisState, on: boolean) {
  const vs = get();
  const bases = on ? vs.layers.filter((l: any) => l.type === 'point' && isOurs(l.id) && l.config.isVisible) : [];
  const wanted = new Map(bases.map((b: any) => [HALO_PREFIX + b.id, b]));
  for (const l of vs.layers) {
    if (!isHaloId(l.id)) continue;
    const base: any = wanted.get(l.id);
    if (!base || shapeOf(base) !== haloShape.get(l.id)) { dispatch(removeLayer(l.id)); haloShape.delete(l.id); }
  }
  for (const [id, base] of wanted as Map<string, any>) {
    const halo = get().layers.find((l: any) => l.id === id);
    if (!halo) {
      dispatch(addLayer(haloConfigOf(base) as any, base.config.dataId));
      haloShape.set(id, shapeOf(base));
      continue;
    }
    const colours = base.config.visConfig.colorRange;
    if (JSON.stringify(halo.config.visConfig.colorRange) !== JSON.stringify(colours)) {
      dispatch(layerVisConfigChange(halo, {colorRange: colours}));
    }
  }
}
