import {HIGHLIGH_COLOR_3D} from '@kepler.gl/constants';
import {picking} from '@deck.gl/core';

// The colour a raised (3D) area takes under the pointer: pale gold at 55%, the low sun's
// colour (chosen from mockups/hover-3d.png).
//
// It has to be set in two places, before the map is first drawn (main.tsx imports this
// first). kepler hands deck.gl its HIGHLIGH_COLOR_3D, but deck.gl only passes a highlight
// colour on when the prop changes — and kepler's is the same array every time — so the
// layer rebuilt on the switch to 3D never gets it and falls back to the picking module's
// default, pure cyan. So the module's default becomes this colour too.
const HOVER_3D: [number, number, number, number] = [255, 236, 214, 140];

HIGHLIGH_COLOR_3D.splice(0, 4, ...HOVER_3D);

// deck.gl's own copy of luma.gl's picking module: with no options, its uniforms are the
// defaults — the cyan — so a call without options gets this colour instead.
const pickingModule = picking as any;
const ownUniforms = pickingModule.getUniforms;
pickingModule.getUniforms = (opts?: any) =>
  ownUniforms(opts ?? {pickingSelectedColor: null, pickingHighlightColor: HOVER_3D, pickingActive: false, pickingAttribute: false});
