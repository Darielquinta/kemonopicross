export function createTimer(update) {
  let start = 0;
  let handle = 0;
  let active = false;
  const startTimer = () => {
    if (active) return;
    active = true;
    start = Date.now();
    update(0);
    handle = setInterval(() => {
      update(Date.now() - start);
    }, 1000);
  };
  const stopTimer = () => {
    clearInterval(handle);
    active = false;
  };
  return { startTimer, stopTimer };
}
