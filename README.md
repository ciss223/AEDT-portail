# AEDT — Portail de l'Amicale des Étudiants de Diass à Thiès

Portail web statique (HTML/CSS/JS) adossé à un backend **Supabase** (base de données,
authentification et stockage). Publié gratuitement via **GitHub Pages**.

## Pages

| Page | Rôle |
|---|---|
| `index.html` | Accueil : présentation, actualités, mot du Président, galerie |
| `services.html` | Les services de l'Amicale |
| `logement.html` | Demande de logement + suivi de dossier |
| `connexion.html` | Connexion étudiante |
| `inscription.html` | Création de compte |
| `etudiant.html` | Espace étudiant (dossiers, notifications, messagerie) |
| `admin.html` | Espace d'administration (accès selon le rôle `admin`) |

## Mise en ligne (GitHub Pages)

1. Créez un dépôt sur GitHub (public ou privé — GitHub Pages fonctionne dans les deux cas).
2. Depuis ce dossier :
   ```bash
   git init
   git add .
   git commit -m "Portail AEDT"
   git branch -M main
   git remote add origin https://github.com/VOTRE-COMPTE/VOTRE-DEPOT.git
   git push -u origin main
   ```
3. Dans le dépôt : **Settings > Pages > Source** → choisissez **GitHub Actions**.
4. Le workflow `.github/workflows/deploy.yml` publie automatiquement le site à chaque
   push sur `main`. Le site sera disponible sur `https://VOTRE-COMPTE.github.io/VOTRE-DEPOT/`.

## Base de données Supabase

1. Exécutez `supabase.sql` dans le **SQL Editor** de votre projet Supabase.
2. Attribuez le rôle administrateur à un compte de confiance :
   ```sql
   update public.profiles set role='admin' where id='UUID_DU_COMPTE';
   ```
3. Renseignez `config.js` avec l'URL du projet et la **clé publique** (anon / publishable).

> ⚠️ Ne placez jamais la clé `service_role` dans ce dépôt. La sécurité repose
> entièrement sur les politiques RLS définies dans `supabase.sql`.

## Sécurité

- Toutes les lectures/écritures sont filtrées par les politiques RLS (`user_id = auth.uid()`
  pour les étudiants, rôle `admin` pour l'administration).
- Les documents de logement sont dans un bucket privé, ouverts via lien signé de 5 minutes.
- Le suivi public d'un dossier ne renvoie que le numéro et le statut.
