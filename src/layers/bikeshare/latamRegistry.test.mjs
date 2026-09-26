// LATIN AMERICA BIKESHARE — registry rows the proxy can actually reach.
//
// A registry row is only useful if the GBFS proxy will fetch both of its
// URLs: host allowlisted, path one of the two station documents. These cases
// pin that for every Latin American system and check each center sits in the
// right country, so a typo in a sign (south/west) cannot move a city to
// another hemisphere unnoticed.
//
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITY_BY_ID } from './registry.js';
import { isAllowedGbfsHost, isAllowedGbfsPath } from '../../data/gbfsSource.js';

// id → loose bounding box [minLat, maxLat, minLon, maxLon] of its country.
const LATAM = {
  'buenos-aires-ecobici': [-55, -21, -74, -53],
  'mexico-city-ecobici': [14, 33, -118, -86],
  'guadalajara-mibici': [14, 33, -118, -86],
  'bogota-tembici': [-5, 13, -80, -66],
  'santiago-bike-itau': [-56, -17, -76, -66],
  'sao-paulo-bike-itau': [-34, 6, -74, -34],
  'rio-bike-itau': [-34, 6, -74, -34],
  'recife-bike-itau': [-34, 6, -74, -34],
  'porto-alegre-bike': [-34, 6, -74, -34],
  'brasilia-bike': [-34, 6, -74, -34],
  'curitiba-bike': [-34, 6, -74, -34],
};

test('every Latin American system is registered', () => {
  for (const id of Object.keys(LATAM)) {
    assert.ok(CITY_BY_ID.has(id), `missing registry row ${id}`);
  }
});

test('Latin American feeds pass the proxy host and path allowlists', () => {
  for (const id of Object.keys(LATAM)) {
    const entry = CITY_BY_ID.get(id);
    for (const raw of [entry.stationInformationUrl, entry.stationStatusUrl]) {
      const url = new URL(raw);
      assert.equal(url.protocol, 'https:', `${id} must use https`);
      assert.ok(isAllowedGbfsHost(url.hostname), `${id} host ${url.hostname}`);
      assert.ok(isAllowedGbfsPath(url.pathname), `${id} path ${url.pathname}`);
    }
  }
});

test('Latin American centers fall inside their country', () => {
  for (const [id, [minLat, maxLat, minLon, maxLon]] of Object.entries(LATAM)) {
    const { centerLat, centerLon } = CITY_BY_ID.get(id);
    assert.ok(centerLat >= minLat && centerLat <= maxLat, `${id} lat`);
    assert.ok(centerLon >= minLon && centerLon <= maxLon, `${id} lon`);
  }
});
