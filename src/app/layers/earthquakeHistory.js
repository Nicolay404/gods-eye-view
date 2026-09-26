import { createEarthquakesLayer } from '../../layers/earthquakes/index.js';
import {
  earthquakeHistoryQuery,
  viewRectangleDegrees,
} from '../../layers/earthquakes/history.js';
import { overlayHost } from './overlayHost.js';

/**
 * The largest recorded earthquakes in view since 1900. Same rendering as the
 * live 24 h layer, its own identity and overlay lane, a fainter fill so a
 * century of overlapping discs stays readable, and the year on every label.
 */
export function createApplicationEarthquakeHistory(options) {
  return createEarthquakesLayer({
    overlayHost,
    id: 'earthquake-history',
    name: 'Earthquake History (1900+)',
    sourceLabel: 'USGS ComCat',
    overlaySourceId: 'earthquake-history',
    updateInterval: 4000,
    viewQuery: (viewer) => earthquakeHistoryQuery(viewRectangleDegrees(viewer)),
    showYear: true,
    fillAlpha: { significant: 0.35, other: 0.18 },
    // A century of great earthquakes overlaps along every subduction zone; at
    // the live layer's size an M9.5 disc alone spans ~700 km.
    radiusScale: 0.15,
    // Only the biggest events get a "M7.3 · 1953" label; the rest stay discs.
    labelLimit: 20,
    ...options,
  });
}
