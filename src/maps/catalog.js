import * as Cesium from 'cesium';

/**
 * EOX publishes one Sentinel-2 cloudless mosaic per year. Every year with a
 * Web Mercator layer is its own map stack, so switching years reuses the
 * controller's provider cache, fallback and share-link plumbing unchanged; the
 * source tray shows ONE Sentinel-2 chip plus a year stepper.
 */
export const S2_CLOUDLESS_YEARS = Object.freeze([
  2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024,
]);
export const S2_CLOUDLESS_LATEST_YEAR = S2_CLOUDLESS_YEARS.at(-1);
const S2_CLOUDLESS_ID = /^s2-cloudless-(\d{4})$/;

/** @param {number} year @returns {string} */
export function s2CloudlessStackId(year) {
  return `s2-cloudless-${year}`;
}

/**
 * The mosaic year a stack id names, or null for any other stack.
 * @param {string|null|undefined} id
 * @returns {number|null}
 */
export function s2CloudlessYearOf(id) {
  const match = S2_CLOUDLESS_ID.exec(String(id ?? ''));
  const year = match ? Number(match[1]) : NaN;
  return S2_CLOUDLESS_YEARS.includes(year) ? year : null;
}

/** Stack ids of every mosaic, newest first. */
export const S2_CLOUDLESS_STACK_IDS = Object.freeze(
  [...S2_CLOUDLESS_YEARS].reverse().map(s2CloudlessStackId),
);
export const MAP_STACKS = [
  {
    id: 'photoreal',
    label: 'Google 3D',
    shortLabel: '3D',
    kind: 'photoreal',
    requiresIon: false,
  },
  {
    id: 'bing-aerial',
    label: 'Bing Aerial',
    shortLabel: 'Aerial',
    kind: 'ion',
    style: Cesium.IonWorldImageryStyle.AERIAL,
    requiresIon: true,
  },
  {
    id: 'bing-labels',
    label: 'Bing Labels',
    shortLabel: 'Labels',
    kind: 'ion',
    style: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS,
    requiresIon: true,
  },
  {
    id: 'esri-imagery',
    label: 'Esri Satellite',
    shortLabel: 'SAT',
    kind: 'esri-imagery',
    requiresIon: false,
  },
  ...[...S2_CLOUDLESS_YEARS].reverse().map((year) => ({
    id: s2CloudlessStackId(year),
    label: `Sentinel-2 ${year}`,
    shortLabel: `S2 ${year}`,
    kind: 's2-cloudless',
    year,
    requiresIon: false,
  })),
  {
    id: 'osm',
    label: 'OSM',
    shortLabel: 'OSM',
    kind: 'osm',
    requiresIon: false,
  },
];
