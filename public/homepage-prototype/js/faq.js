/* ==========================================================================
   FAQ ACCORDION SCRIPT
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const trigger = item.querySelector('.faq-trigger');
    const drawer = item.querySelector('.faq-answer-drawer');

    if (trigger && drawer) {
      trigger.addEventListener('click', () => {
        const isActive = item.classList.contains('is-active');

        // Close all other FAQ items
        faqItems.forEach(otherItem => {
          if (otherItem !== item) {
            otherItem.classList.remove('is-active');
            const otherDrawer = otherItem.querySelector('.faq-answer-drawer');
            if (otherDrawer) otherDrawer.style.maxHeight = '0px';
          }
        });

        // Toggle current item
        if (isActive) {
          item.classList.remove('is-active');
          drawer.style.maxHeight = '0px';
        } else {
          item.classList.add('is-active');
          drawer.style.maxHeight = drawer.scrollHeight + 'px';
        }
      });
    }
  });
});
