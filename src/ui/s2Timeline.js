import { S2_CLOUDLESS_YEARS } from '../maps/catalog.js';

/**
 * Sentinel-2 timeline bar: a floating panel shown while a Sentinel-2 year is
 * the basemap.
 *
 *   SENTINEL-2 TIMELINE   [CURRENT | OVERLAY | COMPARE]   ▶ PLAY   ▾
 *   MAP      2017 ─────●──── 2024   2021      year on the basemap (B)
 *   VS       ●──────────────        2017      the year compared (A)
 *   OPACITY  ─────●────             50 %      overlay only
 *
 * CURRENT shows one year, OVERLAY lays year A over the map at the opacity
 * slider, COMPARE splits the screen with a draggable divider (A left, B right).
 * DOM only: every action goes back through callbacks and `sync` redraws from
 * state, never from the click.
 */
export const S2_TIMELINE_ID = 's2-timeline';
export const S2_TIMELINE_MODES = Object.freeze([
  ['current', 'CURRENT', 'One year on the map'],
  ['overlay', 'OVERLAY', 'Lay a second year over the map'],
  ['compare', 'COMPARE', 'Split the screen between two years'],
]);

/** Timeline mode for a comparison state. */
export function timelineMode(state) {
  if (!state?.active) return 'current';
  return state.mode === 'fade' ? 'overlay' : 'compare';
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(doc, className, text, label, bind, onClick) {
  const node = el(doc, 'button', className, text);
  node.type = 'button';
  if (label) node.setAttribute('aria-label', label);
  bind(node, 'click', onClick);
  return node;
}

function yearSlider(doc, label) {
  const input = el(doc, 'input', 's2-tl-range');
  input.type = 'range';
  input.min = String(S2_CLOUDLESS_YEARS[0]);
  input.max = String(S2_CLOUDLESS_YEARS.at(-1));
  input.step = '1';
  input.setAttribute('aria-label', label);
  return input;
}

function track(doc, tagText, input, valueNode) {
  const row = el(doc, 'div', 's2-tl-track');
  row.appendChild(el(doc, 'span', 's2-tl-tag', tagText));
  row.appendChild(input);
  row.appendChild(valueNode);
  return row;
}

/**
 * @param {Document} doc
 * @param {object} handlers
 * @param {(mode: 'current'|'overlay'|'compare') => void} handlers.onMode
 * @param {(year: number) => void} handlers.onYearB Basemap year committed.
 * @param {(year: number) => void} handlers.onYearA Compared year committed.
 * @param {(value: number) => void} handlers.onFade 0–1 overlay opacity.
 * @param {() => void} handlers.onPlay
 * @param {Function} [handlers.bind]
 */
export function renderS2Timeline(
  doc,
  {
    onMode,
    onYearB,
    onYearA,
    onFade,
    onPlay,
    bind = (node, type, listener) => node.addEventListener(type, listener),
  },
) {
  let collapsed = false;
  const panel = el(doc, 'div', 's2-timeline');
  panel.id = S2_TIMELINE_ID;
  panel.dataset.role = 's2-timeline';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Sentinel-2 timeline');

  const head = el(doc, 'div', 's2-tl-head');
  head.appendChild(el(doc, 'span', 's2-tl-title', 'SENTINEL-2 TIMELINE'));
  const modes = el(doc, 'div', 's2-tl-modes');
  const modeButtons = S2_TIMELINE_MODES.map(([mode, text, label]) => {
    const node = button(doc, 's2-tl-mode', text, label, bind, () =>
      onMode(mode),
    );
    node.dataset.mode = mode;
    modes.appendChild(node);
    return node;
  });
  head.appendChild(modes);
  const play = button(doc, 's2-tl-btn', '▶ PLAY', 'Play every year', bind, () =>
    onPlay(),
  );
  head.appendChild(play);
  const body = el(doc, 'div', 's2-tl-body');
  const collapse = button(
    doc,
    's2-tl-btn',
    '▾',
    'Collapse timeline',
    bind,
    () => {
      collapsed = !collapsed;
      body.hidden = collapsed;
      collapse.textContent = collapsed ? '▴' : '▾';
      collapse.setAttribute('aria-expanded', String(!collapsed));
    },
  );
  collapse.setAttribute('aria-expanded', 'true');
  head.appendChild(collapse);

  const yearB = yearSlider(doc, 'Year on the map');
  const yearBValue = el(doc, 'span', 's2-tl-value');
  const yearA = yearSlider(doc, 'Year compared against the map');
  const yearAValue = el(doc, 'span', 's2-tl-value');
  const fade = el(doc, 'input', 's2-tl-range');
  fade.type = 'range';
  fade.min = '0';
  fade.max = '100';
  fade.step = '1';
  fade.setAttribute('aria-label', 'Opacity of the compared year');
  const fadeValue = el(doc, 'span', 's2-tl-value');

  // Dragging only relabels; releasing commits, so a drag across six years
  // switches the map once instead of six times.
  bind(yearB, 'input', () => {
    yearBValue.textContent = yearB.value;
  });
  bind(yearB, 'change', () => onYearB(Number(yearB.value)));
  bind(yearA, 'input', () => {
    yearAValue.textContent = yearA.value;
  });
  bind(yearA, 'change', () => onYearA(Number(yearA.value)));
  bind(fade, 'input', () => {
    fadeValue.textContent = `${fade.value}%`;
    onFade(Number(fade.value) / 100);
  });

  const trackB = track(doc, 'MAP', yearB, yearBValue);
  const trackA = track(doc, 'VS', yearA, yearAValue);
  const trackFade = track(doc, 'OPACITY', fade, fadeValue);
  const ticks = el(doc, 'div', 's2-tl-ticks');
  for (const year of S2_CLOUDLESS_YEARS)
    ticks.appendChild(el(doc, 'span', 's2-tl-tick', String(year)));
  for (const node of [trackB, trackA, ticks, trackFade]) body.appendChild(node);
  panel.appendChild(head);
  panel.appendChild(body);

  function setIfIdle(input, value) {
    const text = String(value);
    if (input.value !== text) input.value = text;
  }

  function sync(state, { playing = false } = {}) {
    panel.hidden = !state?.available;
    const mode = timelineMode(state);
    for (const node of modeButtons) {
      const on = node.dataset.mode === mode;
      node.classList.toggle('active', on);
      node.setAttribute('aria-pressed', String(on));
    }
    play.textContent = playing ? '■ STOP' : '▶ PLAY';
    play.setAttribute('aria-pressed', String(playing));
    if (state?.yearB != null) {
      setIfIdle(yearB, state.yearB);
      yearBValue.textContent = String(state.yearB);
    }
    trackA.hidden = mode === 'current';
    if (state?.yearA != null) {
      setIfIdle(yearA, state.yearA);
      yearAValue.textContent = String(state.yearA);
    }
    trackFade.hidden = mode !== 'overlay';
    const percent = Math.round((state?.fade ?? 0.5) * 100);
    setIfIdle(fade, percent);
    fadeValue.textContent = `${percent}%`;
  }

  return { element: panel, sync };
}
