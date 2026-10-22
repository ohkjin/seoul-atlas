import {applyMiddleware, combineReducers, compose, createStore} from 'redux';
import keplerGlReducer, {enhanceReduxMiddleware, INITIAL_UI_STATE} from '@kepler.gl/reducers';

// Every built-in map control is hidden: the top bar and the Focus block own those
// jobs, and kepler's own buttons would all land in the top-right corner that the
// 2D graph card needs. Spread the defaults so each control keeps its other keys.
const hiddenControls = Object.fromEntries(
  Object.entries(INITIAL_UI_STATE.mapControls).map(([k, v]) => [k, {...(v as object), show: false}])
);

const reducers = combineReducers({
  keplerGl: keplerGlReducer.initialState({
    uiState: {
      readOnly: false,          // the layer settings panel must stay reachable from the gear button
      currentModal: null,
      activeSidePanel: null,    // closed until a gear button opens it
      mapControls: hiddenControls
    }
  })
});

const middlewares = enhanceReduxMiddleware([]);

export const store = createStore(reducers, {}, compose(applyMiddleware(...middlewares)));
export type RootState = ReturnType<typeof store.getState>;
