/**
 * Sentinel-2 time tools under the map source chips: PLAY steps the basemap
 * through every annual mosaic; COMPARE opens a before/after of two years
 * (swipe divider or fade). Visible only while a Sentinel-2 year is the basemap.
 *
 * DOM only: every action goes back through callbacks, and `sync` redraws from
 * the comparison state plus the play flag, never from the click.
 */
export const S2_COMPARE_PANEL_ROLE = 's2-compare';

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

/**
 * @param {Document} doc
 * @param {object} handlers
 * @param {() => void} handlers.onPlay
 * @param {() => void} handlers.onToggleCompare
 * @param {(step: -1|1) => void} handlers.onStepYearA
 * @param {(mode: 'swipe'|'fade') => void} handlers.onMode
 * @param {(value: number) => void} handlers.onFade
 * @param {(element: HTMLElement, type: string, listener: Function) => void} [handlers.bind]
 * @returns {{ element: HTMLElement, sync: (state: object, view: { playing: boolean }) => void }}
 */
export function renderS2CompareControls(
  doc,
  {
    onPlay,
    onToggleCompare,
    onStepYearA,
    onMode,
    onFade,
    bind = (node, type, listener) => node.addEventListener(type, listener),
  },
) {
  const panel = el(doc, 'div', 's2-compare');
  panel.dataset.role = S2_COMPARE_PANEL_ROLE;
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Sentinel-2 time tools');

  const actions = el(doc, 'div', 's2-compare-row');
  const play = button(
    doc,
    's2-compare-btn',
    '▶ PLAY',
    'Play every year',
    bind,
    () => onPlay(),
  );
  const compare = button(
    doc,
    's2-compare-btn',
    'COMPARE',
    'Compare two years',
    bind,
    () => onToggleCompare(),
  );
  actions.appendChild(play);
  actions.appendChild(compare);

  const details = el(doc, 'div', 's2-compare-row s2-compare-details');
  const yearLabel = el(doc, 'span', 's2-compare-a');
  const yearA = el(doc, 'span', 's2-compare-year');
  const prev = button(
    doc,
    's2-compare-step',
    '◀',
    'Earlier comparison year',
    bind,
    () => onStepYearA(-1),
  );
  const next = button(
    doc,
    's2-compare-step',
    '▶',
    'Later comparison year',
    bind,
    () => onStepYearA(1),
  );
  for (const node of [
    el(doc, 'span', 's2-compare-tag', 'A'),
    prev,
    yearA,
    next,
  ])
    yearLabel.appendChild(node);
  const swipe = button(
    doc,
    's2-compare-mode',
    'SWIPE',
    'Swipe divider',
    bind,
    () => onMode('swipe'),
  );
  const fadeMode = button(
    doc,
    's2-compare-mode',
    'FADE',
    'Fade between years',
    bind,
    () => onMode('fade'),
  );
  const fade = el(doc, 'input', 's2-compare-fade');
  fade.type = 'range';
  fade.min = '0';
  fade.max = '100';
  fade.step = '1';
  fade.setAttribute('aria-label', 'Opacity of year A');
  bind(fade, 'input', () => onFade(Number(fade.value) / 100));
  for (const node of [yearLabel, swipe, fadeMode, fade])
    details.appendChild(node);
  panel.appendChild(actions);
  panel.appendChild(details);

  function sync(state, { playing = false } = {}) {
    panel.hidden = !state?.available;
    play.textContent = playing ? '■ STOP' : '▶ PLAY';
    play.setAttribute('aria-pressed', String(playing));
    compare.textContent = state?.active ? '✕ CLOSE COMPARE' : 'COMPARE';
    compare.setAttribute('aria-pressed', String(!!state?.active));
    details.hidden = !state?.active;
    yearA.textContent = state?.yearA == null ? '' : String(state.yearA);
    for (const [node, mode] of [
      [swipe, 'swipe'],
      [fadeMode, 'fade'],
    ]) {
      const on = state?.mode === mode;
      node.classList.toggle('active', on);
      node.setAttribute('aria-pressed', String(on));
    }
    fade.hidden = state?.mode !== 'fade';
    const percent = String(Math.round((state?.fade ?? 0.5) * 100));
    if (fade.value !== percent) fade.value = percent;
  }

  return { element: panel, sync };
}
