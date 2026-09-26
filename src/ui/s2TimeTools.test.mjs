// SENTINEL-2 TIMELINE: the floating bar that plays the years, moves the map
// year, and switches CURRENT / OVERLAY / COMPARE, only on Sentinel-2.
//
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMapSourceControls,
  S2_PLAY_STEP_MS,
} from './mapSourceControls.js';

function makeElement(tagName = 'div') {
  const element = {
    tagName,
    type: '',
    className: '',
    title: '',
    disabled: false,
    textContent: '',
    dataset: {},
    attributes: {},
    listeners: {},
    children: [],
    classList: {
      toggle(name, force) {
        const classes = new Set(
          String(element.className).split(/\s+/).filter(Boolean),
        );
        const next = force === undefined ? !classes.has(name) : !!force;
        if (next) classes.add(name);
        else classes.delete(name);
        element.className = [...classes].join(' ');
      },
      contains(name) {
        return String(element.className).split(/\s+/).includes(name);
      },
    },
    appendChild(child) {
      element.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      element.attributes[name] = String(value);
    },
    getAttribute(name) {
      return element.attributes[name] ?? null;
    },
    addEventListener(type, handler) {
      (element.listeners[type] ||= []).push(handler);
    },
    removeEventListener(type, handler) {
      element.listeners[type] = (element.listeners[type] || []).filter(
        (current) => current !== handler,
      );
    },
    get hidden() {
      return element._hidden === true;
    },
    set hidden(value) {
      element._hidden = !!value;
    },
    click() {
      for (const handler of element.listeners.click || []) handler();
    },
  };
  Object.defineProperty(element, 'innerHTML', {
    get() {
      return '';
    },
    set() {
      element.children.length = 0;
    },
  });
  return element;
}

function fixture(activeId) {
  const container = makeElement();
  const doc = { createElement: (tag) => makeElement(tag) };
  container.ownerDocument = doc;
  const timelineParent = makeElement();
  timelineParent.ownerDocument = doc;
  const sources = [
    { id: 'osm', label: 'OSM' },
    { id: 's2-cloudless-2024', label: 'Sentinel-2 2024' },
  ];
  let state = { activeId, status: 'ready' };
  const selected = [];
  const timers = [];
  const calls = [];
  const controller = {
    getStacks: () => sources,
    getActiveId: () => state.activeId,
    getState: (status) => ({ ...state, status: status || state.status }),
    async setStack(id) {
      selected.push(id);
      state = { activeId: id, status: 'ready' };
      return controller.getState();
    },
  };
  const comparison = { active: false, mode: 'swipe', yearA: 2017, fade: 0.5 };
  const controls = createMapSourceControls({
    container,
    controller,
    timelineParent,
    subscribe: () => () => {},
    createComparison: () => ({
      getState: () => ({
        ...comparison,
        available: /^s2-cloudless-/.test(state.activeId),
        yearB: Number(state.activeId.split('-').at(-1)) || null,
      }),
      start(options) {
        calls.push(['start', options]);
        comparison.active = true;
        comparison.mode = options.mode;
      },
      stop() {
        calls.push(['stop']);
        comparison.active = false;
      },
      setMode(mode) {
        calls.push(['mode', mode]);
        comparison.mode = mode;
      },
      setYearA(year) {
        calls.push(['yearA', year]);
      },
      setFade() {},
      destroy() {},
    }),
    setTimer: (fn, ms) => {
      timers.push({ fn, ms, cleared: false });
      return timers.length - 1;
    },
    clearTimer: (id) => {
      timers[id].cleared = true;
    },
  });
  const bar = () =>
    timelineParent.children.find(
      (child) => child.dataset.role === 's2-timeline',
    );
  const head = () => bar().children[0];
  const mode = (name) =>
    head().children[1].children.find((node) => node.dataset.mode === name);
  const play = () => head().children[2];
  const tracks = () => bar().children[1].children;
  return { controls, selected, timers, calls, bar, mode, play, tracks };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('the timeline floats outside the tray and hides off Sentinel-2', () => {
  const f = fixture('osm');
  assert.ok(f.bar(), 'mounted in the timeline parent');
  assert.equal(f.bar().hidden, true);
});

test('PLAY from the last year restarts at 2017, steps each year, and stops at the end', async () => {
  const f = fixture('s2-cloudless-2024');
  assert.equal(f.bar().hidden, false);
  f.play().click();
  await tick();
  assert.deepEqual(f.selected, ['s2-cloudless-2017']);
  assert.equal(f.timers[0].ms, S2_PLAY_STEP_MS);
  assert.equal(f.play().textContent, '■ STOP');
  for (let i = 0; i < 8; i++) {
    f.timers[0].fn();
    await tick();
  }
  assert.equal(f.selected.at(-1), 's2-cloudless-2024');
  assert.equal(f.selected.length, 8, 'one select per year, none past 2024');
  assert.equal(f.timers[0].cleared, true);
  assert.equal(f.play().textContent, '▶ PLAY');
});

test('CURRENT, OVERLAY and COMPARE drive the comparison session', () => {
  const f = fixture('s2-cloudless-2021');
  assert.ok(f.mode('current').classList.contains('active'));
  f.mode('overlay').click();
  assert.deepEqual(f.calls.at(-1), ['start', { mode: 'fade' }]);
  assert.ok(f.mode('overlay').classList.contains('active'));
  f.mode('compare').click();
  assert.deepEqual(f.calls.at(-1), ['mode', 'swipe']);
  assert.ok(f.mode('compare').classList.contains('active'));
  f.mode('current').click();
  assert.deepEqual(f.calls.at(-1), ['stop']);
});

test('releasing the MAP slider switches the basemap once; VS sets year A', async () => {
  const f = fixture('s2-cloudless-2024');
  const [mapTrack, vsTrack] = f.tracks();
  const mapSlider = mapTrack.children[1];
  mapSlider.value = '2019';
  for (const handler of mapSlider.listeners.input || []) handler();
  assert.deepEqual(f.selected, [], 'dragging does not switch');
  for (const handler of mapSlider.listeners.change || []) handler();
  await tick();
  assert.deepEqual(f.selected, ['s2-cloudless-2019']);
  const vsSlider = vsTrack.children[1];
  vsSlider.value = '2018';
  for (const handler of vsSlider.listeners.change || []) handler();
  assert.deepEqual(f.calls.at(-1), ['yearA', 2018]);
});
