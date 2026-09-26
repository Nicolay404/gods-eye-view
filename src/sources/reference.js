import { createUsgsEarthquakeSource } from '../layers/earthquakes/source.js';
import { createUsgsEarthquakeHistorySource } from '../layers/earthquakes/historySource.js';
import { createWfigsPerimeterSource } from '../layers/perimeters/source.js';
import { createBundledCableSource } from '../layers/submarineCables/bundledSource.js';

/** Construct the existing reference feeds independently of application setup. */
export function createReferenceSources() {
  return {
    earthquakes: createUsgsEarthquakeSource(),
    'earthquake-history': createUsgsEarthquakeHistorySource(),
    'fire-perimeters': createWfigsPerimeterSource(),
    cables: createBundledCableSource(),
  };
}
