// SENTINEL-2 TIME TOOLS in the map source tray: PLAY steps the basemap year by
// year, COMPARE opens a before/after session, both only on Sentinel-2.
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
  container.ownerDocument = { createElement: (tag) => makeElement(tag) };
  const sources = [
    { id: 'osm', label: 'OSM' },
    { id: 's2-cloudless-2024', label: 'Sentinel-2 2024' },
  ];
  let state = { activeId, status: 'ready' };
  const selected = [];
  const timers = [];
  const toggles = [];
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
  const comparisonState = { active: false, available: true, mode: 'swipe' };
  const controls = createMapSourceControls({
    container,
    controller,
    subscribe: () => () => {},
    createComparison: () => ({
      getState: () => ({
        ...comparisonState,
        available: /^s2-cloudless-/.test(state.activeId),
      }),
      toggle() {
        toggles.push('toggle');
        comparisonState.active = !comparisonState.active;
      },
      stepYearA() {},
      setMode() {},
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
  const panel = () =>
    container.children.find((child) => child.dataset.role === 's2-compare');
  const buttons = () => panel().children[0].children;
  return { controls, selected, timers, toggles, panel, buttons };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('the time tools stay hidden off Sentinel-2', () => {
  const f = fixture('osm');
  assert.equal(f.panel().hidden, true);
});

test('PLAY from the last year restarts at 2017, steps each year, and stops at the end', async () => {
  const f = fixture('s2-cloudless-2024');
  assert.equal(f.panel().hidden, false);
  const [play] = f.buttons();
  play.click();
  await tick();
  assert.deepEqual(f.selected, ['s2-cloudless-2017']);
  assert.equal(f.timers[0].ms, S2_PLAY_STEP_MS);
  assert.equal(play.textContent, '■ STOP');
  for (let i = 0; i < 8; i++) {
    f.timers[0].fn();
    await tick();
  }
  assert.equal(f.selected.at(-1), 's2-cloudless-2024');
  assert.equal(f.selected.length, 8, 'one select per year, none past 2024');
  assert.equal(f.timers[0].cleared, true);
  assert.equal(play.textContent, '▶ PLAY');
});

test('COMPARE toggles the comparison session', () => {
  const f = fixture('s2-cloudless-2021');
  const [, compare] = f.buttons();
  compare.click();
  assert.deepEqual(f.toggles, ['toggle']);
});
