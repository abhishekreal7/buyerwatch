/**
 * Growth & Analytics Interactive Components
 * - Accordion for "Your partner in organic growth"
 * - Lead Discovery Area Chart tooltips & interactions
 * - Live animated simulations for "Measure what happens after the reply"
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Organic Growth Accordion
  const accordionItems = document.querySelectorAll('.organic-accordion-item');
  if (accordionItems.length > 0) {
    accordionItems.forEach(item => {
      const header = item.querySelector('.organic-accordion-header');
      if (header) {
        header.addEventListener('click', () => {
          const isActive = item.classList.contains('active');
          
          // Close all
          accordionItems.forEach(other => other.classList.remove('active'));
          
          // Toggle clicked
          if (!isActive) {
            item.classList.add('active');
          }
        });
      }
    });
  }

  // 2. Lead Discovery Chart Tooltip
  const chartPoints = document.querySelectorAll('.lead-chart-interactive-point');
  const chartTooltip = document.getElementById('leadChartTooltip');
  const tooltipLabel = document.getElementById('leadTooltipLabel');
  const tooltipDiscovered = document.getElementById('leadTooltipDiscovered');
  const tooltipQualified = document.getElementById('leadTooltipQualified');

  if (chartPoints.length > 0 && chartTooltip) {
    chartPoints.forEach(point => {
      point.addEventListener('mouseenter', (e) => {
        const week = point.getAttribute('data-week');
        const discovered = point.getAttribute('data-discovered');
        const qualified = point.getAttribute('data-qualified');

        if (tooltipLabel) tooltipLabel.textContent = week;
        if (tooltipDiscovered) tooltipDiscovered.textContent = discovered;
        if (tooltipQualified) tooltipQualified.textContent = qualified;

        const rect = point.getBoundingClientRect();
        const container = chartTooltip.parentElement;
        const parentRect = container.getBoundingClientRect();
        
        const left = Math.max(10, Math.min(parentRect.width - 160, rect.left - parentRect.left - 60));
        const top = Math.max(10, rect.top - parentRect.top - 85);

        chartTooltip.style.left = `${left}px`;
        chartTooltip.style.top = `${top}px`;
        chartTooltip.style.opacity = '1';
        chartTooltip.style.visibility = 'visible';
      });

      point.addEventListener('mouseleave', () => {
        chartTooltip.style.opacity = '0';
        chartTooltip.style.visibility = 'hidden';
      });
    });
  }

  // 3. Simulated Chat Loop in "Painpoint to Reply"
  const chatBubbleAvery2 = document.getElementById('chatBubbleAvery2');
  if (chatBubbleAvery2) {
    setInterval(() => {
      if (chatBubbleAvery2.style.display === 'none') {
        chatBubbleAvery2.style.display = 'block';
        chatBubbleAvery2.style.animation = 'fadeInBubble 0.5s ease forwards';
      } else {
        setTimeout(() => {
          chatBubbleAvery2.style.display = 'none';
        }, 1200);
      }
    }, 4500);
  }
});
