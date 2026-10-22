import './kepler/hoverColour';   // first: before the map is drawn (see the file)
import ReactDOM from 'react-dom/client';
import {Provider} from 'react-redux';
import {store} from './store';
import App from './App';
import '@fontsource-variable/manrope';
import './styles.css';

// Dev-only handles so the browser console can inspect kepler's state and the layout.
if (import.meta.env.DEV) {
  (window as any).__store = store;
  import('./dev/overlaps').then((m) => { (window as any).__overlaps = m.overlaps; });
}

// No <StrictMode>: it runs effects twice in development, and kepler's addDataToMap is
// not idempotent — the second run would add every dataset and layer again.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <App />
  </Provider>
);
