import * as Cesium from 'cesium';

/**
 * 3D globe or flat 2D map.
 *
 * Cesium morphs the same scene between its globe and a Web Mercator plane, so
 * every globe map source and data layer keeps working. Google Photorealistic
 * 3D is a 3D tileset with no flat form: entering 2D from it first moves the
 * map to Esri, and choosing it while flat morphs back to the globe.
 */
export const SCENE_VIEWS = Object.freeze(['3d', '2d']);
export const SCENE_MORPH_SECONDS = 0.8;
const TILESET_ONLY_STACKS = new Set(['photoreal']);
const FLAT_FALLBACK_STACK = 'esri-imagery';

/** @param {object} scene @returns {'2d'|'3d'} */
export function sceneViewOf(scene) {
  return scene?.mode === Cesium.SceneMode.SCENE2D ? '2d' : '3d';
}

/** Whether a map source can be shown on the flat map. */
export function stackWorksFlat(stackId) {
  return !TILESET_ONLY_STACKS.has(stackId);
}

/**
 * @param {object} options
 * @param {object} options.viewer Cesium viewer (scene.mode, morphTo2D/3D).
 * @param {() => string|null} options.getActiveStack
 * @param {(stackId: string) => Promise<unknown>} options.selectStack
 * @param {() => void} [options.onChange]
 */
export function createSceneViewSwitch({
  viewer,
  getActiveStack,
  selectStack,
  onChange = () => {},
  morphSeconds = SCENE_MORPH_SECONDS,
}) {
  const scene = viewer?.scene;
  const morphListener = scene?.morphComplete?.addEventListener?.(() =>
    onChange(sceneViewOf(scene)),
  );

  async function setView(view) {
    if (!scene || !SCENE_VIEWS.includes(view)) return sceneViewOf(scene);
    if (view === sceneViewOf(scene)) return view;
    if (view === '2d') {
      if (!stackWorksFlat(getActiveStack()))
        await selectStack(FLAT_FALLBACK_STACK);
      scene.morphTo2D(morphSeconds);
    } else {
      scene.morphTo3D(morphSeconds);
    }
    scene.requestRender?.();
    onChange(view);
    return view;
  }

  return {
    getView: () => sceneViewOf(scene),
    setView,
    /** Call before switching map source: a 3D-only source needs the globe. */
    prepareForStack(stackId) {
      if (sceneViewOf(scene) === '2d' && !stackWorksFlat(stackId)) {
        scene.morphTo3D(0);
        onChange('3d');
      }
    },
    destroy() {
      morphListener?.();
    },
  };
}
