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
    button.textContent = 'Menu';
    button.setAttribute('aria-label', 'Ouvrir le menu de navigation');
    button.setAttribute('aria-controls', navId);
    button.setAttribute('aria-expanded', 'false');
    nav.before(button);

    const closeMenu = () => {
      header.classList.remove('nav-open');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'Ouvrir le menu de navigation');
    };

    button.addEventListener('click', () => {
      const isOpen = header.classList.toggle('nav-open');
      button.setAttribute('aria-expanded', String(isOpen));
      button.setAttribute('aria-label', isOpen ? 'Fermer le menu de navigation' : 'Ouvrir le menu de navigation');
    });

    nav.addEventListener('click', event => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenu();
    });
  });
});
