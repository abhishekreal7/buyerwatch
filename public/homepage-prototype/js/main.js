/* ==========================================================================
   MAIN APPLICATION & SCROLL ANIMATIONS
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const newsletterForm = document.getElementById('buyerwatchNewsletterForm');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', (event) => {
      event.preventDefault();
      alert('Thank you for subscribing to BuyerWatch!');
    });
  }

  // 1. Scroll Reveal Observer
  const revealElements = document.querySelectorAll('.reveal-on-scroll');
  
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          obs.unobserve(entry.target);
        }
      });
    }, {
      root: null,
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(el => observer.observe(el));
  } else {
    revealElements.forEach(el => el.classList.add('is-revealed'));
  }

  // 2. Interactive Intent Card is managed by js/intent-card.js

  // 3. Magnetic Hover effect on buttons
  const magneticButtons = document.querySelectorAll('.btn-lime, .btn-primary');
  magneticButtons.forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
    });
  });

  // 4. Original BuyerWatch AI Feature Showcase Interactive Switcher (1:1 from StickyFeatureScroll)
  const aiFeatureItems = document.querySelectorAll('.ai-feature-item');
  const aiScoreCard = document.getElementById('aiScoreCard');
  const aiVectorContainer = document.getElementById('aiVectorContainer');
  const aiCardLabel = document.getElementById('aiCardLabel');
  const aiCardValue = document.getElementById('aiCardValue');
  const aiBadgeTitle = document.getElementById('aiBadgeTitle');
  const aiBadgeDesc = document.getElementById('aiBadgeDesc');

  const aiData = [
    {
      label: 'Automated Tracking',
      value: '24/7',
      badgeTitle: 'Automated Intent Tracking',
      badgeDesc: 'BuyerWatch scans 24/7 in the background across Reddit and Bluesky.',
      svg: `<svg width="56" height="56" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="26" fill="white" stroke="#1C1816" stroke-width="2.5" />
        <circle cx="32" cy="32" r="18" fill="none" stroke="#FF8C5A" stroke-width="2" stroke-dasharray="3 3" />
        <circle cx="32" cy="32" r="10" fill="none" stroke="#1C1816" stroke-width="1.5" />
        <circle cx="32" cy="32" r="3" fill="#1C1816" />
        <line x1="32" y1="4" x2="32" y2="60" stroke="#1C1816" stroke-width="2" stroke-linecap="round" />
        <line x1="4" y1="32" x2="60" y2="32" stroke="#1C1816" stroke-width="2" stroke-linecap="round" />
        <path d="M32 32 L48 16 A22 22 0 0 1 54 32 Z" fill="#FFA575" opacity="0.6" />
        <g transform="translate(42, 14)">
          <circle cx="6" cy="6" r="6" fill="#FF5101" stroke="#1C1816" stroke-width="1.8" />
          <circle cx="6" cy="6" r="2" fill="white" />
        </g>
      </svg>`
    },
    {
      label: 'AI Intent Score',
      value: '94%',
      badgeTitle: 'AI Lead Qualification',
      badgeDesc: 'AI scoring engine filters noise and flags high-intent buyers instantly.',
      svg: `<svg width="56" height="56" viewBox="0 0 64 64" fill="none">
        <path d="M32 6 L52 14 V30 C52 44 32 58 32 58 C32 58 12 44 12 30 V14 Z" fill="white" stroke="#1C1816" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M32 12 L46 18 V30 C46 40 32 51 32 51 C32 51 18 40 18 30 V18 Z" fill="#FFA575" opacity="0.85" stroke="#1C1816" stroke-width="1.8"/>
        <path d="M32 20 C32 25 36 29 41 29 C36 29 32 33 32 38 C32 33 28 29 23 29 C28 29 32 25 32 20 Z" fill="white" stroke="#1C1816" stroke-width="2" stroke-linejoin="round"/>
      </svg>`
    },
    {
      label: 'Response Velocity',
      value: '< 90s',
      badgeTitle: 'Task Automation',
      badgeDesc: 'Autonomous workers handle multi-platform scraping and reply drafting.',
      svg: `<svg width="56" height="56" viewBox="0 0 60 60" fill="none">
        <g transform="translate(4, 4)">
          <circle cx="20" cy="20" r="13" fill="#FFA575" stroke="#1C1816" stroke-width="2.5" />
          <circle cx="20" cy="20" r="5" fill="white" stroke="#1C1816" stroke-width="2" />
          <path d="M20 4v5M20 31v5M4 20h5M31 20h5M8.7 8.7l3.5 3.5M27.8 27.8l3.5 3.5M8.7 31.3l3.5-3.5M27.8 12.2l3.5-3.5" stroke="#1C1816" stroke-width="2.5" stroke-linecap="round" />
        </g>
        <g transform="translate(26, 26)">
          <circle cx="14" cy="14" r="9" fill="white" stroke="#1C1816" stroke-width="2.5" />
          <circle cx="14" cy="14" r="3.5" fill="#FFA575" stroke="#1C1816" stroke-width="1.8" />
          <path d="M14 3v3M14 22v3M3 14h3M22 14h3" stroke="#1C1816" stroke-width="2" stroke-linecap="round" />
        </g>
      </svg>`
    }
  ];

  if (aiFeatureItems.length > 0) {
    aiFeatureItems.forEach((item, index) => {
      item.addEventListener('click', () => {
        aiFeatureItems.forEach(el => el.classList.remove('active'));
        item.classList.add('active');

        const data = aiData[index];
        if (data && aiCardLabel && aiCardValue && aiBadgeTitle && aiBadgeDesc) {
          if (aiScoreCard) {
            aiScoreCard.style.transform = 'scale(0.95)';
            setTimeout(() => {
              if (aiVectorContainer) aiVectorContainer.innerHTML = data.svg;
              aiCardLabel.textContent = data.label;
              aiCardValue.textContent = data.value;
              aiBadgeTitle.textContent = data.badgeTitle;
              aiBadgeDesc.textContent = data.badgeDesc;
              aiScoreCard.style.transform = '';
            }, 150);
          }
        }
      });
    });
  }

  console.log('⚡ BuyerWatch homepage concept initialized successfully.');
});
