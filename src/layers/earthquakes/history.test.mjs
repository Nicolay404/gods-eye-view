// EARTHQUAKE HISTORY: the largest recorded earthquakes in view since 1900.
//
// Pins the FDSN request the view produces, the cache key that keeps pans from
// refetching, and the layer contract: one request per distinct view, labels
// that carry the year, and no publish after the layer is switched off.
//
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EARTHQUAKE_HISTORY_LIMIT,
  earthquakeHistoryQuery,
  earthquakeHistoryUrl,
  eventYear,
  historyMinMagnitude,
  viewRectangleDegrees,
} from './history.js';
import { createUsgsEarthquakeHistorySource } from './historySource.js';
import { createEarthquakesLayer } from './index.js';

const LOJA = { west: -80.2, south: -4.6, east: -78.9, north: -3.4 };

test('the magnitude floor rises with the view so every scale stays readable', () => {
  assert.equal(historyMinMagnitude(1), 3.5);
  assert.equal(historyMinMagnitude(5), 4.5);
  assert.equal(historyMinMagnitude(15), 5.5);
  assert.equal(historyMinMagnitude(45), 6);
  assert.equal(historyMinMagnitude(180), 6.5);
});

test('a province view snaps outward to a half-degree grid and keys its cache', () => {
  const query = earthquakeHistoryQuery(LOJA);
  assert.deepEqual(
    { ...query, key: undefined },
    {
      minLat: -5,
      maxLat: -3,
      minLon: -80.5,
      maxLon: -78.5,
      minMagnitude: 3.5,
      key: undefined,
    },
  );
  // A small pan inside the same cells asks nothing new.
  const nudged = earthquakeHistoryQuery({
    ...LOJA,
    west: LOJA.west + 0.1,
    east: LOJA.east + 0.1,
  });
  assert.equal(nudged.key, query.key);
});

test('no ground in view means the whole globe at the great-earthquake floor', () => {
  const query = earthquakeHistoryQuery(null);
  assert.equal(query.minLat, -90);
  assert.equal(query.maxLat, 90);
  assert.equal(query.minLon, -180);
  assert.equal(query.maxLon, 180);
  assert.equal(query.minMagnitude, 6.5);
});

test('a view across the antimeridian keeps its east edge past 180°', () => {
  const query = earthquakeHistoryQuery({
    west: 170,
    south: -20,
    east: -170,
    north: 0,
  });
  assert.equal(query.minLon, 170);
  assert.equal(query.maxLon, 190);
});

test('the FDSN request asks for the biggest earthquakes since 1900, capped', () => {
  const url = new URL(earthquakeHistoryUrl(earthquakeHistoryQuery(LOJA)));
  assert.equal(url.origin, 'https://earthquake.usgs.gov');
  assert.equal(url.pathname, '/fdsnws/event/1/query');
  const p = url.searchParams;
  assert.equal(p.get('format'), 'geojson');
  assert.equal(p.get('eventtype'), 'earthquake');
  assert.equal(p.get('starttime'), '1900-01-01');
  assert.equal(p.get('orderby'), 'magnitude');
  assert.equal(p.get('limit'), String(EARTHQUAKE_HISTORY_LIMIT));
  assert.ok(EARTHQUAKE_HISTORY_LIMIT < 20000, 'below the service cap');
  assert.equal(p.get('minlatitude'), '-5');
  assert.equal(p.get('maxlongitude'), '-78.5');
  assert.equal(p.get('minmagnitude'), '3.5');
});

test('years come from USGS epoch ms, including events before 1970', () => {
  assert.equal(eventYear(-506586510160), 1953);
  assert.equal(eventYear(1679159572481), 2023);
  assert.equal(eventYear(null), null);
});

test('view rectangles convert from radians and survive a camera seeing space', () => {
  const rad = (d) => (d * Math.PI) / 180;
  const view = viewRectangleDegrees({
    camera: {
      computeViewRectangle: () => ({
        west: rad(-80),
        south: rad(-5),
        east: rad(-78),
        north: rad(-3),
      }),
    },
  });
  assert.ok(Math.abs(view.west + 80) < 1e-9 && Math.abs(view.north + 3) < 1e-9);
  assert.equal(
    viewRectangleDegrees({ camera: { computeViewRectangle: () => undefined } }),
    null,
  );
});

test('the source fetches the query URL and keeps only valid M2.5+ events', async () => {
  const urls = [];
  const source = createUsgsEarthquakeHistorySource({
    fetchImpl: async (url) => {
      urls.push(url);
      return {
        ok: true,
        json: async () => ({
          features: [
            {
              id: 'iscgem892281',
              geometry: { type: 'Point', coordinates: [-80.636, -3.552, 25] },
              properties: { mag: 7.32, place: 'Zorritos', time: -506586510160 },
            },
          ],
        }),
      };
    },
  });
  const query = earthquakeHistoryQuery(LOJA);
  const rows = await source.getSnapshot({ query });
  assert.equal(urls[0], earthquakeHistoryUrl(query));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mag, 7.32);
  await assert.rejects(source.getSnapshot({}), /view query/);
});

function historyHarness(getSnapshot, viewRef) {
  const entries = [];
  const viewer = {
    dataSources: { add() {}, remove() {} },
  };
  const layer = createEarthquakesLayer({
    source: { getSnapshot },
    overlayHost: {
      setEntries: (...args) => entries.push(args),
      setVisible() {},
      clearSource() {},
    },
    id: 'earthquake-history',
    overlaySourceId: 'earthquake-history',
    viewQuery: () => earthquakeHistoryQuery(viewRef.view),
    showYear: true,
  });
  layer.init(viewer);
  layer.enable(viewer);
  return { layer, viewer, entries };
}

const QUAKE_1953 = {
  stableId: 'iscgem892281',
  usgsId: 'iscgem892281',
  lon: -80.636,
  lat: -3.552,
  depthKm: 25,
  mag: 7.32,
  place: 'Zorritos',
  time: -506586510160,
};

test('the layer fetches once per distinct view and labels carry the year', async () => {
  const queries = [];
  const viewRef = { view: LOJA };
  const h = historyHarness(async ({ query }) => {
    queries.push(query.key);
    return [QUAKE_1953];
  }, viewRef);
  assert.equal(await h.layer.update(h.viewer), true);
  // Same view: no request, and still a SUCCESSFUL refresh. The lifecycle
  // treats `false` as a rejected refresh and marks the layer DEGRADED.
  assert.equal(await h.layer.update(h.viewer), true, 'same view, no refetch');
  assert.equal(queries.length, 1);
  assert.equal(h.layer.getStats().count, 1);
  const [sourceId, cohort] = h.entries.at(-1);
  assert.equal(sourceId, 'earthquake-history');
  assert.equal(cohort[0].title, 'M7.3 · 1953');

  viewRef.view = { west: -82, south: -6, east: -76, north: 2 };
  assert.equal(await h.layer.update(h.viewer), true, 'new view, new request');
  assert.equal(queries.length, 2);
});

test('a history refresh cannot publish after the layer is switched off', async () => {
  let resolve;
  const h = historyHarness(() => new Promise((done) => (resolve = done)), {
    view: LOJA,
  });
  const pending = h.layer.update(h.viewer);
  h.layer.disable(h.viewer);
  resolve([QUAKE_1953]);
  assert.equal(await pending, false);
  assert.equal(h.entries.length, 0);
  assert.equal(h.layer.getStats().count, 0);
});

test('only the largest events get a label when a label limit is set', async () => {
  const entries = [];
  const layer = createEarthquakesLayer({
    source: {
      getSnapshot: async () =>
        Array.from({ length: 30 }, (_, i) => ({
          ...QUAKE_1953,
          stableId: `q${i}`,
          usgsId: `q${i}`,
          mag: 4 + i / 10,
        })),
    },
    overlayHost: {
      setEntries: (...args) => entries.push(args),
      setVisible() {},
      clearSource() {},
    },
    id: 'earthquake-history',
    overlaySourceId: 'earthquake-history',
    viewQuery: () => earthquakeHistoryQuery(LOJA),
    showYear: true,
    labelLimit: 20,
  });
  layer.init({ dataSources: { add() {}, remove() {} } });
  layer.enable();
  assert.equal(await layer.update(), true);
  assert.equal(layer.getStats().count, 30, 'every event keeps its disc');
  const cohort = entries.at(-1)[1];
  assert.equal(cohort.length, 20);
  assert.equal(cohort[0].title, 'M6.9 · 1953');
});
