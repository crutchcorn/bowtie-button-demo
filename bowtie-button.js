export const ANIM_DURATION_MS = 300;
// The final frame is frame9, so there are nine intervals between frame0 and frame9.
export const FRAME_INTERVALS = 9;
const PROGRESS_EPSILON = 1e-12;

export const PRESS_KEYFRAMES = Object.freeze([
  Object.freeze({ transform: 'scale(1, 1)', opacity: 1 }),
  Object.freeze({ transform: 'scale(4, 2)', opacity: 0.24 }),
]);

export const PRESS_TIMING = Object.freeze({
  duration: ANIM_DURATION_MS,
  easing: 'ease-in-out',
  fill: 'both',
});

function createPressAnimation(bowties, documentRef, windowRef) {
  // The scale is deliberately non-uniform: it tightens the vertical tile spacing, and each frame
  // SVG pre-stretches its artwork to match so the bowties stay un-squished. See assets/README.md.
  return new windowRef.Animation(
    new windowRef.KeyframeEffect(bowties, PRESS_KEYFRAMES, PRESS_TIMING),
    documentRef.timeline
  );
}

export function initializeBowtieButton(button, options = {}) {
  const documentRef = options.documentRef ?? button.ownerDocument;
  const windowRef = options.windowRef ?? documentRef.defaultView;
  const bowties = options.bowties ?? button.querySelector('.bowties');

  if (!bowties) throw new Error('The bowtie button is missing its .bowties layer.');

  const press = options.animation ?? createPressAnimation(bowties, documentRef, windowRef);
  const now = options.now ?? (() => windowRef.performance.now());
  const requestFrame = options.requestFrame ?? (callback => windowRef.requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? (id => windowRef.cancelAnimationFrame(id));

  let progress = 0;
  let targetProgress = 0;
  let previousTimestamp = null;
  let rafId = null;
  let renderedFrame = 0;
  let destroyed = false;

  // This effect never plays on its own. A single requestAnimationFrame loop seeks it and swaps the
  // SVG frame from the same progress value, so rapid direction changes cannot leave two clocks out
  // of step.
  function render() {
    press.currentTime = progress * ANIM_DURATION_MS;

    const frameNum = Math.min(FRAME_INTERVALS, Math.floor(progress * FRAME_INTERVALS));
    if (frameNum === renderedFrame) return;

    renderedFrame = frameNum;
    bowties.style.backgroundImage = `url("/bowtie-button-demo/assets/frame${frameNum}.svg")`;
  }

  function advance(timestamp) {
    if (previousTimestamp === null) return;

    const sampledTimestamp = Math.max(timestamp, previousTimestamp);
    const elapsedProgress = (sampledTimestamp - previousTimestamp) / ANIM_DURATION_MS;
    progress = targetProgress === 1
      ? Math.min(targetProgress, progress + elapsedProgress)
      : Math.max(targetProgress, progress - elapsedProgress);
    if (Math.abs(progress - targetProgress) < PROGRESS_EPSILON) progress = targetProgress;
    previousTimestamp = sampledTimestamp;
  }

  function finishAtTarget() {
    if (rafId !== null) cancelFrame(rafId);
    previousTimestamp = null;
    rafId = null;

    if (targetProgress !== 0) return;

    // Once the press has fully unwound, hand opacity back to the CSS hover rule and let the
    // stylesheet own frame0 again. Canceling before this boundary used to expose an unsynchronised
    // frame.
    press.cancel();
    bowties.style.removeProperty('background-image');
    renderedFrame = 0;
  }

  function tick() {
    if (destroyed) return;

    advance(now());
    render();

    if (progress === targetProgress) {
      finishAtTarget();
      return;
    }

    rafId = requestFrame(tick);
  }

  function setPressed(isPressed) {
    if (destroyed) return;

    const nextTarget = isPressed ? 1 : 0;
    if (nextTarget === targetProgress) return;

    const timestamp = now();
    // Account for time since the last paint in the old direction before reversing. This makes a
    // rapid release/re-press continuous even when both events land between animation frames.
    advance(timestamp);
    targetProgress = nextTarget;
    if (previousTimestamp === null) previousTimestamp = timestamp;
    render();

    if (progress === targetProgress) {
      finishAtTarget();
      return;
    }

    if (rafId === null) rafId = requestFrame(tick);
  }

  const activePointers = new Set();
  const activeKeys = new Set();

  function syncPressedState() {
    setPressed(activePointers.size > 0 || activeKeys.size > 0);
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;

    activePointers.add(event.pointerId);
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // The persistent document listeners below are also a fallback when capture is unavailable.
    }
    syncPressedState();
  }

  function releasePointer(event) {
    if (!activePointers.delete(event.pointerId)) return;
    syncPressedState();
  }

  function isActivationKey(event) {
    return event.key === 'Enter' || event.key === ' ';
  }

  function keyId(event) {
    return event.code || event.key;
  }

  function onKeyDown(event) {
    if (!isActivationKey(event)) return;

    activeKeys.add(keyId(event));
    syncPressedState();
  }

  function onKeyUp(event) {
    if (!isActivationKey(event) || !activeKeys.delete(keyId(event))) return;
    syncPressedState();
  }

  function releaseAllInputs() {
    if (activePointers.size === 0 && activeKeys.size === 0) return;

    activePointers.clear();
    activeKeys.clear();
    syncPressedState();
  }

  function onVisibilityChange() {
    if (documentRef.hidden) releaseAllInputs();
  }

  button.addEventListener('pointerdown', onPointerDown);
  documentRef.addEventListener('pointerup', releasePointer, true);
  documentRef.addEventListener('pointercancel', releasePointer, true);
  button.addEventListener('lostpointercapture', releasePointer);
  button.addEventListener('keydown', onKeyDown);
  documentRef.addEventListener('keyup', onKeyUp, true);
  windowRef.addEventListener('blur', releaseAllInputs);
  documentRef.addEventListener('visibilitychange', onVisibilityChange);

  function destroy() {
    if (destroyed) return;
    destroyed = true;

    button.removeEventListener('pointerdown', onPointerDown);
    documentRef.removeEventListener('pointerup', releasePointer, true);
    documentRef.removeEventListener('pointercancel', releasePointer, true);
    button.removeEventListener('lostpointercapture', releasePointer);
    button.removeEventListener('keydown', onKeyDown);
    documentRef.removeEventListener('keyup', onKeyUp, true);
    windowRef.removeEventListener('blur', releaseAllInputs);
    documentRef.removeEventListener('visibilitychange', onVisibilityChange);

    activePointers.clear();
    activeKeys.clear();
    if (rafId !== null) cancelFrame(rafId);
    rafId = null;
    previousTimestamp = null;
    progress = 0;
    targetProgress = 0;
    press.cancel();
    bowties.style.removeProperty('background-image');
    renderedFrame = 0;
  }

  return { destroy };
}
