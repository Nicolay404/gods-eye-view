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
import { renderS2CompareControls } from './s2CompareControls.js';

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

  function mountCompareControls() {
    compareControls = null;
    if (!comparison) return;
    const ownerDoc = container?.ownerDocument || globalThis.document;
    if (!ownerDoc?.createElement) return;
    compareControls = renderS2CompareControls(ownerDoc, {
      bind,
      onPlay: togglePlay,
      onToggleCompare: () => {
        try {
          comparison.toggle();
        } catch (error) {
          onError(error?.message || String(error));
        }
      },
      onStepYearA: (step) => comparison.stepYearA(step),
      onMode: (mode) => comparison.setMode(mode),
      onFade: (value) => comparison.setFade(value),
    });
    container.appendChild(compareControls.element);
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
      destroyed = true;
      generation++;
      unsubscribe?.();
      for (const remove of removers.splice(0)) remove();
    },
  };
}
