// 3D GLOBE / 2D MAP: morphing the scene, and keeping Google 3D (a tileset with
// no flat form) off the flat map.
//
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  createSceneViewSwitch,
  sceneViewOf,
  stackWorksFlat,
} from './sceneView.js';

function fakeViewer(mode = Cesium.SceneMode.SCENE3D) {
  const calls = [];
  const scene = {
    mode,
    morphTo2D(seconds) {
      calls.push(['2d', seconds]);
      scene.mode = Cesium.SceneMode.SCENE2D;
    },
    morphTo3D(seconds) {
      calls.push(['3d', seconds]);
      scene.mode = Cesium.SceneMode.SCENE3D;
    },
    requestRender() {},
    morphComplete: { addEventListener: () => () => calls.push(['unlisten']) },
  };
  return { viewer: { scene }, calls };
}

test('scene modes read as 3d or 2d and only Google 3D is globe-only', () => {
  assert.equal(sceneViewOf({ mode: Cesium.SceneMode.SCENE2D }), '2d');
  assert.equal(sceneViewOf({ mode: Cesium.SceneMode.SCENE3D }), '3d');
  assert.equal(stackWorksFlat('photoreal'), false);
  for (const id of ['esri-imagery', 'osm', 's2-cloudless-2019'])
    assert.equal(stackWorksFlat(id), true);
});

test('going flat from a globe source morphs without touching the map source', async () => {
  const { viewer, calls } = fakeViewer();
  const selected = [];
  const views = [];
  const view = createSceneViewSwitch({
    viewer,
    getActiveStack: () => 's2-cloudless-2020',
    selectStack: async (id) => selected.push(id),
    onChange: (next) => views.push(next),
  });
  assert.equal(await view.setView('2d'), '2d');
  assert.deepEqual(selected, []);
  assert.equal(calls[0][0], '2d');
  assert.equal(view.getView(), '2d');
  assert.equal(await view.setView('2d'), '2d', 'same view is a no-op');
  assert.equal(calls.length, 1);
  await view.setView('3d');
  assert.equal(view.getView(), '3d');
  assert.deepEqual(views, ['2d', '3d']);
});

test('going flat from Google 3D first moves the map to Esri', async () => {
  const { viewer } = fakeViewer();
  const order = [];
  const view = createSceneViewSwitch({
    viewer,
    getActiveStack: () => 'photoreal',
    selectStack: async (id) => order.push(['select', id]),
    onChange: (next) => order.push(['view', next]),
  });
  await view.setView('2d');
  assert.deepEqual(order, [
    ['select', 'esri-imagery'],
    ['view', '2d'],
  ]);
});

test('choosing Google 3D on the flat map returns to the globe at once', () => {
  const { viewer, calls } = fakeViewer(Cesium.SceneMode.SCENE2D);
  const view = createSceneViewSwitch({
    viewer,
    getActiveStack: () => 'osm',
    selectStack: async () => {},
  });
  view.prepareForStack('osm');
  assert.deepEqual(calls, []);
  view.prepareForStack('photoreal');
  assert.deepEqual(calls, [['3d', 0]]);
  view.destroy();
  assert.deepEqual(calls.at(-1), ['unlisten']);
});
