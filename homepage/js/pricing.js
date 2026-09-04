/* ==========================================================================
   PRICING BILLING TOGGLE (MONTHLY / ANNUAL)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const switchBtn = document.getElementById('pricingBillingSwitch');
  const labelMonthly = document.getElementById('labelMonthly');
  const labelAnnual = document.getElementById('labelAnnual');
  const starterStrikePrice = document.getElementById('starterStrikePrice');
  const pricingSection = document.getElementById('pricing');

  if (!switchBtn || !pricingSection) return;

  let isAnnual = false;

  function updateBilling(annual) {
    isAnnual = annual;
    switchBtn.setAttribute('aria-checked', isAnnual ? 'true' : 'false');

    const knob = switchBtn.querySelector('.pricing-switch-knob');
    if (knob) {
      knob.style.left = isAnnual ? '27px' : '3px';
    }

    if (labelMonthly && labelAnnual) {
      if (isAnnual) {
        labelMonthly.classList.remove('active');
        labelMonthly.style.color = '#999';
        labelAnnual.classList.add('active');
        labelAnnual.style.color = '#0A0A0A';
      } else {
        labelMonthly.classList.add('active');
        labelMonthly.style.color = '#0A0A0A';
        labelAnnual.classList.remove('active');
        labelAnnual.style.color = '#999';
      }
    }

    // Update Starter strike-through price visibility
    if (starterStrikePrice) {
      starterStrikePrice.style.display = isAnnual ? 'none' : 'inline-block';
    }

    // Update all price numbers
    const priceElements = pricingSection.querySelectorAll('.pricing-num');
    priceElements.forEach(el => {
      const monthlyVal = el.getAttribute('data-monthly');
      const annualVal = el.getAttribute('data-annual');
      el.textContent = '$' + (isAnnual ? annualVal : monthlyVal);
    });

    // Update billing notes
    const noteElements = pricingSection.querySelectorAll('.pricing-billing-note');
    noteElements.forEach(el => {
      const monthlyNote = el.getAttribute('data-monthly-note');
      const annualNote = el.getAttribute('data-annual-note');
      if (isAnnual && annualNote) {
        el.textContent = annualNote;
      } else if (!isAnnual && monthlyNote) {
        el.textContent = monthlyNote;
      }
    });

    // Update CTA button labels if needed (e.g. Starter)
    const starterCta = pricingSection.querySelector('.pricing-card-starter .pricing-cta-btn span');
    if (starterCta) {
      starterCta.textContent = isAnnual ? 'Choose Starter' : 'Start for $19';
    }
  }

  switchBtn.addEventListener('click', () => {
    updateBilling(!isAnnual);
  });

  if (labelMonthly) {
    labelMonthly.addEventListener('click', () => {
      if (isAnnual) updateBilling(false);
    });
  }

  if (labelAnnual) {
    labelAnnual.addEventListener('click', () => {
      if (!isAnnual) updateBilling(true);
    });
  }
});
