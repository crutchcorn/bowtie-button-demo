function rafAbortable(signal, cb) {
  if (signal.aborted) return;
  cb();
  requestAnimationFrame(() => rafAbortable(signal, cb));
}

/**
 * @param {number | string} number
 * @param {number} amountOfNumbers
 * @returns {string}
 */
function prefixNumberWithZeros(number, amountOfNumbers) {
  if (typeof number === 'string') number = Number(number);
  if (
    Number.isNaN(number) ||
    !Number.isFinite(number) ||
    !Number.isSafeInteger(number)
  ) {
    return NaN;
  }

  let strNum = number.toString();
  if (strNum.length > amountOfNumbers) {
    return strNum;
  }
  const numOfZerosToPrefix = amountOfNumbers - strNum.length;
  for (let i = 0; i < numOfZerosToPrefix; i++) {
    strNum = '0' + strNum;
  }
  return strNum;
}

const el = document.querySelector('.bowtie-button');
const bowties = el.querySelector('.bowties');
el.addEventListener('mousedown', () => {
  const mouseDownController = new AbortController();
  const mouseDownSignal = mouseDownController.signal;
  const mouseDownCurrent = performance.now();
  const animDurationMs = 300;
  // Not including 0
  const frames = 15;
  let mouseDownCount = 0;
  rafAbortable(mouseDownSignal, () => {
    const nowDiff = performance.now() - mouseDownCurrent;
    const progress = nowDiff / animDurationMs;
    mouseDownCount = Math.floor(progress * frames);
    if (mouseDownCount > frames) {
      mouseDownController.abort();
      return;
    }
    const frameNum = prefixNumberWithZeros(
      mouseDownCount,
      2
    );
    bowties.style.backgroundImage = `url("/assets/frame${frameNum}.svg")`;
  });

  document.addEventListener(
    'mouseup',
    () => {
      mouseDownController.abort();
      const mouseUpController = new AbortController();
      const mouseUpSignal = mouseUpController.signal;
      const mouseUpCurrent = performance.now();

      rafAbortable(mouseUpSignal, () => {
        const nowDiff = performance.now() - mouseUpCurrent;
        const progress = nowDiff / animDurationMs;
        let count = Math.floor(progress * frames) + (frames - mouseDownCount);
        if (count > frames) {
          mouseUpController.abort();
          return;
        }
        if (count < 0) {
          count = 0;
        }
        const frameNum = prefixNumberWithZeros(
          frames - count,
          2
        );
    
        bowties.style.backgroundImage = `url("/assets/frame${frameNum}.svg")`;
      });
    },
    { once: true }
  );
});
