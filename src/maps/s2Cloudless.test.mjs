// SENTINEL-2 CLOUDLESS SERIES: keyless, recent basemaps for regions where the
// commercial mosaic behind Esri is years old (most of Latin America), one per
// year so any place can be stepped through as a time-lapse.
//
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP_STACKS,
  S2_CLOUDLESS_LATEST_YEAR,
  S2_CLOUDLESS_STACK_IDS,
  S2_CLOUDLESS_YEARS,
  s2CloudlessStackId,
  s2CloudlessYearOf,
} from './catalog.js';
import { createDefaultMapSources } from './defaultSources.js';
import {
  S2_CLOUDLESS_MAX_LEVEL,
  s2CloudlessAttributionHtml,
  s2CloudlessUrl,
} from './imagery.js';
import { PRESENTED_MAP_STACK_IDS } from '../mapStackChips.js';
import { stripKeylessBasemapFromHash } from '../keySetup.js';
import { CABLE_GLOBE_STACK_IDS } from '../layers/submarineCables/policy.js';

const sources = () => createDefaultMapSources().sources;

test('every annual mosaic 2017–2024 is its own keyless stack, newest first', () => {
  assert.deepEqual(
    S2_CLOUDLESS_YEARS,
    [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
  );
  assert.equal(S2_CLOUDLESS_LATEST_YEAR, 2024);
  const series = MAP_STACKS.filter(({ kind }) => kind === 's2-cloudless');
  assert.deepEqual(
    series.map(({ id }) => id),
    S2_CLOUDLESS_STACK_IDS,
  );
  assert.equal(S2_CLOUDLESS_STACK_IDS[0], 's2-cloudless-2024');
  for (const stack of series) {
    assert.equal(stack.requiresIon, false);
    assert.equal(stack.label, `Sentinel-2 ${stack.year}`);
  }
});

test('stack ids and years round-trip; other ids are not years', () => {
  for (const year of S2_CLOUDLESS_YEARS)
    assert.equal(s2CloudlessYearOf(s2CloudlessStackId(year)), year);
  for (const id of [
    'esri-imagery',
    'osm',
    's2-cloudless-2016',
    's2-cloudless-2031',
    's2-cloudless-20245',
    null,
  ])
    assert.equal(s2CloudlessYearOf(id), null);
});

test('only the newest year is a tray chip; the stepper reaches the rest', () => {
  assert.deepEqual(
    PRESENTED_MAP_STACK_IDS.filter((id) => s2CloudlessYearOf(id) != null),
    ['s2-cloudless-2024'],
  );
});

test('each year draws its own EOX layer and credits its own Copernicus year', () => {
  for (const year of S2_CLOUDLESS_YEARS) {
    const source = sources().find(
      ({ descriptor }) => descriptor.id === s2CloudlessStackId(year),
    );
    assert.equal(source.available, true);
    assert.equal(source.terrain.id, 'keyless');
    assert.equal(source.credit, s2CloudlessAttributionHtml(year));
    assert.match(source.credit, /EOX IT Services GmbH/);
    assert.match(source.credit, new RegExp(`Copernicus Sentinel data ${year}`));
    const url = new URL(s2CloudlessUrl(year).replace(/\{[xyz]\}/g, '0'));
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'tiles.maps.eox.at');
    assert.ok(url.pathname.includes(`s2cloudless-${year}_3857`));
    assert.ok(url.pathname.includes('/GoogleMapsCompatible/'));
  }
  // 10 m pixels: deeper levels only upsample, so they are never requested.
  assert.equal(S2_CLOUDLESS_MAX_LEVEL, 15);
});

test('a failing EOX year falls back to Esri, never to nothing', () => {
  for (const id of S2_CLOUDLESS_STACK_IDS) {
    const source = sources().find(({ descriptor }) => descriptor.id === id);
    assert.equal(source.constructionFallback.id, 'esri-imagery');
    assert.equal(source.tileFailureFallback.id, 'esri-imagery');
  }
});

test('cables stay on the globe surface for every year', () => {
  for (const id of S2_CLOUDLESS_STACK_IDS)
    assert.ok(CABLE_GLOBE_STACK_IDS.has(id), id);
});

test('adding a key drops any keyless Sentinel basemap from a shared hash', () => {
  assert.equal(
    stripKeylessBasemapFromHash('map=s2-cloudless-2019&lat=-3.99'),
    'lat=-3.99',
  );
  assert.equal(stripKeylessBasemapFromHash('map=photoreal&lat=1'), null);
});
