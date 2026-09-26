import { normalizeEarthquakeSnapshot } from './records.js';
import { earthquakeHistoryUrl } from './history.js';

/** Request the largest recorded earthquakes inside one history query. */
export function createUsgsEarthquakeHistorySource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async getSnapshot({ signal, query } = {}) {
      signal?.throwIfAborted();
      if (!query) throw new Error('Earthquake history needs a view query');
      const response = await fetchImpl(earthquakeHistoryUrl(query), { signal });
      if (!response.ok) throw new Error(`USGS HTTP ${response.status}`);
      const payload = await response.json();
      signal?.throwIfAborted();
      const rows = normalizeEarthquakeSnapshot(payload);
      if (!rows) throw new Error('Malformed USGS response');
      return rows;
    },
  };
}
