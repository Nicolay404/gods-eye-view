// SENTINEL-2 CLOUDLESS STACK — a keyless, recent basemap for regions where the
// commercial mosaic behind Esri is years old (most of Latin America).
//
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_STACKS } from './catalog.js';
import { createDefaultMapSources } from './defaultSources.js';
import {
  createS2CloudlessImagery,
  S2_CLOUDLESS_ATTRIBUTION_HTML,
  S2_CLOUDLESS_MAX_LEVEL,
  S2_CLOUDLESS_URL,
  S2_CLOUDLESS_YEAR,
} from './imagery.js';
import { PRESENTED_MAP_STACK_IDS } from '../mapStackChips.js';
import { stripKeylessBasemapFromHash } from '../keySetup.js';

const ID = 's2-cloudless-2024';

function s2Source(options) {
  return createDefaultMapSources(options).sources.find(
    ({ descriptor }) => descriptor.id === ID,
  );
}

test('the stack is registered, keyless, and offered in the source tray', () => {
  const descriptor = MAP_STACKS.find(({ id }) => id === ID);
  assert.ok(descriptor, 'catalog row');
  assert.equal(descriptor.requiresIon, false);
  assert.ok(PRESENTED_MAP_STACK_IDS.includes(ID));

  const source = s2Source();
  assert.equal(source.available, true);
  assert.equal(source.imagery, createS2CloudlessImagery);
  assert.equal(source.terrain.id, 'keyless');
});

test('the stack credits EOX and Copernicus for the year it shows', () => {
  const { credit } = s2Source();
  assert.equal(credit, S2_CLOUDLESS_ATTRIBUTION_HTML);
  assert.match(credit, /EOX IT Services GmbH/);
  assert.match(
    credit,
    new RegExp(`Copernicus Sentinel data ${S2_CLOUDLESS_YEAR}`),
  );
  assert.match(credit, /https:\/\/s2maps\.eu/);
});

test('tiles come from the EOX Web Mercator layer of the same year over https', () => {
  const url = new URL(S2_CLOUDLESS_URL.replace(/\{[xyz]\}/g, '0'));
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'tiles.maps.eox.at');
  assert.ok(url.pathname.includes(`s2cloudless-${S2_CLOUDLESS_YEAR}_3857`));
  assert.ok(url.pathname.includes('/GoogleMapsCompatible/'));
  // 10 m pixels: deeper levels only upsample, so they are never requested.
  assert.equal(S2_CLOUDLESS_MAX_LEVEL, 15);
});

test('a failing EOX service falls back to Esri, never to nothing', () => {
  const source = s2Source();
  assert.equal(source.constructionFallback.id, 'esri-imagery');
  assert.equal(source.tileFailureFallback.id, 'esri-imagery');
  assert.ok(source.tileFailureFallback.threshold >= 1);
});

test('adding a key drops the keyless Sentinel basemap from a shared hash', () => {
  assert.equal(stripKeylessBasemapFromHash(`map=${ID}&lat=-3.99`), 'lat=-3.99');
});
