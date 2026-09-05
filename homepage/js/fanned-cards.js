/* ==========================================================================
   3D FANNED PLATFORM CARDS INTERACTION (REDDIT, X, BLUESKY)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const fannedContainer = document.querySelector('.fanned-cards-wrapper');
  if (!fannedContainer) return;

  const cards = Array.from(fannedContainer.querySelectorAll('.fanned-card'));
  if (cards.length === 0) return;

  let activeIndex = 1; // Center card (X / Video Editing / Primary) by default

  const cardPositions = [
    { transform: 'translateX(-160px) translateY(24px) rotate(-8.5deg) scale(0.92)', zIndex: 2, opacity: 0.75 },
    { transform: 'translateX(0px) translateY(0px) rotate(0deg) scale(1.05)', zIndex: 10, opacity: 1 },
    { transform: 'translateX(160px) translateY(24px) rotate(8.5deg) scale(0.92)', zIndex: 2, opacity: 0.75 }
  ];

  function updateCards(activeIdx) {
    activeIndex = activeIdx;
    
    cards.forEach((card, i) => {
      // Calculate relative position (-1: left, 0: center, 1: right)
      let relativePos = (i - activeIndex + cards.length) % cards.length;
      if (relativePos === 2) relativePos = -1; // wrap around for 3 cards
      
      let posConfig;
      if (relativePos === 0) {
        posConfig = cardPositions[1]; // center
        card.classList.add('is-active');
        card.classList.remove('is-side');
      } else if (relativePos === -1) {
        posConfig = cardPositions[0]; // left
        card.classList.remove('is-active');
        card.classList.add('is-side');
      } else {
        posConfig = cardPositions[2]; // right
        card.classList.remove('is-active');
        card.classList.add('is-side');
      }

      card.style.transform = posConfig.transform;
      card.style.zIndex = posConfig.zIndex;
      card.style.opacity = posConfig.opacity;
    });

    // Update indicator dots if present
    const indicators = document.querySelectorAll('.fanned-indicator-dot');
    indicators.forEach((dot, idx) => {
      if (idx === activeIndex) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }

  // Card click handlers to bring clicked card to center
  cards.forEach((card, index) => {
    card.addEventListener('click', () => {
      if (index !== activeIndex) {
        updateCards(index);
      }
    });
  });

  // Optional indicator dots handler
  const indicators = document.querySelectorAll('.fanned-indicator-dot');
  indicators.forEach((dot, idx) => {
    dot.addEventListener('click', () => {
      updateCards(idx);
    });
  });

  // 3D Parallax tilt on mouse move over container
  fannedContainer.addEventListener('mousemove', (e) => {
    const rect = fannedContainer.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 to 0.5
    const yRatio = (e.clientY - rect.top) / rect.height - 0.5;

    const activeCard = fannedContainer.querySelector('.fanned-card.is-active');
    if (activeCard) {
      activeCard.style.transform = `translateX(${xRatio * 15}px) translateY(${yRatio * 10}px) rotateY(${xRatio * 8}deg) rotateX(${-yRatio * 8}deg) scale(1.05)`;
    }
  });

  fannedContainer.addEventListener('mouseleave', () => {
    updateCards(activeIndex);
  });

  // Initialize
  updateCards(1);
});
