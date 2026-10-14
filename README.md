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

Le site est publié sur **https://ciss223.github.io/AEDT-portail/**

Le dépôt est **https://github.com/ciss223/AEDT-portail** et le déploiement est
automatisé par le workflow `.github/workflows/deploy.yml` : chaque `git push` sur la
branche `main` met le site en ligne (environ 1 minute).

### Publier une modification

```powershell
git add .
git commit -m "Description de la modification"
git push
```

> ℹ️ Le déploiement se déclenche tout seul. Son avancement est visible dans l'onglet
> **Actions** du dépôt : pastille orange = en cours, verte = en ligne.

### Recréer le projet depuis zéro (référence)

```bash
git init -b main
git add .
git commit -m "Portail AEDT"
git remote add origin https://github.com/ciss223/AEDT-portail.git
git push -u origin main
```

> **Configuration initiale obligatoire (une seule fois)** : dans le dépôt,
> **Settings > Pages > Build and deployment > Source** doit être réglé sur
> **« GitHub Actions »**. Sans ce réglage, le site ne se déploie pas.


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
