/* ==========================================================================
   DYNAMIC INTENT SCORE MATRIX & QUALIFICATION ENGINE
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const card = document.querySelector('.stats-card-dark');
  const dotMatrix = document.getElementById('intentDotMatrix');
  const scoreNumEl = document.getElementById('intentScoreNum');
  const qualificationEl = document.getElementById('intentQualificationBadge');
  const equalizer = document.getElementById('intentEqualizer');
  const intentPills = document.querySelectorAll('.intent-stage-pill');

  if (!card || !dotMatrix || !scoreNumEl || !qualificationEl) return;

  // Curated Intent Stages
  const INTENT_STAGES = [
    {
      id: 'high-intent',
      label: 'High intent',
      score: 94,
      themeClass: 'theme-pink',
      description: 'Context attached, intent explained,<br>and every reply reviewable',
      // 7 columns x 3 rows = 21 dots (1 = active, 0 = inactive)
      // Matching screenshot: row1: [1,1,0,1,1,0,0], row2: [1,1,0,1,1,0,0], row3: [0,0,0,0,0,0,1]
      dotPattern: [
        1, 1, 0, 1, 1, 0, 0,
        1, 1, 0, 1, 1, 0, 0,
        0, 0, 0, 0, 0, 0, 1
      ],
      eqActiveIndices: [4, 5, 6],
      eqHeights: [14, 18, 24, 28, 42, 48, 44, 28, 20, 16]
    },
    {
      id: 'buying',
      label: 'Buying',
      score: 98,
      themeClass: 'theme-lime',
      description: 'Direct purchase request detected,<br>tailored draft ready for immediate review',
      dotPattern: [
        1, 1, 1, 1, 1, 1, 0,
        1, 1, 1, 1, 1, 0, 1,
        1, 0, 1, 1, 1, 1, 1
      ],
      eqActiveIndices: [2, 3, 4, 5, 6, 7],
      eqHeights: [18, 26, 36, 44, 50, 46, 38, 28, 20, 14]
    },
    {
      id: 'researching',
      label: 'Researching',
      score: 68,
      themeClass: 'theme-cyan',
      description: 'Active problem evaluation and comparison,<br>helpful context prepared',
      dotPattern: [
        1, 1, 1, 0, 0, 1, 0,
        0, 1, 1, 1, 0, 0, 1,
        0, 0, 1, 1, 0, 0, 0
      ],
      eqActiveIndices: [3, 4, 5],
      eqHeights: [12, 16, 22, 30, 36, 32, 24, 18, 14, 10]
    },
    {
      id: 'low-intent',
      label: 'Low intent',
      score: 28,
      themeClass: 'theme-amber',
      description: 'Casual mention or broad topic discussion,<br>monitored without drafting',
      dotPattern: [
        0, 0, 1, 0, 0, 0, 0,
        1, 0, 0, 1, 0, 0, 0,
        0, 0, 0, 0, 1, 0, 0
      ],
      eqActiveIndices: [4, 5],
      eqHeights: [10, 12, 14, 18, 22, 20, 16, 14, 12, 10]
    }
  ];

  let currentIndex = 0;
  let currentScore = 94;
  let scoreAnimFrame = null;
  let cycleInterval = null;
  let isHovered = false;

  // Initialize dots if needed
  let dots = Array.from(dotMatrix.querySelectorAll('.matrix-dot'));
  if (dots.length === 0) {
    dotMatrix.innerHTML = '';
    for (let i = 0; i < 21; i++) {
      const dot = document.createElement('div');
      dot.className = 'matrix-dot';
      dotMatrix.appendChild(dot);
    }
    dots = Array.from(dotMatrix.querySelectorAll('.matrix-dot'));
  }

  // Initialize equalizer bars if needed
  let eqBars = equalizer ? Array.from(equalizer.querySelectorAll('.eq-bar')) : [];
  if (equalizer && eqBars.length === 0) {
    equalizer.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const bar = document.createElement('div');
      bar.className = 'eq-bar';
      equalizer.appendChild(bar);
    }
    eqBars = Array.from(equalizer.querySelectorAll('.eq-bar'));
  }

  // Smooth number ticker
  function animateScore(targetScore, duration = 800) {
    if (scoreAnimFrame) cancelAnimationFrame(scoreAnimFrame);
    const startScore = currentScore;
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic curve
      const ease = 1 - Math.pow(1 - progress, 3);
      const val = Math.round(startScore + (targetScore - startScore) * ease);
      currentScore = val;
      scoreNumEl.textContent = val;

      if (progress < 1) {
        scoreAnimFrame = requestAnimationFrame(step);
      } else {
        currentScore = targetScore;
        scoreNumEl.textContent = targetScore;
      }
    }

    scoreAnimFrame = requestAnimationFrame(step);
  }

  // Apply state to UI
  function setIntentStage(index, userInitiated = false) {
    currentIndex = index;
    const stage = INTENT_STAGES[currentIndex];
    if (!stage) return;

    // 1. Remove previous theme classes and apply new theme
    card.classList.remove('theme-pink', 'theme-lime', 'theme-cyan', 'theme-amber');
    card.classList.add(stage.themeClass);

    // 2. Animate Score Number
    animateScore(stage.score, 650);

    // 3. Staggered matrix dot illumination
    dots.forEach((dot, idx) => {
      const shouldBeActive = stage.dotPattern[idx] === 1;
      const delay = (idx % 7) * 35 + Math.floor(idx / 7) * 45;
      
      setTimeout(() => {
        if (shouldBeActive) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      }, delay);
    });

    // 4. Smooth Qualification text transition
    qualificationEl.style.opacity = '0';
    qualificationEl.style.transform = 'translateY(4px)';
    
    setTimeout(() => {
      qualificationEl.textContent = stage.label;
      qualificationEl.className = 'intent-qualification-badge ' + stage.themeClass;
      qualificationEl.style.opacity = '1';
      qualificationEl.style.transform = 'translateY(0)';
    }, 180);

    // 5. Update Equalizer Bars
    if (equalizer && eqBars.length > 0) {
      equalizer.className = 'mini-equalizer ' + stage.themeClass;
      eqBars.forEach((bar, bIdx) => {
        const isActive = stage.eqActiveIndices.includes(bIdx);
        const targetHeight = stage.eqHeights[bIdx] || 16;
        bar.style.height = targetHeight + 'px';
        if (isActive) {
          bar.classList.add('active');
        } else {
          bar.classList.remove('active');
        }
      });
    }

    // 6. Update interactive pills if present
    intentPills.forEach((pill, pIdx) => {
      if (pIdx === currentIndex) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    // If user clicked, restart auto-cycle timer
    if (userInitiated) {
      resetCycleTimer();
    }
  }

  function nextStage() {
    const nextIdx = (currentIndex + 1) % INTENT_STAGES.length;
    setIntentStage(nextIdx);
  }

  function startCycleTimer() {
    if (cycleInterval) clearInterval(cycleInterval);
    cycleInterval = setInterval(() => {
      if (!isHovered) {
        nextStage();
      }
    }, 4200);
  }

  function resetCycleTimer() {
    if (cycleInterval) clearInterval(cycleInterval);
    startCycleTimer();
  }

  // Setup click listeners on stage selector pills (if present)
  intentPills.forEach((pill, idx) => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      setIntentStage(idx, true);
    });
  });

  // Clicking anywhere on card advances to next stage
  card.addEventListener('click', () => {
    nextStage();
    resetCycleTimer();
  });

  // Pause on hover
  card.addEventListener('mouseenter', () => {
    isHovered = true;
  });

  card.addEventListener('mouseleave', () => {
    isHovered = false;
  });

  // Initial stage
  setIntentStage(0);
  startCycleTimer();
});
