/* ==========================================================================
   OPERATING RHYTHM 3-STEP COMPOUND DIAL STEPPER
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.stepper-card');
  const dashBtns = document.querySelectorAll('.step-dash-btn');

  let currentStepIndex = 0;
  let autoTimer = null;

  function renderStep(index) {
    currentStepIndex = index;

    cards.forEach((card, i) => {
      if (i === index) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    dashBtns.forEach((btn, i) => {
      if (i === index) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  dashBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.stepIndex, 10);
      renderStep(idx);
      resetAutoTimer();
    });
  });

  function startAutoTimer() {
    autoTimer = setInterval(() => {
      if (cards.length > 0) {
        currentStepIndex = (currentStepIndex + 1) % cards.length;
        renderStep(currentStepIndex);
      }
    }, 4500);
  }

  function resetAutoTimer() {
    if (autoTimer) clearInterval(autoTimer);
    startAutoTimer();
  }

  if (cards.length > 0) {
    startAutoTimer();
  }
});
