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

  // --- Animation fluide des compteurs statistiques ---
  const statNumbers = document.querySelectorAll('.stat b[data-target]');
  if (statNumbers.length && 'IntersectionObserver' in window) {
    const statObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseInt(el.getAttribute('data-target'), 10);
          if (!isNaN(target)) {
            const duration = 1800;
            const startTime = performance.now();
            function updateCounter(currentTime) {
              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);
              // Ease-out expo
              const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
              const current = Math.floor(ease * target);
              el.textContent = current + '+';
              if (progress < 1) {
                requestAnimationFrame(updateCounter);
              } else {
                el.textContent = target + '+';
              }
            }
            requestAnimationFrame(updateCounter);
          }
          obs.unobserve(el);
        }
      });
    }, { threshold: 0.25 });

    statNumbers.forEach(num => statObserver.observe(num));
  }

  // --- Animation d'apparition au défilement (Scroll Reveal) ---
  const reveals = document.querySelectorAll('.scroll-reveal');
  if (reveals.length) {
    if ('IntersectionObserver' in window) {
      const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

      reveals.forEach(el => revealObserver.observe(el));
    } else {
      reveals.forEach(el => el.classList.add('revealed'));
    }
  }

  // --- Effet Specular Flashlight Glass au survol ---
  document.querySelectorAll('.quick-card, .president, .stat, .step, .news-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  });
});
