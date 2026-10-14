/* ============================================================
   Bouton flottant WhatsApp — AEDT
   Injecté sur toutes les pages publiques.
   Le markup n'existe qu'ici : une seule modification suffit
   pour changer le numéro ou le message sur tout le site.
   ============================================================ */
(function () {
  'use strict';

  var NUMERO = '221774076353';
  var MESSAGE = "Bonjour, je vous contacte depuis le site officiel de l'AEDT, l'Amicale des Étudiants de Diass à Thiès.";

  // Évite tout doublon si le script était chargé deux fois.
  if (document.getElementById('wa-fab')) return;

  // encodeURIComponent garantit un encodage correct des accents,
  // de l'apostrophe et de la ponctuation dans le lien wa.me.
  var lien = 'https://wa.me/' + NUMERO + '?text=' + encodeURIComponent(MESSAGE);

  var bouton = document.createElement('a');
  bouton.id = 'wa-fab';
  bouton.className = 'wa-fab';
  bouton.href = lien;
  bouton.target = '_blank';
  bouton.rel = 'noopener';
  bouton.setAttribute('aria-label', "Contacter l'Amicale des Étudiants de Diass à Thiès sur WhatsApp");

  bouton.innerHTML =
    '<span class="wa-fab__bubble" aria-hidden="true">Besoin d\'aide ? Contactez-nous sur WhatsApp</span>' +
    '<span class="wa-fab__btn" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">' +
        '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.347-.347.52-.52.174-.174.232-.298.347-.497.116-.198.058-.371-.031-.52-.09-.149-.669-1.612-.916-2.207-.244-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>' +
        '<path d="M12.05 21.785h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884zm8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.445h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>' +
      '</svg>' +
    '</span>';

  (document.body || document.documentElement).appendChild(bouton);
})();
