import * as Cesium from 'cesium';
import {
  S2_CLOUDLESS_LATEST_YEAR,
  S2_CLOUDLESS_YEARS,
  s2CloudlessYearOf,
} from './catalog.js';
import { createS2CloudlessImagery } from './imagery.js';

/**
 * Compare two Sentinel-2 cloudless years over the same ground.
 *
 * The basemap keeps showing year B (whatever the year stepper selects). This
 * session drapes year A as one more imagery layer directly above it and shows
 * it in one of two ways:
 *  - 'swipe': A fills the LEFT of a draggable divider, B the right. Both halves
 *    share one camera, so the same pixel is compared at the same place.
 *  - 'fade': A covers the whole globe at an adjustable opacity, so moving the
 *    slider dissolves one year into the other.
 *
 * The session holds the map controller's imagery-comparison lease, so Recent
 * Imagery's A/B divider cannot fight it for scene.splitPosition, and it ends
 * itself when the basemap leaves the Sentinel-2 series.
 */
export const S2_COMPARE_MODES = Object.freeze(['swipe', 'fade']);

/** The default "before" year: the oldest mosaic, or the newest when B is it. */
export function defaultCompareYear(yearB) {
  const oldest = S2_CLOUDLESS_YEARS[0];
  return yearB === oldest ? S2_CLOUDLESS_LATEST_YEAR : oldest;
}

/** One year earlier/later inside the series, or the same year at the ends. */
export function stepCompareYear(year, step) {
  const index = S2_CLOUDLESS_YEARS.indexOf(year);
  if (index < 0) return S2_CLOUDLESS_YEARS[0];
  return S2_CLOUDLESS_YEARS[index + step] ?? year;
}

const clampUnit = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
};

/**
 * @param {object} options
 * @param {object} options.controller MapSourceController (getActiveId,
 *   subscribe, acquireImageryComparison, viewer).
 * @param {(provider: object) => object} [options.createImageryLayer]
 * @param {(year: number) => object} [options.createProvider]
 * @param {(options: object) => object} [options.createSplit] Divider factory
 *   (src/ui/imagerySplit.js shape); omitted in headless use.
 * @param {() => void} [options.requestRender]
 * @param {(state: object) => void} [options.onChange]
 */
export function createS2Comparison({
  controller,
  createImageryLayer = (provider) => new Cesium.ImageryLayer(provider),
  createProvider = createS2CloudlessImagery,
  createSplit = null,
  requestRender = () => controller?.viewer?.scene?.requestRender?.(),
  onChange = () => {},
} = {}) {
  if (!controller) throw new TypeError('A map source controller is required');
  const viewer = controller.viewer;
  let active = false;
  let yearA = null;
  let mode = 'swipe';
  let fade = 0.5;
  let split = 0.5;
  let layer = null;
  let lease = null;
  let divider = null;
  let unsubscribe = null;

  const yearB = () => s2CloudlessYearOf(controller.getActiveId?.());

  function state() {
    return {
      active,
      available: yearB() != null,
      yearA,
      yearB: yearB(),
      mode,
      fade,
      split,
    };
  }

  function emit() {
    try {
      onChange(state());
    } catch (error) {
      console.warn('[S2Comparison] listener failed:', error);
    }
  }

  function removeLayer() {
    if (!layer) return;
    viewer?.imageryLayers?.remove?.(layer, true);
    layer = null;
  }

  function mountLayer() {
    removeLayer();
    layer = createImageryLayer(createProvider(yearA));
    // Directly above the basemap (index 0) and under every data overlay.
    viewer?.imageryLayers?.add?.(layer, 1);
    applyLook();
  }

  function destroyDivider() {
    if (!divider) return;
    split = divider.getValue?.() ?? split;
    divider.destroy();
    divider = null;
  }

  function mountDivider() {
    destroyDivider();
    if (!createSplit || mode !== 'swipe') return;
    divider = createSplit({
      scene: viewer?.scene,
      initialValue: split,
      id: 's2-compare-split-line',
      handleClass: 's2-compare-split-handle',
      cssProperty: '--s2-compare-split',
      beforeLabel: String(yearA),
      afterLabel: String(yearB()),
      beforeTitle: `Sentinel-2 ${yearA}`,
      afterTitle: `Sentinel-2 ${yearB()}`,
      ariaLabel: 'Sentinel-2 year comparison divider',
      formatValueText: (left, right) =>
        `${yearA} ${left} percent, ${yearB()} ${right} percent`,
      getViewportWidth: () =>
        Number(viewer?.scene?.canvas?.clientWidth) ||
        Number(globalThis.document?.documentElement?.clientWidth) ||
        0,
      onChange: (value) => {
        split = value;
      },
      requestRender,
    });
  }

  function applyLook() {
    if (!layer) return;
    if (mode === 'swipe') {
      layer.alpha = 1;
      layer.splitDirection = Cesium.SplitDirection?.LEFT ?? -1;
      if (viewer?.scene && !divider) viewer.scene.splitPosition = split;
    } else {
      layer.alpha = fade;
      layer.splitDirection = Cesium.SplitDirection?.NONE ?? 0;
    }
    requestRender();
  }

  function stop() {
    if (!active) return state();
    active = false;
    unsubscribe?.();
    unsubscribe = null;
    destroyDivider();
    removeLayer();
    const held = lease;
    lease = null;
    void held?.release?.();
    requestRender();
    emit();
    return state();
  }

  function onBasemapSettled() {
    if (!active) return;
    if (yearB() == null) {
      stop();
      return;
    }
    // B moved (year stepper or share link): relabel the divider.
    if (divider) mountDivider();
    emit();
  }

  function start({ year, mode: startMode } = {}) {
    if (active) return state();
    if (S2_COMPARE_MODES.includes(startMode)) mode = startMode;
    const b = yearB();
    if (b == null)
      throw new Error('Choose the Sentinel-2 basemap before comparing years');
    // Throws while Recent Imagery's A/B comparison holds the map.
    lease = controller.acquireImageryComparison?.({
      owner: 'Sentinel-2 year comparison',
      switchPolicy: 'preserve',
    });
    active = true;
    yearA = S2_CLOUDLESS_YEARS.includes(year) ? year : defaultCompareYear(b);
    mountLayer();
    mountDivider();
    unsubscribe = controller.subscribe?.(onBasemapSettled) ?? null;
    emit();
    return state();
  }

  return {
    getState: state,
    start,
    stop,
    toggle(options) {
      return active ? stop() : start(options);
    },
    setYearA(year) {
      if (!active || !S2_CLOUDLESS_YEARS.includes(year) || year === yearA)
        return state();
      yearA = year;
      mountLayer();
      if (divider) mountDivider();
      emit();
      return state();
    },
    stepYearA(step) {
      return this.setYearA(stepCompareYear(yearA, step));
    },
    setMode(next) {
      if (!active || !S2_COMPARE_MODES.includes(next) || next === mode)
        return state();
      mode = next;
      if (mode === 'swipe') mountDivider();
      else destroyDivider();
      applyLook();
      emit();
      return state();
    },
    setFade(value) {
      fade = clampUnit(value, fade);
      if (active && mode === 'fade') applyLook();
      emit();
      return state();
    },
    destroy() {
      stop();
    },
  };
}
