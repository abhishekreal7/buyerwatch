/* ==========================================================================
   TESTIMONIALS AVATAR SELECTOR SCRIPT
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const avatarButtons = document.querySelectorAll('.avatar-select-btn');
  const quoteEl = document.getElementById('testimonialQuote');
  const authorEl = document.getElementById('testimonialAuthor');
  const roleEl = document.getElementById('testimonialRole');

  const testimonialData = {
    'emily': {
      quote: 'Monitor the places your buyers already talk, then bring only the conversations with credible buying intent into one reviewable feed.',
      author: 'Founder workflow',
      role: 'From discovery to a helpful first response'
    },
    'jordan': {
      quote: 'Separate relevant buying conversations from ordinary mentions, then review the evidence behind every intent score before acting.',
      author: 'Growth workflow',
      role: 'From noisy mentions to qualified opportunities'
    },
    'clara': {
      quote: 'Keep monitoring rules, source conversations, draft replies, delivery attempts, and outcomes organized in one controlled workspace.',
      author: 'Agency workflow',
      role: 'From multiple accounts to one reliable process'
    }
  };

  avatarButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.testimonialId;
      if (!id || !testimonialData[id]) return;

      avatarButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (quoteEl && authorEl && roleEl) {
        quoteEl.style.opacity = '0';
        authorEl.style.opacity = '0';
        roleEl.style.opacity = '0';

        setTimeout(() => {
          quoteEl.textContent = testimonialData[id].quote;
          authorEl.textContent = testimonialData[id].author;
          roleEl.textContent = testimonialData[id].role;

          quoteEl.style.opacity = '1';
          authorEl.style.opacity = '1';
          roleEl.style.opacity = '1';
        }, 200);
      }
    });
  });
});
