// MAP STACK source chips — the always-visible replacement for the `<select>`
// that used to sit in the Map Stack panel. One button per stack, rendered from
// `MapStackController.getStacks()`. The approved sources below are
// the whole shipped set; keeping the allowlist explicit means a stack added to
// `MAP_STACKS` for another purpose cannot reach the tray until someone names it
// here.
//
// The chips are a control SURFACE only: selecting one calls back into the same
// `_setMapStack()` path the dropdown's `change` handler used, and the active
// state is re-synced from controller state (never optimistically), so a failed
// or superseded switch still leaves the truly-active stack lit.

import { keySetupRequirement } from './keySetupCore.mjs';
import {
  S2_CLOUDLESS_LATEST_YEAR,
  S2_CLOUDLESS_YEARS,
  s2CloudlessStackId,
  s2CloudlessYearOf,
} from './maps/catalog.js';

export const MAP_STACK_CHIP_CLASS = 'map-stack-chip';
export const PRESENTED_MAP_STACK_IDS = Object.freeze([
  'photoreal',
  'bing-aerial',
  'bing-labels',
  'esri-imagery',
  // One chip stands for the whole annual Sentinel-2 series; the year stepper
  // rendered after the chips moves between the years.
  s2CloudlessStackId(S2_CLOUDLESS_LATEST_YEAR),
  'osm',
]);

export const MAP_STACK_YEARS_CLASS = 'map-stack-years';

/**
 * Two stack ids light the same chip when they are years of one series.
 * @param {string} chipId
 * @param {string|null} activeId
 * @returns {boolean}
 */
function chipOwnsStack(chipId, activeId) {
  if (!chipId || !activeId) return false;
  if (chipId === activeId) return true;
  return (
    s2CloudlessYearOf(chipId) != null && s2CloudlessYearOf(activeId) != null
  );
}

/**
 * The year a stepper press moves to, or null at either end of the series.
 * @param {string|null} activeId
 * @param {-1|1} step
 * @returns {number|null}
 */
export function steppedS2CloudlessYear(activeId, step) {
  const index = S2_CLOUDLESS_YEARS.indexOf(s2CloudlessYearOf(activeId));
  if (index < 0) return null;
  return S2_CLOUDLESS_YEARS[index + step] ?? null;
}

/**
 * Presentation model for one map-stack chip.
 *
 * Unavailable is NOT the same as needs-an-ion-token: `photoreal` is unavailable
 * whenever the Google tileset failed to load (the startup fallback-to-OSM
 * case), and a future stack may have its own reason. The ION badge is therefore
 * gated on the stack's own `requiresIon` flag, and the tooltip quotes the
 * controller's `unavailableReason` rather than assuming one.
 * @param {{id: string, label: string, available?: boolean, requiresIon?: boolean, unavailableReason?: string|null}} stack - Stack descriptor from `getStacks()`.
 * @param {string|null} activeId - Currently active stack id.
 * @returns {{id: string, label: string, available: boolean, active: boolean, requiresIon: boolean, requirement: string, unavailableHint: string, title: string}}
 */
export function mapStackChipModel(stack, activeId) {
  const available = stack?.available !== false;
  const label =
    s2CloudlessYearOf(stack?.id) != null
      ? 'Sentinel-2'
      : String(stack?.label ?? stack?.id ?? '');
  const requiresIon = stack?.requiresIon === true;
  const fallbackReason = requiresIon
    ? keySetupRequirement('cesium-ion')
    : `${label || 'This map stack'} is unavailable`;
  const unavailableHint = available
    ? ''
    : String(stack?.unavailableReason || fallbackReason);
  return {
    id: String(stack?.id ?? ''),
    label,
    available,
    active: chipOwnsStack(stack?.id, activeId),
    requiresIon,
    // Dropdown parity: unavailable options read "<label> · ion key". A chip has
    // no room for that, so an ion-backed stack gets a compact badge; every
    // unavailable chip carries the real reason in its tooltip.
    requirement: !available && requiresIon ? 'ION' : '',
    unavailableHint,
    title: available ? label : unavailableHint,
  };
}

/**
 * @param {Array<object>} stacks - `MapStackController.getStacks()` output.
 * @param {string|null} activeId - Currently active stack id.
 * @returns {Array<object>} One chip model per approved presentation id, in
 *   `PRESENTED_MAP_STACK_IDS` order; unlisted stacks stay outside this presentation.
 */
export function mapStackChipModels(stacks, activeId) {
  const stacksById = new Map(
    (Array.isArray(stacks) ? stacks : []).map((stack) => [stack?.id, stack]),
  );
  return PRESENTED_MAP_STACK_IDS.map((id) => stacksById.get(id))
    .filter(Boolean)
    .map((stack) => mapStackChipModel(stack, activeId));
}

/**
 * Renders the chip row into `container`, replacing any previous chips.
 * @param {HTMLElement} container - Row element.
 * @param {Array<object>} stacks - `MapStackController.getStacks()` output.
 * @param {object} [options]
 * @param {string|null} [options.activeId] - Currently active stack id.
 * @param {(stackId: string) => void} [options.onSelect] - Selection callback.
 * @param {Document} [options.doc] - Document override (tests).
 * @param {(element: HTMLElement, type: string, listener: Function) => void} [options.bind] - Listener owner override.
 * @returns {Array<object>} The rendered chip models.
 */
export function renderMapStackChips(
  container,
  stacks,
  {
    activeId = null,
    onSelect = null,
    doc,
    bind = (element, type, listener) =>
      element.addEventListener(type, listener),
  } = {},
) {
  if (!container) return [];
  const ownerDoc = doc || container.ownerDocument || globalThis.document;
  if (!ownerDoc?.createElement) return [];

  container.innerHTML = '';
  const models = mapStackChipModels(stacks, activeId);

  for (const model of models) {
    const chip = ownerDoc.createElement('button');
    chip.type = 'button';
    chip.className = [
      MAP_STACK_CHIP_CLASS,
      model.active ? 'active' : '',
      model.available ? '' : 'unavailable',
    ]
      .filter(Boolean)
      .join(' ');
    chip.dataset.stackId = model.id;
    chip.title = model.title;
    chip.setAttribute('aria-pressed', String(model.active));
    chip.setAttribute('aria-disabled', String(!model.available));
    if (!model.available) {
      chip.setAttribute(
        'aria-label',
        `${model.label} unavailable: ${model.unavailableHint}`,
      );
    }

    const label = ownerDoc.createElement('span');
    label.className = 'map-stack-chip-label';
    label.textContent = model.label;
    chip.appendChild(label);

    if (model.requirement) {
      const requirement = ownerDoc.createElement('span');
      requirement.className = 'map-stack-chip-req';
      requirement.textContent = model.requirement;
      chip.appendChild(requirement);
    }

    bind(chip, 'click', () => {
      if (!model.available) return;
      onSelect?.(model.id);
    });
    container.appendChild(chip);
  }

  if (models.some(({ id }) => s2CloudlessYearOf(id) != null)) {
    container.appendChild(
      renderYearStepper(ownerDoc, container, { activeId, onSelect, bind }),
    );
  }

  return models;
}

/**
 * ◀ YEAR ▶ for the Sentinel-2 series. The buttons read the active stack from
 * the row at click time, so a switch that landed (or failed) since the last
 * render steps from the truly active year, never from a stale closure.
 */
function renderYearStepper(ownerDoc, container, { activeId, onSelect, bind }) {
  const stepper = ownerDoc.createElement('div');
  stepper.className = MAP_STACK_YEARS_CLASS;
  stepper.dataset.role = 's2-years';
  stepper.setAttribute('role', 'group');
  stepper.setAttribute('aria-label', 'Sentinel-2 mosaic year');
  const button = (step, text, name) => {
    const element = ownerDoc.createElement('button');
    element.type = 'button';
    element.className = 'map-stack-year-step';
    element.dataset.step = String(step);
    element.textContent = text;
    element.setAttribute('aria-label', name);
    bind(element, 'click', () => {
      const year = steppedS2CloudlessYear(
        container.dataset.activeStackId,
        step,
      );
      if (year != null) onSelect?.(s2CloudlessStackId(year));
    });
    return element;
  };
  const year = ownerDoc.createElement('span');
  year.className = 'map-stack-year';
  year.dataset.role = 's2-year';
  stepper.appendChild(button(-1, '◀', 'Previous year'));
  stepper.appendChild(year);
  stepper.appendChild(button(1, '▶', 'Next year'));
  syncYearStepper(stepper, activeId);
  container.dataset.activeStackId = activeId || '';
  return stepper;
}

function syncYearStepper(stepper, activeId) {
  const year = s2CloudlessYearOf(activeId);
  stepper.hidden = year == null;
  for (const child of stepper.children) {
    if (child.dataset?.role === 's2-year')
      child.textContent = year == null ? '' : String(year);
    if (child.dataset?.step) {
      const blocked =
        steppedS2CloudlessYear(activeId, Number(child.dataset.step)) == null;
      child.disabled = blocked;
      child.setAttribute?.('aria-disabled', String(blocked));
    }
  }
}

/**
 * Re-points the active chip at controller state. Availability never changes at
 * runtime (it tracks the ion token), so only the active/pressed pair is synced.
 * @param {HTMLElement} container - Row element.
 * @param {string|null} activeId - Currently active stack id.
 * @returns {void}
 */
export function syncMapStackChips(container, activeId) {
  const chips = container?.children;
  if (!chips) return;
  if (container.dataset) container.dataset.activeStackId = activeId || '';
  for (const chip of Array.from(chips)) {
    if (chip?.dataset?.role === 's2-years') {
      syncYearStepper(chip, activeId);
      continue;
    }
    const stackId = chip?.dataset?.stackId;
    if (!stackId) continue;
    const active = chipOwnsStack(stackId, activeId);
    chip.classList?.toggle('active', active);
    chip.setAttribute?.('aria-pressed', String(active));
  }
}
