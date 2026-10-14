# 🎬 Vidéo de fond de la page d'accueil

La bannière (hero) de `index.html` est configurée pour afficher une vidéo de fond.

## Où placer votre vidéo

Déposez votre fichier vidéo **ici** :

```
c:\Users\User\Downloads\AEDT-Portail-Logement-V9\assets\hero-video.mp4
```

Le nom doit être exactement **`hero-video.mp4`** (c'est le chemin référencé dans `index.html`).

## Caractéristiques recommandées

- **Format** : MP4 (codec H.264) — le plus compatible tous navigateurs.
- **Durée** : 8 à 20 secondes (elle tourne en boucle).
- **Résolution** : 1920×1080 (Full HD) suffit largement.
- **Poids** : visez moins de **8 Mo** pour un chargement rapide (compressez si besoin).
- **Orientation** : paysage (16:9).
- **Son** : inutile, la vidéo est automatiquement en **muet** (`muted`) — c'est obligatoire pour l'autoplay.

## Ce qui se passe tant que le fichier est absent

Rien n'est cassé : la bannière affiche son **dégradé bleu/or avec halos animés** (le fond de secours). Dès que vous ajoutez `hero-video.mp4`, la vidéo apparaît automatiquement, recouverte d'un voile sombre pour garder le texte parfaitement lisible.

## Changer le nom ou ajouter plusieurs sources

Dans `index.html`, ligne ~22 :

```html
<video class="hero-video" autoplay muted loop playsinline preload="metadata" aria-hidden="true">
  <source src="assets/hero-video.mp4" type="video/mp4">
</video>
```

Vous pouvez ajouter une 2ᵉ source (WebM) pour optimiser davantage :

```html
<video class="hero-video" autoplay muted loop playsinline preload="metadata" aria-hidden="true">
  <source src="assets/hero-video.webm" type="video/webm">
  <source src="assets/hero-video.mp4" type="video/mp4">
</video>
```

## Astuce : ajuster l'assombrissement

Le voile sombre par-dessus la vidéo se règle dans `assets/home.css` (règle `.hero-overlay`).
- Vidéo trop sombre ? Diminuez les valeurs `.88` / `.66` / `.58`.
- Texpe illisible ? Augmentez-les.
