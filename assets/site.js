document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('header nav').forEach((nav, index) => {
    const header = nav.closest('header');
    if (!header) return;

    const isHome = window.location.pathname.endsWith('/index.html') || window.location.pathname === '/';
    nav.querySelectorAll('a[href]').forEach(link => {
      const url = new URL(link.href, window.location.href);
      if (url.pathname === window.location.pathname && (!url.hash || (isHome && url.hash === '#accueil'))) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    const button = document.createElement('button');
    const navId = nav.id || `site-navigation-${index + 1}`;
    nav.id = navId;
    button.type = 'button';
    button.className = 'nav-toggle';
    button.innerHTML = '<span class="nav-toggle-icon">☰</span> <span>Menu</span>';
    button.setAttribute('aria-label', 'Ouvrir le menu de navigation');
    button.setAttribute('aria-controls', navId);
    button.setAttribute('aria-expanded', 'false');
    nav.before(button);

    const closeMenu = () => {
      header.classList.remove('nav-open');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'Ouvrir le menu de navigation');
      button.innerHTML = '<span class="nav-toggle-icon">☰</span> <span>Menu</span>';
      button.classList.remove('is-active');
    };

    button.addEventListener('click', event => {
      event.stopPropagation();
      const isOpen = header.classList.toggle('nav-open');
      button.setAttribute('aria-expanded', String(isOpen));
      button.setAttribute('aria-label', isOpen ? 'Fermer le menu de navigation' : 'Ouvrir le menu de navigation');
      button.innerHTML = isOpen
        ? '<span class="nav-toggle-icon">✕</span> <span>Fermer</span>'
        : '<span class="nav-toggle-icon">☰</span> <span>Menu</span>';
      button.classList.toggle('is-active', isOpen);
    });

    nav.addEventListener('click', event => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('click', event => {
      if (header.classList.contains('nav-open') && !header.contains(event.target)) {
        closeMenu();
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenu();
    });
  });

  // Animation des mots défilants dans le Hero
  const rotatingEl = document.getElementById('rotating-keyword');
  if (rotatingEl) {
    const keywords = [
      'leur logement universitaire',
      'leur réussite académique',
      'leur épanouissement social',
      'un avenir universitaire prometteur',
      'la solidarité étudiante de Diass'
    ];
    let currentIndex = 0;
    setInterval(() => {
      rotatingEl.classList.add('is-changing');
      setTimeout(() => {
        currentIndex = (currentIndex + 1) % keywords.length;
        rotatingEl.textContent = keywords[currentIndex];
        rotatingEl.classList.remove('is-changing');
      }, 320);
    }, 2800);
  }
});
