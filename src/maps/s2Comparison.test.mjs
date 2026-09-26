// SENTINEL-2 YEAR COMPARISON: year A draped over the basemap year B, as a
// swipe divider or a fade, holding the imagery-comparison lease.
//
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  createS2Comparison,
  defaultCompareYear,
  stepCompareYear,
} from './s2Comparison.js';

function fakeController(activeId = 's2-cloudless-2024') {
  const layers = [];
  const listeners = new Set();
  const leases = [];
  const controller = {
    activeId,
    viewer: {
      scene: { splitPosition: 0.5, requestRender() {} },
      imageryLayers: {
        add(layer, index) {
          layers.splice(index, 0, layer);
        },
        remove(layer) {
          layers.splice(layers.indexOf(layer), 1);
        },
      },
    },
    getActiveId: () => controller.activeId,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    acquireImageryComparison(options) {
      if (leases.some((lease) => !lease.released))
        throw new Error('Imagery comparison is already held');
      const lease = { options, released: false };
      leases.push(lease);
      return {
        release() {
          lease.released = true;
        },
      };
    },
    settle(id) {
      controller.activeId = id;
      for (const listener of listeners) listener({ activeId: id });
    },
  };
  return { controller, layers, leases, listeners };
}

function session(activeId, extra = {}) {
  const h = fakeController(activeId);
  const provided = [];
  const splits = [];
  const comparison = createS2Comparison({
    controller: h.controller,
    createImageryLayer: (provider) => ({ provider, alpha: 1 }),
    createProvider: (year) => {
      provided.push(year);
      return { year };
    },
    createSplit: (options) => {
      const split = {
        options,
        value: options.initialValue,
        destroyed: false,
        getValue: () => split.value,
        destroy() {
          split.destroyed = true;
        },
      };
      splits.push(split);
      return split;
    },
    requestRender() {},
    ...extra,
  });
  return { ...h, comparison, provided, splits };
}

test('the default before year is the oldest mosaic, or the newest when B is oldest', () => {
  assert.equal(defaultCompareYear(2024), 2017);
  assert.equal(defaultCompareYear(2020), 2017);
  assert.equal(defaultCompareYear(2017), 2024);
  assert.equal(stepCompareYear(2017, -1), 2017);
  assert.equal(stepCompareYear(2019, 1), 2020);
  assert.equal(stepCompareYear(2024, 1), 2024);
});

test('comparing needs the Sentinel-2 basemap', () => {
  const s = session('esri-imagery');
  assert.equal(s.comparison.getState().available, false);
  assert.throws(() => s.comparison.start(), /Sentinel-2 basemap/);
  assert.equal(s.layers.length, 0);
  assert.equal(s.leases.length, 0);
});

test('swipe drapes year A on the LEFT of a divider labelled A | B, above the basemap', () => {
  const s = session('s2-cloudless-2024');
  s.layers.push({ basemap: true });
  const state = s.comparison.start();
  assert.equal(state.active, true);
  assert.equal(state.yearA, 2017);
  assert.equal(state.yearB, 2024);
  assert.deepEqual(s.provided, [2017]);
  assert.equal(s.layers.length, 2);
  assert.ok(s.layers[0].basemap, 'basemap stays at the bottom');
  assert.equal(s.layers[1].splitDirection, Cesium.SplitDirection.LEFT);
  assert.equal(s.layers[1].alpha, 1);
  assert.equal(s.splits.length, 1);
  assert.equal(s.splits[0].options.beforeLabel, '2017');
  assert.equal(s.splits[0].options.afterLabel, '2024');
  assert.equal(s.leases.length, 1);
});

test('fade shows A everywhere at the slider opacity and drops the divider', () => {
  const s = session('s2-cloudless-2023');
  s.comparison.start();
  s.comparison.setMode('fade');
  s.comparison.setFade(0.25);
  const layer = s.layers.at(-1);
  assert.equal(layer.splitDirection, Cesium.SplitDirection.NONE);
  assert.equal(layer.alpha, 0.25);
  assert.equal(s.splits[0].destroyed, true);
  s.comparison.setFade(7);
  assert.equal(layer.alpha, 1, 'opacity is clamped');
  s.comparison.setMode('swipe');
  assert.equal(layer.splitDirection, Cesium.SplitDirection.LEFT);
  assert.equal(layer.alpha, 1);
  assert.equal(s.splits.length, 2, 'the divider comes back');
});

test('stepping year A swaps only the compared layer and relabels the divider', () => {
  const s = session('s2-cloudless-2024');
  s.comparison.start();
  s.comparison.stepYearA(1);
  assert.equal(s.comparison.getState().yearA, 2018);
  assert.deepEqual(s.provided, [2017, 2018]);
  assert.equal(s.layers.length, 1, 'the old year A layer was removed');
  assert.equal(s.splits.at(-1).options.beforeLabel, '2018');
});

test('moving the basemap year relabels B; leaving Sentinel-2 ends the session', () => {
  const s = session('s2-cloudless-2024');
  s.comparison.start();
  s.controller.settle('s2-cloudless-2021');
  assert.equal(s.comparison.getState().yearB, 2021);
  assert.equal(s.splits.at(-1).options.afterLabel, '2021');
  s.controller.settle('osm');
  const state = s.comparison.getState();
  assert.equal(state.active, false);
  assert.equal(s.layers.length, 0);
  assert.equal(s.leases[0].released, true);
  assert.equal(
    s.splits.every((split) => split.destroyed),
    true,
  );
  assert.equal(s.listeners.size, 0);
});

test('another comparison holding the map blocks the start and changes nothing', () => {
  const s = session('s2-cloudless-2024');
  s.controller.acquireImageryComparison({ owner: 'recent imagery' });
  assert.throws(() => s.comparison.start(), /already held/);
  assert.equal(s.comparison.getState().active, false);
  assert.equal(s.layers.length, 0);
});

test('stop is idempotent and toggle round-trips', () => {
  const s = session('s2-cloudless-2020');
  assert.equal(s.comparison.toggle().active, true);
  assert.equal(s.comparison.toggle().active, false);
  assert.equal(s.comparison.stop().active, false);
  assert.equal(s.leases.filter((lease) => !lease.released).length, 0);
});
