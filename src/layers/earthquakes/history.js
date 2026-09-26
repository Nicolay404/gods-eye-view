/**
 * Earthquake history: the largest recorded earthquakes inside the current
 * view since 1900, from the USGS ComCat FDSN event service (public domain,
 * keyless). Pure helpers: no Cesium, no fetch.
 *
 * One request per distinct view. The view is widened to a coarse grid so small
 * pans reuse the cached answer, and the magnitude floor rises with the view so
 * a continent asks for its great earthquakes and a province for its moderate
 * ones; `orderby=magnitude` + `limit` keeps the biggest events either way.
 */
export const EARTHQUAKE_HISTORY_API =
  'https://earthquake.usgs.gov/fdsnws/event/1/query';
export const EARTHQUAKE_HISTORY_START = '1900-01-01';
/** Far below the service's 20 000-event cap; more discs than this stop being readable. */
export const EARTHQUAKE_HISTORY_LIMIT = 400;

/** Magnitude floor for a view whose larger side spans `spanDeg` degrees. */
export function historyMinMagnitude(spanDeg) {
  if (spanDeg >= 90) return 6.5;
  if (spanDeg >= 30) return 6;
  if (spanDeg >= 10) return 5.5;
  if (spanDeg >= 3) return 4.5;
  return 3.5;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Turn a view rectangle (degrees) into a cacheable history query.
 * A view that crosses the antimeridian (west > east) keeps its eastern edge
 * past 180°, which the FDSN service accepts, instead of querying the far side
 * of the planet. No rectangle (looking at space) means the whole globe.
 * @param {{west:number,south:number,east:number,north:number}|null} view
 * @returns {{minLat:number,maxLat:number,minLon:number,maxLon:number,minMagnitude:number,key:string}}
 */
export function earthquakeHistoryQuery(view) {
  const valid =
    view &&
    [view.west, view.south, view.east, view.north].every(Number.isFinite) &&
    view.north > view.south;
  let west = valid ? view.west : -180;
  let east = valid ? view.east : 180;
  const south = valid ? view.south : -90;
  const north = valid ? view.north : 90;
  if (east < west) east += 360;
  const span = Math.max(east - west, north - south);
  const grid = span >= 10 ? 5 : 0.5;
  const snapDown = (v) => Math.floor(v / grid) * grid;
  const snapUp = (v) => Math.ceil(v / grid) * grid;
  const minLat = clamp(snapDown(south), -90, 90);
  const maxLat = clamp(snapUp(north), -90, 90);
  let minLon = snapDown(west);
  let maxLon = snapUp(east);
  if (maxLon - minLon >= 360) {
    minLon = -180;
    maxLon = 180;
  }
  if (minLon < -180) {
    minLon += 360;
    maxLon += 360;
  }
  const minMagnitude = historyMinMagnitude(span);
  return {
    minLat,
    maxLat,
    minLon,
    maxLon,
    minMagnitude,
    key: [minLat, maxLat, minLon, maxLon, minMagnitude].join('|'),
  };
}

/**
 * The FDSN request for one history query.
 * @param {ReturnType<typeof earthquakeHistoryQuery>} query
 * @returns {string}
 */
export function earthquakeHistoryUrl(query) {
  const params = new URLSearchParams({
    format: 'geojson',
    eventtype: 'earthquake',
    starttime: EARTHQUAKE_HISTORY_START,
    minlatitude: String(query.minLat),
    maxlatitude: String(query.maxLat),
    minlongitude: String(query.minLon),
    maxlongitude: String(query.maxLon),
    minmagnitude: String(query.minMagnitude),
    orderby: 'magnitude',
    limit: String(EARTHQUAKE_HISTORY_LIMIT),
  });
  return `${EARTHQUAKE_HISTORY_API}?${params}`;
}

/** UTC year of a USGS epoch-ms time (negative before 1970), or null. */
export function eventYear(timeMs) {
  if (!Number.isFinite(timeMs)) return null;
  const year = new Date(timeMs).getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

/**
 * Degrees view rectangle from a Cesium camera, or null when the camera sees
 * no ground. Duck-typed so tests can pass a plain object.
 * @param {{camera?: {computeViewRectangle?: Function}}} viewer
 * @returns {{west:number,south:number,east:number,north:number}|null}
 */
export function viewRectangleDegrees(viewer) {
  const rect = viewer?.camera?.computeViewRectangle?.();
  if (!rect) return null;
  const deg = (radians) => (radians * 180) / Math.PI;
  return {
    west: deg(rect.west),
    south: deg(rect.south),
    east: deg(rect.east),
    north: deg(rect.north),
  };
}
