function rafAbortable(signal, cb) {
  if (signal.aborted) return;
  cb();
  requestAnimationFrame(() => rafAbortable(signal, cb));
}

function throttle(func, timeFrame) {
  var lastTime = 0;
  return function (...args) {
    var now = Date.now();
    if (now - lastTime >= timeFrame) {
      func(...args);
      lastTime = now;
    }
  };
}

const animDurationMs = 300;
// Not including 0
const frames = 9;

function startListening(cb) {
  const mouseDownController = new AbortController();
  const mouseDownSignal = mouseDownController.signal;
  const mouseDownCurrent = performance.now();
  let mouseDownCount = { current: 0 };
  rafAbortable(mouseDownSignal, () => {
    const nowDiff = performance.now() - mouseDownCurrent;
    const progress = nowDiff / animDurationMs;
    mouseDownCount.current = Math.floor(progress * frames);
    if (mouseDownCount.current > frames) {
      mouseDownController.abort();
      return;
    }
    const frameNum = mouseDownCount.current;
    bowties.style.backgroundImage = `url("/bowtie-button-demo/assets/frame${frameNum}.svg")`;
  });

  cb(mouseDownController, mouseDownCount);
}

function stopListening(mouseDownController, mouseDownCount) {
  mouseDownController.abort();
  const mouseUpController = new AbortController();
  const mouseUpSignal = mouseUpController.signal;
  const mouseUpCurrent = performance.now();

  rafAbortable(mouseUpSignal, () => {
    const nowDiff = performance.now() - mouseUpCurrent;
    const progress = nowDiff / animDurationMs;
    let count = Math.floor(progress * frames) + (frames - mouseDownCount.current);
    if (count > frames) {
      mouseUpController.abort();
      return;
    }
    if (count < 0) {
      count = 0;
    }
    const frameNum = frames - count;

    bowties.style.backgroundImage = `url("/bowtie-button-demo/assets/frame${frameNum}.svg")`;
  });
}

const el = document.querySelector('.bowtie-button');
const bowties = el.querySelector('.bowties');

el.addEventListener('pointerdown', () => {
  startListening((mouseDownController, mouseDownCount) => {
    document.addEventListener(
      'pointerup',
      () => {
        stopListening(mouseDownController, mouseDownCount);
      },
      { once: true }
    );
  })
});

let isInKeyEvent = false;

el.addEventListener('keydown', event => {
  if (isInKeyEvent) return;
  if (event.key !== 'Enter' && event.key !== " ") return;
  isInKeyEvent = true;
  startListening((mouseDownController, mouseDownCount) => {
    document.addEventListener(
      'keyup',
      () => {
        stopListening(mouseDownController, mouseDownCount);
        isInKeyEvent = false;
      },
      { once: true }
    );
  });
})
