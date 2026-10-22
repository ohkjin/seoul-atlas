// kepler's settings panel in the dashboard's look, through kepler's own theme prop:
// these keys overwrite its base theme (@kepler.gl/styles base.js). Derived keys there are
// plain values, not references — selectBackground does not follow inputBgd — so every
// one that should change is listed. Same ink, glass and amber accent as the overlay.
const ink = '#eef2f7', ink2 = '#a9b2bf', ink3 = '#6f7886';
const accent = '#e8a35c', accentHover = '#f0b779', onAccent = '#16191e';
const line = 'rgba(255, 255, 255, 0.08)';
const fill = 'rgba(255, 255, 255, 0.06)', fillHover = 'rgba(255, 255, 255, 0.1)';
const focusRing = 'rgba(232, 163, 92, 0.6)';
const font = "'Inter Variable', Inter, Pretendard, system-ui, sans-serif";

export const keplerTheme = {
  fontFamily: font, btnFontFamily: font,

  textColor: ink2, textColorHl: ink, titleTextColor: ink, labelColor: ink3, labelHoverColor: ink2,
  subtextColor: ink3, subtextColorActive: ink,
  activeColor: accent, activeColorHover: accentHover,
  borderRadius: '8px', borderColor: line,

  // the panel itself is glass: translucent here, blurred in styles.css
  sidePanelBg: 'rgba(16, 19, 24, 0.66)', sidePanelHeaderBg: 'transparent', sidePanelBorderColor: 'transparent',
  sidePanelScrollBarWidth: 8,
  panelBackground: 'rgba(255, 255, 255, 0.045)', panelContentBackground: 'rgba(255, 255, 255, 0.025)',
  panelBackgroundHover: 'rgba(255, 255, 255, 0.08)', panelBorderColor: line,
  panelBorderRadius: '14px', panelHeaderBorderRadius: '14px', panelBoxShadow: 'none',
  panelHeaderIcon: ink3, panelHeaderIconActive: ink2, panelHeaderIconHover: ink, panelTabColor: ink3,
  chickletBgd: fillHover,

  inputBgd: fill, inputBgdHover: fillHover, inputBgdActive: fillHover, inputColor: ink,
  inputBorderColor: 'transparent', inputBorderHoverColor: line, inputBorderActiveColor: focusRing,
  inputBorderRadius: '8px', inputPlaceholderColor: ink3,
  secondaryInputBgd: fill, secondaryInputBgdHover: fillHover, secondaryInputBgdActive: fillHover,
  secondaryInputColor: ink, secondaryInputBorderColor: 'transparent', secondaryInputBorderActiveColor: focusRing,
  selectColor: ink, selectBackground: fill, selectBackgroundHover: fillHover,
  selectBorderRadius: '8px', selectActiveBorderColor: focusRing,
  dropdownListBgd: 'rgba(20, 23, 28, 0.97)', dropdownListHighlightBg: fillHover, dropdownListBorderTop: line,
  dropdownListShadow: '0 18px 40px -12px rgba(0, 0, 0, 0.6)',

  primaryBtnBgd: accent, primaryBtnActBgd: accentHover, primaryBtnBgdHover: accentHover,
  primaryBtnColor: onAccent, primaryBtnActColor: onAccent, primaryBtnRadius: '999px',
  ctaBtnBgd: accent, ctaBtnActBgd: accentHover, ctaBtnBgdHover: accentHover, ctaBtnColor: onAccent, ctaBtnActColor: onAccent,
  secondaryBtnBgd: fillHover, secondaryBtnActBgd: 'rgba(255, 255, 255, 0.16)', secondaryBtnBgdHover: 'rgba(255, 255, 255, 0.16)',
  secondaryBtnColor: ink, secondaryBtnActColor: ink,
  linkBtnColor: ink2, linkBtnActColor: ink,

  switchTrackBgd: 'rgba(255, 255, 255, 0.12)', switchTrackBgdActive: accent, switchTrackBorderRadius: '999px',
  switchBtnBgd: ink2, switchBtnBgdActive: '#ffffff', switchBtnBorderRadius: '999px',
  switchBtnBoxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
  secondarySwitchTrackBgd: 'rgba(255, 255, 255, 0.08)', secondarySwitchBtnBgd: ink3,
  sliderBarColor: accent, sliderBarBgd: 'rgba(255, 255, 255, 0.12)', sliderBarHoverColor: accentHover, sliderBarRadius: '999px',
  sliderHandleColor: ink, sliderHandleTextColor: ink, sliderHandleHoverColor: '#ffffff', sliderInactiveBorderColor: ink,
  sliderBorderRadius: '999px', sliderHandleShadow: '0 1px 4px rgba(0, 0, 0, 0.5)',
  checkboxBoxBgdChecked: accent, checkboxBorderRadius: '4px', radioButtonBgdColor: accent,

  // small hint bubbles and map panels; the hover tooltip itself uses panelBackground,
  // so styles.css gives .map-popover its own darker background
  tooltipBg: 'rgba(20, 23, 28, 0.97)',
  mapPanelBackgroundColor: 'rgba(16, 19, 24, 0.86)', mapPanelHeaderBackgroundColor: 'rgba(255, 255, 255, 0.04)',

  // the export dialogs (opened from Settings) are kepler's light-theme modals: the *LT keys
  // are their colours, turned dark here; styles.css darkens the dialog box itself
  modalTitleColor: ink, modalFooterBgd: 'transparent', modalImagePlaceHolder: fill, modalOverlayBgd: 'rgba(3, 5, 10, 0.6)',
  modalDropdownBackground: 'rgba(20, 23, 28, 0.97)',
  textColorLT: ink2, titleColorLT: ink, labelColorLT: ink3, subtextColorLT: ink3, textColorHlLT: ink, activeColorLT: accent,
  borderColorLT: line, panelBackgroundLT: fill, panelBorderLT: '1px solid ' + line, chickletBgdLT: fillHover,
  inputBgdActiveLT: fillHover, inputBorderActiveColorLT: focusRing, inputPlaceholderColorLT: ink3,
  selectColorLT: ink, selectColorPlaceHolderLT: ink3, selectBackgroundLT: fill, selectBackgroundHoverLT: fillHover, selectBorderColorLT: line,
  dropdownListBgdLT: 'rgba(20, 23, 28, 0.97)', dropdownListHighlightBgLT: fillHover, dropdownListBorderTopLT: line,
  checkboxBorderColorLT: ink3, scrollbarThumbColorLT: 'rgba(255, 255, 255, 0.16)', scrollbarThumbColorHoverLT: 'rgba(255, 255, 255, 0.34)',
  selectionBtnColor: ink2, selectionBtnBorderColor: line, selectionBtnActColor: accent, selectionBtnBorderActColor: accent,
  selectionBtnBgdHover: fillHover
};
