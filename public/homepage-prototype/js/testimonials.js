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
      quote: 'Monitor the places your buyers already talk and surface the conversations that show credible buying intent.',
      author: 'Discover signals',
      role: 'Find active demand without living in every feed'
    },
    'jordan': {
      quote: 'Separate high-intent conversations from ordinary mentions, with the evidence and context you need to make the call.',
      author: 'Qualify intent',
      role: 'Turn noisy mentions into clear opportunities'
    },
    'clara': {
      quote: 'Turn a relevant conversation into a useful reply—review it yourself or enable guarded auto-send when your account is eligible.',
      author: 'Respond with control',
      role: 'Keep every reply relevant, safe, and accountable'
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
