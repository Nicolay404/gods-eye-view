import {
  renderMapStackChips,
  steppedS2CloudlessYear,
  syncMapStackChips,
} from '../mapStackChips.js';
import {
  S2_CLOUDLESS_YEARS,
  s2CloudlessStackId,
  s2CloudlessYearOf,
} from '../maps/catalog.js';
import { createS2Comparison } from '../maps/s2Comparison.js';
import { createImagerySplit } from './imagerySplit.js';
import { renderS2Timeline } from './s2Timeline.js';
import { createSceneViewSwitch } from '../maps/sceneView.js';

/** Seconds each year stays on screen while PLAY steps the series. */
export const S2_PLAY_STEP_MS = 2500;

/**
 * Own Map Source presentation and selection without constructing map providers.
 * The supplied controller remains authoritative for availability and active state.
 */
export function createMapSourceControls({
  container,
  statusElement,
  controller,
  subscribe,
  claimSelection = () => {},
  onStateChanged = () => {},
  onError = () => {},
  createComparison = (options) =>
    createS2Comparison({ createSplit: createImagerySplit, ...options }),
  setTimer = (fn, ms) => globalThis.setInterval(fn, ms),
  clearTimer = (id) => globalThis.clearInterval(id),
  // The timeline floats over the globe, outside the collapsible tray.
  timelineParent = globalThis.document?.body ?? null,
  createSceneView = (options) => createSceneViewSwitch(options),
}) {
  let destroyed = false;
  let generation = 0;
  const removers = [];
  let compareControls = null;
  let playTimer = null;
  let comparison = null;
  try {
    comparison = createComparison({
      controller,
      onChange: () => syncCompare(),
    });
  } catch (error) {
    console.warn('[MapSource] Sentinel-2 comparison unavailable:', error);
  }

  let viewRow = null;
  let sceneView = null;
  try {
    sceneView = controller.viewer?.scene
      ? createSceneView({
          viewer: controller.viewer,
          getActiveStack: () => controller.getActiveId(),
          selectStack: (id) => select(id),
          onChange: () => syncViewRow(),
        })
      : null;
  } catch (error) {
    console.warn('[MapSource] 2D map view unavailable:', error);
  }

  function syncViewRow() {
    if (destroyed || !viewRow || !sceneView) return;
    const view = sceneView.getView();
    for (const node of viewRow.children) {
      if (!node.dataset?.view) continue;
      const on = node.dataset.view === view;
      node.classList.toggle('active', on);
      node.setAttribute('aria-pressed', String(on));
    }
  }

  function mountViewRow() {
    viewRow = null;
    if (!sceneView) return;
    const ownerDoc = container?.ownerDocument || globalThis.document;
    if (!ownerDoc?.createElement) return;
    viewRow = ownerDoc.createElement('div');
    viewRow.className = 'map-scene-view';
    viewRow.dataset.role = 'scene-view';
    viewRow.setAttribute('role', 'group');
    viewRow.setAttribute('aria-label', 'Globe or flat map');
    const label = ownerDoc.createElement('span');
    label.className = 'map-scene-view-label';
    label.textContent = 'VIEW';
    viewRow.appendChild(label);
    for (const [view, text] of [
      ['3d', '3D GLOBE'],
      ['2d', '2D MAP'],
    ]) {
      const node = ownerDoc.createElement('button');
      node.type = 'button';
      node.className = 'map-scene-view-btn';
      node.dataset.view = view;
      node.textContent = text;
      bind(node, 'click', () => {
        void sceneView
          .setView(view)
          .catch((error) => onError(error?.message || String(error)));
      });
      viewRow.appendChild(node);
    }
    container.appendChild(viewRow);
    syncViewRow();
  }

  function syncCompare() {
    if (destroyed || !compareControls || !comparison) return;
    compareControls.sync(comparison.getState(), { playing: playTimer != null });
  }

  function stopPlay() {
    if (playTimer == null) return;
    clearTimer(playTimer);
    playTimer = null;
    syncCompare();
  }

  function playStep() {
    const next = steppedS2CloudlessYear(controller.getActiveId(), 1);
    if (next == null) {
      stopPlay();
      return;
    }
    void select(s2CloudlessStackId(next)).catch(() => stopPlay());
  }

  function togglePlay() {
    if (playTimer != null) {
      stopPlay();
      return;
    }
    // From the last year, a replay starts at the first mosaic.
    const year = s2CloudlessYearOf(controller.getActiveId());
    if (year === S2_CLOUDLESS_YEARS.at(-1))
      void select(s2CloudlessStackId(S2_CLOUDLESS_YEARS[0])).catch(() => {});
    playTimer = setTimer(playStep, S2_PLAY_STEP_MS);
    syncCompare();
  }

  function setTimelineMode(mode) {
    try {
      if (mode === 'current') {
        comparison.stop();
        return;
      }
      const compareMode = mode === 'overlay' ? 'fade' : 'swipe';
      if (comparison.getState().active) comparison.setMode(compareMode);
      else comparison.start({ mode: compareMode });
    } catch (error) {
      onError(error?.message || String(error));
    }
    // The comparison reports its own changes; resync anyway so a refused
    // start (another comparison holds the map) re-lights the real mode.
    syncCompare();
  }

  function mountCompareControls() {
    compareControls?.element?.remove?.();
    compareControls = null;
    if (!comparison || !timelineParent) return;
    const ownerDoc =
      timelineParent.ownerDocument ||
      container?.ownerDocument ||
      globalThis.document;
    if (!ownerDoc?.createElement) return;
    compareControls = renderS2Timeline(ownerDoc, {
      bind,
      onPlay: togglePlay,
      onMode: setTimelineMode,
      onYearB: (year) => {
        stopPlay();
        void select(s2CloudlessStackId(year)).catch(() => {});
      },
      onYearA: (year) => comparison.setYearA(year),
      onFade: (value) => comparison.setFade(value),
    });
    timelineParent.appendChild(compareControls.element);
    syncCompare();
  }
  const bind = (element, type, listener) => {
    element.addEventListener(type, listener);
    removers.push(() => element.removeEventListener(type, listener));
  };
  function render(state) {
    if (destroyed || !state) return;
    syncMapStackChips(container, state.activeId);
    if (s2CloudlessYearOf(state.activeId) == null) stopPlay();
    syncCompare();
    if (statusElement) {
      const stack = state.activeStack;
      statusElement.textContent =
        state.status === 'switching'
          ? '...'
          : stack?.shortLabel || stack?.label || 'MAP';
      statusElement.classList.toggle('warn', !!state.lastError);
    }
  }
  async function select(stackId, { syncShare = true } = {}) {
    if (destroyed) return null;
    const current = ++generation;
    if (syncShare) claimSelection();
    const before = controller.getActiveId();
    sceneView?.prepareForStack(stackId);
    render(controller.getState('switching'));
    let state;
    try {
      state = await controller.setStack(stackId);
    } catch (error) {
      if (!destroyed && current === generation) {
        render(controller.getState());
        onError(error?.message || String(error));
      }
      throw error;
    }
    if (destroyed || current !== generation) return state;
    render(controller.getState());
    if (state?.activeId === before && stackId !== before && state?.lastError)
      onError(state.lastError);
    if (syncShare) onStateChanged();
    return state;
  }
  function refresh() {
    if (destroyed) return;
    for (const remove of removers.splice(0)) remove();
    renderMapStackChips(container, controller.getStacks(), {
      activeId: controller.getActiveId(),
      onSelect: (id) => {
        void select(id).catch(() => {});
      },
      bind,
    });
    mountViewRow();
    mountCompareControls();
    render(controller.getState());
  }
  const unsubscribe = subscribe(() => {
    if (destroyed) return;
    render(controller.getState());
    onStateChanged();
  });
  refresh();
  return {
    render,
    select,
    refresh,
    destroy() {
      if (destroyed) return;
      stopPlay();
      comparison?.destroy();
      compareControls?.element?.remove?.();
      sceneView?.destroy();
      destroyed = true;
      generation++;
      unsubscribe?.();
      for (const remove of removers.splice(0)) remove();
    },
  };
}
