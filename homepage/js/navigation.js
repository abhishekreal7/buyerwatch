/* ==========================================================================
   NAVIGATION & MOBILE DRAWER SCRIPT
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.getElementById('navMobileToggle');
  const navDrawer = document.getElementById('mobileNavDrawer');
  const drawerClose = document.getElementById('drawerCloseBtn');
  const dropdownTrigger = document.querySelector('.nav-dropdown-trigger');
  const dropdownMenu = document.querySelector('.nav-dropdown-menu');

  // Mobile Drawer Toggle
  if (navToggle && navDrawer) {
    navToggle.addEventListener('click', () => {
      navDrawer.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    });
  }

  if (drawerClose && navDrawer) {
    drawerClose.addEventListener('click', () => {
      navDrawer.classList.remove('is-open');
      document.body.style.overflow = '';
    });
  }

  // Close drawer on link click
  document.querySelectorAll('.drawer-link-item').forEach(link => {
    link.addEventListener('click', () => {
      if (navDrawer) {
        navDrawer.classList.remove('is-open');
        document.body.style.overflow = '';
      }
    });
  });

  // Dropdown toggle on click for mobile/touch
  if (dropdownTrigger && dropdownMenu) {
    dropdownTrigger.addEventListener('click', (e) => {
      dropdownMenu.classList.toggle('is-open');
    });

    document.addEventListener('click', (e) => {
      if (!dropdownTrigger.contains(e.target)) {
        dropdownMenu.classList.remove('is-open');
      }
    });
  }

  // Navbar scroll shrink & background intensity
  const headerWrapper = document.querySelector('.header-nav-wrapper');
  const header = document.querySelector('.header-nav');
  const navLinks = document.querySelectorAll('.nav-links-center .nav-link-item');
  const sections = ['hero', 'how-it-works', 'why-buyerwatch', 'pricing', 'faq']
    .map(id => document.getElementById(id))
    .filter(Boolean);

  const onScroll = () => {
    const scrollPos = window.scrollY;

    if (scrollPos > 20) {
      headerWrapper?.classList.add('scrolled');
      header?.classList.add('scrolled');
    } else {
      headerWrapper?.classList.remove('scrolled');
      header?.classList.remove('scrolled');
    }

    // ScrollSpy active state
    let currentId = 'hero';
    sections.forEach(sec => {
      const top = sec.offsetTop - 120;
      if (scrollPos >= top) {
        currentId = sec.id;
      }
    });

    navLinks.forEach(link => {
      const href = link.getAttribute('href')?.replace('#', '');
      if (href === currentId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
});
