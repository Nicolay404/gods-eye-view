import * as Cesium from 'cesium';

// Attribution and service rights are documented in DATA_SOURCES.md.
export const ESRI_ATTRIBUTION_HTML =
  '<a href="https://www.esri.com" target="_blank" rel="noopener">Powered by Esri</a>';

export function createOsmImagery() {
  return new Cesium.OpenStreetMapImageryProvider({
    url: 'https://tile.openstreetmap.org/',
    credit: '© OpenStreetMap contributors',
  });
}

export function createEsriImagery() {
  return Cesium.ArcGisMapServerImageryProvider.fromUrl(
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
    {
      credit:
        'Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      enablePickFeatures: false,
    },
  );
}

// EOX Sentinel-2 cloudless: a cloud-free 10 m mosaic of one year of Copernicus
// Sentinel-2 data. Much older commercial imagery backs Esri over most of Latin
// America, Africa and Asia; these stacks trade resolution for recency, and the
// annual series (2017 onward) turns any place into a time-lapse. Free for
// non-commercial use with the attribution below (DATA_SOURCES.md).
// 10 m pixels are native near zoom 14; level 15 is the last one worth fetching,
// Cesium upsamples past it instead of requesting tiles with no new detail.
export const S2_CLOUDLESS_MAX_LEVEL = 15;

/** @param {number} year @returns {string} XYZ template of that year's mosaic. */
export function s2CloudlessUrl(year) {
  return `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${year}_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg`;
}

/** @param {number} year @returns {string} The credit EOX asks for, per year. */
export function s2CloudlessAttributionHtml(year) {
  return `<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data ${year})</a>`;
}

export function createS2CloudlessImagery(year) {
  if (!Number.isInteger(year)) throw new TypeError('A mosaic year is required');
  return new Cesium.UrlTemplateImageryProvider({
    url: s2CloudlessUrl(year),
    maximumLevel: S2_CLOUDLESS_MAX_LEVEL,
    credit: `Sentinel-2 cloudless by EOX IT Services GmbH (Contains modified Copernicus Sentinel data ${year})`,
  });
}

export function createIonImagery(style, accessToken) {
  accessToken = String(accessToken || '').trim();
  if (!accessToken) throw new Error('Ion imagery requires an explicit token');
  return Cesium.IonImageryProvider.fromAssetId(style, { accessToken });
}
