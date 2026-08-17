import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ANIM_DURATION_MS,
  BOWTIE_SPRITE_URL,
  FRAME_INTERVALS,
  PRESS_KEYFRAMES,
  PRESS_TIMING,
  initializeBowtieButton,
} from './bowtie-button.js';
import { bootBowtieButton } from './script.js';

const styles = readFileSync('styles.css', 'utf8');
const html = readFileSync('index.html', 'utf8');
const sprite = readFileSync('assets/bowtie-frames.svg', 'utf8');
// The deleted frame files totalled this many bytes when each response was gzipped independently.
const LEGACY_FRAME_GZIP_BYTES = 9_506;

const EXPECTED_SPRITE_FRAMES = [
  ['1', null, '0.4167', '0', '4', '#006590'],
  ['1.0477', '-5.412119421498073', '0.444', '0.1751682975396242', '3.7921345603796697', '#0c6d97'],
  ['1.1842', '-28.902769094037993', '0.5627', '0.6952348396452721', '2.8590526719596374', '#2e83a9'],
  ['1.3764', '-75.4465370697838', '0.7977', '0.9207757834293515', '1.9546907958212003', '#5da1c3'],
  ['1.5765', '-114.7137485414699', '0.9961', '0.9929626732598482', '1.5216257939763609', '#8dc0de'],
  ['1.7461', '-138.12672167542237', '1.1143', null, '1.3228498621384226', '#b4d9f4'],
  ['1.8689', '-151.928004265843', '1.184', null, '1.2533713043908152', '#c7e5fe'],
  ['1.9466', '-159.85056626515922', '1.224', null, '1.25', '#c8e6ff'],
  ['1.9876', '-163.83884108787495', '1.2442', null, '1.25', '#c8e6ff'],
  ['2', '-165', '1.25', null, '1.25', '#c8e6ff'],
];

const cleanups = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()();
  delete document.hidden;
  delete document.timeline;
  delete window.Animation;
  delete window.cancelAnimationFrame;
  delete window.KeyframeEffect;
  delete window.requestAnimationFrame;
  document.body.replaceChildren();
});

function dispatch(target, type, properties = {}) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  for (const [name, value] of Object.entries(properties)) {
    Object.defineProperty(event, name, { configurable: true, value });
  }
  target.dispatchEvent(event);
  return event;
}

function createHarness({ pointerCaptureThrows = false } = {}) {
  document.body.innerHTML = `
    <button class="bowtie-button">
      Test button
      <div class="bowtie-visibility"><div class="bowties"></div></div>
    </button>
  `;

  const button = document.querySelector('.bowtie-button');
  const bowties = button.querySelector('.bowties');
  const setPointerCapture = vi.fn(pointerId => {
    if (pointerCaptureThrows) throw new Error(`Cannot capture pointer ${pointerId}`);
  });
  button.setPointerCapture = setPointerCapture;

  let clock = 0;
  let nextRafId = 1;
  const pendingFrames = new Map();
  const animation = {
    currentTime: null,
    cancel: vi.fn(() => {
      animation.currentTime = null;
    }),
  };
  const requestFrame = vi.fn(callback => {
    const id = nextRafId;
    nextRafId += 1;
    pendingFrames.set(id, callback);
    return id;
  });
  const cancelFrame = vi.fn(id => pendingFrames.delete(id));

  const { destroy } = initializeBowtieButton(button, {
    animation,
    now: () => clock,
    requestFrame,
    cancelFrame,
  });
  cleanups.push(destroy);

  function setTime(timestamp) {
    clock = timestamp;
  }

  function flushFrame(timestamp = clock) {
    clock = timestamp;
    const callbacks = [...pendingFrames.values()];
    pendingFrames.clear();
    for (const callback of callbacks) callback();
  }

  function pointerDown(pointerId = 1, mouseButton = 0) {
    dispatch(button, 'pointerdown', { pointerId, button: mouseButton });
  }

  function pointerUp(pointerId = 1) {
    dispatch(document, 'pointerup', { pointerId });
  }

  function pointerCancel(pointerId = 1) {
    dispatch(document, 'pointercancel', { pointerId });
  }

  function losePointerCapture(pointerId = 1) {
    dispatch(button, 'lostpointercapture', { pointerId });
  }

  function keyDown(key, code = key === ' ' ? 'Space' : key) {
    dispatch(button, 'keydown', { key, code });
  }

  function keyUp(key, code = key === ' ' ? 'Space' : key) {
    dispatch(document, 'keyup', { key, code });
  }

  function renderedFrame() {
    const match = bowties.style.backgroundImage.match(/#frame(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function expectSynchronized() {
    if (animation.currentTime === null) {
      expect(renderedFrame()).toBe(0);
      return;
    }

    const expectedFrame = Math.min(
      FRAME_INTERVALS,
      Math.floor((animation.currentTime / ANIM_DURATION_MS) * FRAME_INTERVALS)
    );
    expect(renderedFrame()).toBe(expectedFrame);
  }

  return {
    animation,
    bowties,
    button,
    cancelFrame,
    destroy,
    expectSynchronized,
    flushFrame,
    keyDown,
    keyUp,
    losePointerCapture,
    pendingCount: () => pendingFrames.size,
    pointerCancel,
    pointerDown,
    pointerUp,
    renderedFrame,
    requestFrame,
    setPointerCapture,
    setTime,
  };
}

describe('bowtie press animation', () => {
  it('keeps the scale, fade, duration, and easing contract intact', () => {
    expect(PRESS_KEYFRAMES).toEqual([
      { transform: 'scale(1, 1)', opacity: 1 },
      { transform: 'scale(4, 2)', opacity: 0.24 },
    ]);
    expect(PRESS_TIMING).toEqual({
      duration: 300,
      easing: 'ease-in-out',
      fill: 'both',
    });
    expect(styles).toContain(`background-image: url('${BOWTIE_SPRITE_URL}#frame0')`);
    expect(styles).toContain('background-size: 8px 8px');
  });

  it('packages ten unique, square views into one compact SVG sprite', () => {
    const spriteDocument = new window.DOMParser().parseFromString(sprite, 'image/svg+xml');
    expect(spriteDocument.querySelector('parsererror')).toBeNull();

    const views = [...spriteDocument.querySelectorAll('view')];
    expect(views.map(view => [view.id, view.getAttribute('viewBox')])).toEqual(
      Array.from({ length: 10 }, (_, frame) => [
        `frame${frame}`,
        `${frame * 48} 0 48 48`,
      ])
    );

    const ids = [...spriteDocument.querySelectorAll('[id]')].map(element => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(spriteDocument.querySelectorAll('use')).toHaveLength(20);

    const frameGroups = [...spriteDocument.documentElement.children].filter(
      element => element.tagName === 'g'
    );
    expect(frameGroups).toHaveLength(EXPECTED_SPRITE_FRAMES.length);
    for (const [frame, expected] of EXPECTED_SPRITE_FRAMES.entries()) {
      const [squish, angle, bowScale, opacity, dotScale, dotFill] = expected;
      const frameGroup = frameGroups[frame];
      const squishGroup = frameGroup.firstElementChild;
      const rotationGroup = squishGroup.children[0];
      const bow = rotationGroup.firstElementChild;
      const dot = squishGroup.children[1];
      const rotate = angle === null ? '' : `rotate(${angle} 24 24) `;

      expect(frameGroup.getAttribute('transform')).toBe(`translate(${frame * 48} 0)`);
      expect(squishGroup.getAttribute('transform')).toBe(
        `translate(24 24) scale(1 ${squish}) translate(-24 -24)`
      );
      expect(rotationGroup.getAttribute('transform')).toBe(
        `${rotate}translate(24 24) scale(${bowScale} ${bowScale}) translate(-24 -24)`
      );
      expect(bow.getAttribute('href')).toBe('#bow-shape');
      expect(bow.getAttribute('fill-opacity')).toBe(opacity);
      expect(dot.getAttribute('href')).toBe('#dot-shape');
      expect(dot.getAttribute('transform')).toBe(
        `translate(24 24) scale(${dotScale} ${dotScale}) translate(-24 -24)`
      );
      expect(dot.getAttribute('fill')).toBe(dotFill);
    }

    const legacyFrames = readdirSync('assets').filter(file => /^frame\d+\.svg$/.test(file));
    expect(legacyFrames).toEqual([]);
    expect(html).not.toMatch(/assets\/frame\d+\.svg/);

    expect(gzipSync(sprite, { level: 9 }).byteLength).toBeLessThan(
      LEGACY_FRAME_GZIP_BYTES / 4
    );
  });

  it('wires the real animation effect to the bowtie layer and document timeline', () => {
    document.body.innerHTML = `
      <button class="bowtie-button"><div class="bowties"></div></button>
    `;
    const button = document.querySelector('.bowtie-button');
    const bowties = button.querySelector('.bowties');
    button.setPointerCapture = vi.fn();

    const timeline = {};
    const animation = {
      currentTime: null,
      cancel: vi.fn(() => {
        animation.currentTime = null;
      }),
    };
    const KeyframeEffect = vi.fn(function FakeKeyframeEffect(target, keyframes, timing) {
      this.target = target;
      this.keyframes = keyframes;
      this.timing = timing;
    });
    const Animation = vi.fn(function FakeAnimation(effect, animationTimeline) {
      animation.effect = effect;
      animation.timeline = animationTimeline;
      return animation;
    });
    Object.defineProperty(document, 'timeline', { configurable: true, value: timeline });
    Object.defineProperty(window, 'KeyframeEffect', { configurable: true, value: KeyframeEffect });
    Object.defineProperty(window, 'Animation', { configurable: true, value: Animation });

    const pendingFrames = new Map();
    const controller = bootBowtieButton(document, {
      now: () => 0,
      requestFrame: callback => {
        pendingFrames.set(1, callback);
        return 1;
      },
      cancelFrame: id => pendingFrames.delete(id),
    });
    expect(controller).not.toBeNull();
    const { destroy } = controller;
    cleanups.push(destroy);

    expect(KeyframeEffect).toHaveBeenCalledWith(bowties, PRESS_KEYFRAMES, PRESS_TIMING);
    expect(Animation).toHaveBeenCalledWith(expect.any(KeyframeEffect), timeline);

    dispatch(button, 'pointerdown', { pointerId: 1, button: 0 });
    expect(animation.currentTime).toBe(0);
    expect(pendingFrames.size).toBe(1);
  });

  it('automatically boots the production entry module', async () => {
    document.body.innerHTML = `
      <button class="bowtie-button"><div class="bowties"></div></button>
    `;
    const button = document.querySelector('.bowtie-button');
    button.setPointerCapture = vi.fn();

    const animation = {
      currentTime: null,
      cancel: vi.fn(() => {
        animation.currentTime = null;
      }),
    };
    const KeyframeEffect = vi.fn(function FakeKeyframeEffect() {});
    const Animation = vi.fn(function FakeAnimation() {
      return animation;
    });
    Object.defineProperty(document, 'timeline', { configurable: true, value: {} });
    Object.defineProperty(window, 'KeyframeEffect', { configurable: true, value: KeyframeEffect });
    Object.defineProperty(window, 'Animation', { configurable: true, value: Animation });
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: vi.fn(() => 1),
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      value: vi.fn(),
    });

    vi.resetModules();
    const { autoController } = await import('./script.js');
    expect(autoController).not.toBeNull();
    cleanups.push(autoController.destroy);

    dispatch(button, 'pointerdown', { pointerId: 1, button: 0 });
    expect(animation.currentTime).toBe(0);
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('reaches frame9 and the exact animation endpoint on a full hold', () => {
    const harness = createHarness();

    harness.pointerDown();
    expect(harness.animation.currentTime).toBe(0);
    expect(harness.pendingCount()).toBe(1);

    harness.flushFrame(100);
    expect(harness.animation.currentTime).toBe(100);
    expect(harness.renderedFrame()).toBe(3);
    harness.expectSynchronized();

    harness.flushFrame(300);
    expect(harness.animation.currentTime).toBe(300);
    expect(harness.renderedFrame()).toBe(9);
    expect(harness.pendingCount()).toBe(0);
    expect(harness.animation.cancel).not.toHaveBeenCalled();
  });

  it('maps every animation frame to a fragment of the same sprite', () => {
    const harness = createHarness();
    const frameTimes = [34, 67, 100, 134, 167, 200, 234, 267, 300];
    const spriteUrls = [];

    harness.pointerDown();
    for (const [index, timestamp] of frameTimes.entries()) {
      const frame = index + 1;
      harness.flushFrame(timestamp);
      expect(harness.renderedFrame()).toBe(frame);
      expect(harness.bowties.style.backgroundImage).toContain(
        `${BOWTIE_SPRITE_URL}#frame${frame}`
      );
      spriteUrls.push(harness.bowties.style.backgroundImage.split('#')[0]);
    }

    expect(new Set(spriteUrls).size).toBe(1);
    expect(harness.pendingCount()).toBe(0);
  });

  it('snaps six fractional steps to the exact forward and reverse endpoints', () => {
    const harness = createHarness();

    harness.pointerDown();
    for (let step = 1; step <= 6; step += 1) harness.flushFrame(step * 50);
    expect(harness.animation.currentTime).toBe(300);
    expect(harness.renderedFrame()).toBe(9);
    expect(harness.pendingCount()).toBe(0);

    harness.pointerUp();
    for (let step = 1; step <= 6; step += 1) harness.flushFrame(300 + step * 50);
    expect(harness.animation.currentTime).toBeNull();
    expect(harness.renderedFrame()).toBe(0);
    expect(harness.pendingCount()).toBe(0);
    expect(harness.animation.cancel).toHaveBeenCalledTimes(1);
  });

  it('fully unwinds, clears inline frame state, and starts cleanly again', () => {
    const harness = createHarness();

    harness.pointerDown();
    harness.flushFrame(300);
    harness.pointerUp();
    harness.flushFrame(450);
    expect(harness.animation.currentTime).toBe(150);
    expect(harness.renderedFrame()).toBe(4);

    harness.flushFrame(600);
    expect(harness.animation.currentTime).toBeNull();
    expect(harness.bowties.style.backgroundImage).toBe('');
    expect(harness.pendingCount()).toBe(0);
    expect(harness.animation.cancel).toHaveBeenCalledTimes(1);

    harness.pointerDown(2);
    expect(harness.animation.currentTime).toBe(0);
    expect(harness.pendingCount()).toBe(1);
    harness.flushFrame(650);
    expect(harness.animation.currentTime).toBe(50);
    expect(harness.renderedFrame()).toBe(1);
    harness.expectSynchronized();
  });

  it('settles elapsed time in the old direction before a rapid reversal', () => {
    const harness = createHarness();

    harness.pointerDown();
    harness.setTime(120);
    harness.pointerUp();
    expect(harness.animation.currentTime).toBe(120);
    expect(harness.renderedFrame()).toBe(3);
    expect(harness.pendingCount()).toBe(1);

    harness.setTime(150);
    harness.pointerDown();
    expect(harness.animation.currentTime).toBeCloseTo(90);
    expect(harness.renderedFrame()).toBe(2);
    expect(harness.pendingCount()).toBe(1);

    harness.flushFrame(180);
    expect(harness.animation.currentTime).toBeCloseTo(120);
    expect(harness.renderedFrame()).toBe(3);
    harness.expectSynchronized();
  });

  it('survives dense press bursts with one RAF and synchronized frames', () => {
    const harness = createHarness();
    let time = 0;

    harness.pointerDown();
    for (let cycle = 0; cycle < 24; cycle += 1) {
      time += 29;
      harness.setTime(time);
      harness.pointerUp();
      expect(harness.pendingCount()).toBeLessThanOrEqual(1);
      harness.expectSynchronized();

      time += 11;
      harness.setTime(time);
      harness.pointerDown();
      expect(harness.pendingCount()).toBeLessThanOrEqual(1);
      harness.expectSynchronized();
    }

    time += 29;
    harness.setTime(time);
    harness.pointerUp();
    harness.flushFrame(time + ANIM_DURATION_MS);

    expect(harness.animation.currentTime).toBeNull();
    expect(harness.renderedFrame()).toBe(0);
    expect(harness.pendingCount()).toBe(0);
  });

  it('stays synchronized when rapid reversals interleave with animation frames', () => {
    const harness = createHarness();

    function expectTime(expectedTime) {
      expect(harness.animation.currentTime).toBeCloseTo(expectedTime);
      expect(harness.pendingCount()).toBe(1);
      harness.expectSynchronized();
    }

    harness.pointerDown();
    harness.flushFrame(16);
    expectTime(16);

    harness.setTime(29);
    harness.pointerUp();
    expectTime(29);
    harness.flushFrame(32);
    expectTime(26);

    harness.setTime(40);
    harness.pointerDown();
    expectTime(18);
    harness.flushFrame(48);
    expectTime(26);
    harness.flushFrame(64);
    expectTime(42);

    harness.setTime(69);
    harness.pointerUp();
    expectTime(47);
    harness.setTime(80);
    harness.pointerDown();
    expectTime(36);
    harness.flushFrame(96);
    expectTime(52);

    harness.setTime(109);
    harness.pointerUp();
    expectTime(65);
    harness.flushFrame(112);
    expectTime(62);
    harness.setTime(120);
    harness.pointerDown();
    expectTime(54);
    harness.flushFrame(128);
    expectTime(62);

    harness.setTime(149);
    harness.pointerUp();
    expectTime(83);
    harness.flushFrame(160);
    expectTime(72);
    harness.pointerDown();
    expectTime(72);
    harness.flushFrame(176);
    expectTime(88);

    harness.setTime(189);
    harness.pointerUp();
    expectTime(101);
    for (const frameTime of [208, 224, 240, 256, 272, 288]) {
      harness.flushFrame(frameTime);
      expectTime(101 - (frameTime - 189));
    }
    harness.flushFrame(304);
    expect(harness.animation.currentTime).toBeNull();
    expect(harness.renderedFrame()).toBe(0);
    expect(harness.pendingCount()).toBe(0);
  });

  it('cancels the queued RAF on an immediate release', () => {
    const harness = createHarness();

    harness.pointerDown();
    expect(harness.pendingCount()).toBe(1);
    harness.pointerUp();

    expect(harness.animation.currentTime).toBeNull();
    expect(harness.pendingCount()).toBe(0);
    expect(harness.cancelFrame).toHaveBeenCalledTimes(1);
    expect(harness.bowties.style.backgroundImage).toBe('');

    harness.flushFrame(500);
    expect(harness.animation.currentTime).toBeNull();
    expect(harness.pendingCount()).toBe(0);
  });

  it('waits for every active pointer before reversing', () => {
    const harness = createHarness();

    harness.pointerDown(1);
    harness.setTime(10);
    harness.pointerDown(2);
    harness.flushFrame(80);
    expect(harness.animation.currentTime).toBe(80);

    harness.pointerUp(1);
    harness.flushFrame(100);
    expect(harness.animation.currentTime).toBe(100);

    harness.pointerUp(2);
    harness.flushFrame(120);
    expect(harness.animation.currentTime).toBe(80);
    expect(harness.setPointerCapture).toHaveBeenCalledTimes(2);
    harness.expectSynchronized();
  });

  it('does not let pointer, keyboard, repeat, or unrelated key events release each other', () => {
    const harness = createHarness();

    harness.pointerDown();
    harness.setTime(20);
    harness.keyDown('Enter');
    harness.keyDown('Enter');
    harness.flushFrame(100);
    expect(harness.animation.currentTime).toBe(100);

    harness.pointerUp();
    harness.flushFrame(140);
    expect(harness.animation.currentTime).toBe(140);

    harness.keyUp('Escape');
    harness.flushFrame(160);
    expect(harness.animation.currentTime).toBe(160);

    harness.keyUp('Enter');
    harness.flushFrame(190);
    expect(harness.animation.currentTime).toBe(130);
    harness.expectSynchronized();
  });

  it('waits for both activation keys before reversing', () => {
    const harness = createHarness();

    harness.keyDown('Enter');
    harness.setTime(20);
    harness.keyDown(' ');
    harness.flushFrame(100);
    expect(harness.animation.currentTime).toBe(100);

    harness.keyUp('Enter');
    harness.flushFrame(140);
    expect(harness.animation.currentTime).toBe(140);

    harness.keyUp(' ');
    harness.flushFrame(170);
    expect(harness.animation.currentTime).toBeCloseTo(110);
    harness.expectSynchronized();
  });

  it('handles cancellation, lost capture, blur, and hidden documents idempotently', () => {
    const harness = createHarness();

    harness.pointerDown(1);
    harness.setTime(60);
    harness.pointerCancel(1);
    expect(harness.animation.currentTime).toBe(60);
    harness.flushFrame(120);
    expect(harness.animation.currentTime).toBeNull();

    harness.pointerDown(2);
    harness.setTime(170);
    harness.losePointerCapture(2);
    expect(harness.animation.currentTime).toBe(50);
    harness.setTime(180);
    harness.pointerUp(2);
    expect(harness.animation.currentTime).toBe(50);
    harness.flushFrame(230);
    expect(harness.animation.currentTime).toBeNull();

    harness.pointerDown(3);
    harness.keyDown(' ');
    harness.setTime(290);
    dispatch(window, 'blur');
    expect(harness.animation.currentTime).toBe(60);
    harness.flushFrame(350);
    expect(harness.animation.currentTime).toBeNull();

    harness.pointerDown(4);
    harness.setTime(390);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    dispatch(document, 'visibilitychange');
    expect(harness.animation.currentTime).toBe(40);
    harness.flushFrame(430);
    expect(harness.animation.currentTime).toBeNull();
  });

  it('ignores non-primary clicks and falls back when pointer capture throws', () => {
    const harness = createHarness({ pointerCaptureThrows: true });

    harness.pointerDown(1, 2);
    expect(harness.pendingCount()).toBe(0);
    expect(harness.setPointerCapture).not.toHaveBeenCalled();

    harness.pointerDown(2);
    expect(harness.pendingCount()).toBe(1);
    expect(harness.setPointerCapture).toHaveBeenCalledWith(2);

    harness.setTime(50);
    harness.pointerUp(2);
    harness.flushFrame(100);
    expect(harness.animation.currentTime).toBeNull();
    expect(harness.pendingCount()).toBe(0);
  });

  it('clamps long and backward clock jumps and removes listeners on destroy', () => {
    const harness = createHarness();

    harness.pointerDown();
    harness.flushFrame(1_000);
    expect(harness.animation.currentTime).toBe(300);
    expect(harness.pendingCount()).toBe(0);

    harness.pointerUp();
    harness.flushFrame(900);
    expect(harness.animation.currentTime).toBe(300);
    harness.flushFrame(1_100);
    expect(harness.animation.currentTime).toBeCloseTo(200);
    harness.flushFrame(1_300);
    expect(harness.animation.currentTime).toBeNull();

    harness.pointerDown(2);
    expect(harness.pendingCount()).toBe(1);
    harness.destroy();
    harness.destroy();
    expect(harness.pendingCount()).toBe(0);

    harness.pointerDown(3);
    harness.keyDown('Enter');
    expect(harness.pendingCount()).toBe(0);
    expect(harness.animation.currentTime).toBeNull();
  });
});
