import * as Cesium from 'cesium';
import {
  EARTHQUAKE_OVERLAY_SOURCE_ID,
  EARTHQUAKE_OVERLAY_COHORT_LIMIT,
  EARTHQUAKE_OVERLAY_COLLISION_CAPACITY,
  depthColor,
  createEarthquakeOverlayEntry,
  selectEarthquakeOverlayCohort,
  mapAnalystRecord,
} from './model.js';
export * from './model.js';
export { createUsgsEarthquakeSource } from './source.js';
export { createUsgsEarthquakeHistorySource } from './historySource.js';
import { eventYear } from './history.js';

/**
 * Own one earthquake display and its refresh lifecycle.
 *
 * The live 24 h feed uses the defaults. The history display passes its own
 * identity plus `viewQuery(viewer)`: a query derived from what the camera sees,
 * fetched only when it changes (a `key` the source answered before is reused).
 */
export function createEarthquakesLayer({
  source,
  overlayHost,
  id = 'earthquakes',
  name = 'Earthquakes (24h)',
  sourceLabel = 'USGS',
  overlaySourceId = EARTHQUAKE_OVERLAY_SOURCE_ID,
  updateInterval = 60000,
  viewQuery = null,
  showYear = false,
  fillAlpha = { significant: 0.4, other: 0.3 },
  radiusScale = 1,
  labelLimit = EARTHQUAKE_OVERLAY_COHORT_LIMIT,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Earthquakes require a snapshot source');
  if (!overlayHost) throw new TypeError('Earthquakes require an overlay host');
  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _count = 0;
  let _lastUpdate = null;
  let _lastError = null;
  let _enabled = false;
  let _shownKey = null;
  let _pendingKey = null;
  let _failed = null; // { key, at }: a failing view is retried after a minute

  const layer = {
    id,
    name,
    icon: '🌋',
    source: sourceLabel,
    updateInterval,

    init(viewer) {
      if (_viewer) throw new Error('Earthquake layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(id);
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
      _enabled = false;
      overlayHost.setVisible(overlaySourceId, false);
      console.log('[Data:Earthquakes] Initialized');
    },

    enable(viewer) {
      _enabled = true;
      // No continuous-render hold: the discs are static geometry now, so the
      // layer has no per-frame animator to keep the render loop alive for.
      if (_dataSource) _dataSource.show = true;
      overlayHost.setVisible(overlaySourceId, true);
    },

    disable(viewer) {
      _request?.abort();
      _request = null;
      _enabled = false;
      _shownKey = null;
      _pendingKey = null;
      _failed = null;
      if (_dataSource) _dataSource.show = false;
      overlayHost.clearSource(overlaySourceId);
      overlayHost.setVisible(overlaySourceId, false);
    },

    async update(viewer) {
      if (!_enabled || !_dataSource) return false;
      const query = viewQuery ? viewQuery(viewer ?? _viewer) : null;
      if (viewQuery) {
        // Nothing to fetch is success, not a rejection: the lifecycle reads a
        // `false` refresh as a failed one and marks the layer DEGRADED.
        if (!query || query.key === _shownKey || query.key === _pendingKey)
          return true;
        if (query.key === _failed?.key && Date.now() - _failed.at < 60000)
          return false;
      }
      _request?.abort();
      const request = new AbortController();
      _request = request;
      _pendingKey = query?.key ?? null;
      try {
        const rows = await source.getSnapshot({
          signal: request.signal,
          ...(query ? { query } : {}),
        });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;

        const nextEntities = [];
        let count = 0;
        const overlayEntries = [];

        for (const {
          stableId,
          usgsId,
          lon,
          lat,
          depthKm,
          mag,
          place,
          time,
        } of rows) {
          count++;
          const baseRadius = Math.pow(2, mag) * 1000 * radiusScale;
          const color = depthColor(depthKm || 0);
          const isSignificant = mag >= 5.0;
          const fill = isSignificant ? fillAlpha.significant : fillAlpha.other;
          const outlineAlpha = isSignificant ? 1.0 : 0.8;

          const position = Cesium.Cartesian3.fromDegrees(lon, lat);
          nextEntities.push(
            new Cesium.Entity({
              id: `${id === 'earthquakes' ? 'earthquake' : id}:${stableId}`,
              position,
              ellipse: {
                // Static axes — see the module header. A CallbackProperty here
                // re-tessellates the clamped ground geometry every frame.
                semiMajorAxis: baseRadius,
                semiMinorAxis: baseRadius,
                material: new Cesium.ColorMaterialProperty(
                  color.withAlpha(fill),
                ),
                outline: true,
                outlineColor: color.withAlpha(outlineAlpha),
                outlineWidth: isSignificant ? 3 : 2,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              },
              properties: {
                // Analyst seam (additive): the USGS event id (e.g. "us7000abcd").
                usgsId,
                mag,
                place,
                time,
                depth: depthKm,
              },
            }),
          );
          overlayEntries.push(
            createEarthquakeOverlayEntry({
              id: String(stableId),
              position,
              magnitude: mag,
              accent: color.toCssColorString(),
              year: showYear ? eventYear(time) : null,
            }),
          );
        }

        _dataSource.entities.removeAll();
        for (const entity of nextEntities) _dataSource.entities.add(entity);
        if (_enabled) {
          overlayHost.setEntries(
            overlaySourceId,
            selectEarthquakeOverlayCohort(overlayEntries, labelLimit),
            {
              cohortLimit: EARTHQUAKE_OVERLAY_COHORT_LIMIT,
              collisionCapacity: EARTHQUAKE_OVERLAY_COLLISION_CAPACITY,
              moving: false,
            },
          );
        }

        _count = count;
        _lastUpdate = Date.now();
        _lastError = null;
        _shownKey = query?.key ?? null;
        console.log(
          query
            ? `[Data:Earthquakes] ${id}: ${_count} events M${query.minMagnitude}+ since 1900`
            : `[Data:Earthquakes] Updated: ${_count} events (M2.5+)`,
        );
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:Earthquakes] Fetch error:', e);
        if (query) _failed = { key: query.key, at: Date.now() };
        _lastError = e?.message || 'Earthquake source unavailable';
        return false;
      } finally {
        if (_request === request) {
          _request = null;
          _pendingKey = null;
        }
      }
    },

    destroy(viewer = _viewer) {
      _request?.abort();
      _request = null;
      _viewer = null;
      _enabled = false;
      overlayHost.clearSource(overlaySourceId);
      overlayHost.setVisible(overlaySourceId, false);
      if (_dataSource) {
        viewer.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
      _shownKey = null;
    },

    /**
     * Snapshot the layer's in-memory earthquake records as plain JSON-safe
     * objects for the analyst query engine. On-demand only (called at most
     * once per spoken query) — zero per-frame cost, no listeners, no caching.
     * Returns [] while the layer is disabled or empty.
     * @param {number} [maxCount=2000] - Maximum records to return (truncation).
     * @returns {Array<Object>} See mapAnalystRecord for the record shape.
     */
    getAnalystRecords(maxCount = 2000) {
      if (!_dataSource || !_dataSource.show) return [];
      const entities = _dataSource.entities.values;
      if (!entities.length) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 2000;
      const now = Cesium.JulianDate.now();
      const result = [];
      for (const entity of entities) {
        if (result.length >= limit) break;
        const cartesian = entity.position
          ? entity.position.getValue(now)
          : null;
        const carto = cartesian
          ? Cesium.Cartographic.fromCartesian(cartesian)
          : null;
        const p = entity.properties;
        result.push(
          mapAnalystRecord(
            {
              id: p?.usgsId?.getValue(now) ?? null,
              mag: p?.mag?.getValue(now),
              place: p?.place?.getValue(now),
              time: p?.time?.getValue(now),
              depth: p?.depth?.getValue(now),
              lat: carto ? Cesium.Math.toDegrees(carto.latitude) : null,
              lon: carto ? Cesium.Math.toDegrees(carto.longitude) : null,
            },
            result.length,
          ),
        );
      }
      return result;
    },

    getStats() {
      return {
        count: _count,
        lastUpdate: _lastUpdate,
        error: _lastError,
      };
    },
  };
  return layer;
}
