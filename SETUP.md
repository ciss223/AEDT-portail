# AEDT V9 — portail complet

La V3 ajoute au portail logement :
- Accueil AEDT
- Actualités étudiantes
- Mot du Président
- Profil et parcours du Président
- Présentation de l'Amicale
- Galerie
- Portail logement (demande + suivi + justificatifs)
- Administration sécurisée

## Installation
1. Exécuter le fichier `supabase.sql` complet de ce dépôt dans le SQL Editor Supabase. Il comprend les tables logement, les justificatifs, le profil étudiant, les actualités, les notifications et la messagerie. Réexécutez-le lors des mises à jour du schéma et des règles de sécurité.
2. Créer un utilisateur administrateur dans Supabase Authentication, puis lui attribuer le rôle `admin` dans `public.profiles`.
3. Copier `config.example.js` vers `config.js` si nécessaire et vérifier l'URL du projet ainsi que la clé publique (publishable/anon).
4. Publier les fichiers sur GitHub Pages.

## Contenu du Président
Les informations du Président sont volontairement des champs administrables : nom, fonction, mot, parcours universitaire, parcours professionnel et engagement associatif. Rien n'est inventé.

## Galerie
La V3 prévoit l'affichage des images via URL. Pour une V3.1, on peut ajouter un vrai gestionnaire d'upload d'images depuis l'administration vers un bucket Storage.

## V4 — Espace étudiant

### 1. Base Supabase
Exécutez le `supabase.sql` complet dans SQL Editor. Il ajoute `profiles`, `notifications`, le rattachement des demandes à `auth.users` et le rôle administrateur.

### 2. Premier administrateur
Après avoir créé un compte étudiant, exécutez dans Supabase :
```sql
update public.profiles set role='admin' where id='UUID_DU_COMPTE_ADMIN';
```
Ne donnez le rôle `admin` qu'aux comptes de confiance.

### 3. Authentification
Dans Supabase > Authentication > Providers, activez Email. Selon votre configuration, la confirmation email peut être demandée avant la première connexion.

### 4. Espace étudiant
`etudiant.html` permet de créer un compte, se connecter, modifier son profil, consulter ses demandes liées au compte et recevoir des notifications.

### 5. Demandes logement
Une demande déposée alors que l'étudiant est connecté est automatiquement rattachée à son compte grâce à `user_id`. Le formulaire public reste utilisable sans compte.

### 6. Sécurité
La V4 remplace les politiques d'administration trop larges de la V3 pour `news`, `president_profile` et `gallery` par un contrôle du rôle `admin`. Ne mettez jamais la clé `service_role` dans le site.

## V5 — Espace étudiant avancé
- Tableau de bord étudiant
- Notifications
- Notification automatique lors du changement de statut
- Messagerie étudiant → AEDT

Exécuter le `supabase.sql` complet dans Supabase après remplacement des fichiers.


## V6 — Gestion des étudiants et messages
- Le tableau admin affiche le nombre d’étudiants et de messages.
- L’administration peut répondre aux messages envoyés depuis l’espace étudiant.
- Une notification est créée automatiquement après l’enregistrement d’une réponse.
- Exécutez le fichier `supabase.sql` complet dans Supabase après sauvegarde de la configuration.
- Vérifiez que les administrateurs ont bien `profiles.role = 'admin'`.
- Testez avec un compte étudiant et un compte administrateur avant la mise en production.


## V7 — Accueil modernisé
- Page d'accueil responsive pour ordinateur et mobile.
- Sections dédiées au logement, aux actualités, à la présidence et à la galerie.
- Chargement des actualités, du mot du président et des photos depuis Supabase si `config.js` est configuré.
- La page utilise le logo `assets/logo-aedt.jpeg` lorsqu'il est présent.
- Les textes institutionnels et coordonnées doivent être vérifiés et complétés par l'AEDT avant publication.

## V8 — Portail des services étudiants
- Nouvelle page `services.html` regroupant les services essentiels.
- Accès rapide au logement, au suivi étudiant, aux actualités, à la galerie et au contact.
- Lien « Services » ajouté à la navigation de l’accueil.
- Cette version réutilise la configuration Supabase existante et ne nécessite pas de nouvelle table SQL.
- Avant publication, tester les liens sur mobile et vérifier la configuration `config.js`.

## V9 — Comptes étudiants
- Ajout de `inscription.html` et `connexion.html` avec Supabase Auth.
- L'inscription utilise l'e-mail, le nom complet et un mot de passe de 8 caractères minimum.
- Selon les réglages Supabase, l'étudiant peut devoir confirmer son adresse e-mail avant de se connecter.
- Vérifier que `config.js` expose les paramètres Supabase attendus par les pages. Ne jamais mettre une clé `service_role` dans le site public : utiliser uniquement la clé publique anon/publishable.
- Vérifier les politiques RLS et le mécanisme de création de profil avant la mise en production. Les pages d'authentification ne remplacent pas les contrôles d'accès côté base de données.

## V10 — Corrections de sécurité
- Les politiques RLS empêchent désormais un étudiant de définir ou modifier son rôle en `admin`. L'attribution du rôle administrateur reste une opération réservée à un administrateur de confiance via Supabase.
- Le suivi public ne renvoie plus que le numéro et le statut du dossier, sans nom, établissement ni note administrative.
- Les nouveaux numéros de dossier utilisent un identifiant aléatoire complet plutôt qu'un fragment de six caractères.
- Après mise à jour du site, exécutez le fichier `supabase.sql` actualisé dans SQL Editor pour appliquer les politiques et la fonction de suivi. Cette mise à jour ne supprime pas les dossiers existants.

## V11 — Administration AEDT
- L’administration propose un tableau de bord avec des décomptes et graphiques calculés côté base, une liste paginée des demandes, une vue des profils étudiants, un registre des justificatifs privés, une messagerie, la publication d’actualités, la galerie, le profil du Président et le journal des activités.
- Pour installer la nouvelle fonction de synthèse sécurisée, le journal en lecture seule et ses déclencheurs, exécutez à nouveau le fichier `supabase.sql` complet dans Supabase SQL Editor avec un compte propriétaire du projet. Cette migration ajoute `activity_log` et `admin_dashboard_summary()` sans supprimer les données existantes.
- Les rôles actuellement pris en charge restent `admin` et `student`. Les rôles d’agent, de responsable communication et de superadministrateur ainsi que la gestion des autorisations depuis l’interface sont **à réaliser**; ils ne sont pas simulés dans l’administration.
- Les documents de logement restent dans le bucket privé `dossiers`. L’administration ouvre chaque document au moyen d’un lien signé valable cinq minutes. Les images de galerie utilisent un bucket public destiné uniquement aux contenus publiés.
- Les informations d’authentification (e-mails de compte et état de confirmation) ne sont pas exposées par les politiques et tables accessibles à cette interface; la liste étudiants affiche donc les champs de profil réellement disponibles sans inventer ces valeurs.
- Les actions journalisées ne contiennent pas les messages privés ni les données sensibles des dossiers. Le rôle `admin` est requis pour consulter le journal et les indicateurs administratifs.

## V12 — Vérification documentaire
- La page d’administration permet de marquer une pièce comme « À vérifier », « Vérifié » ou « À revoir ». Le statut, l’heure de vérification et le compte administrateur sont définis côté base de données.
- Les mises à jour de statut des documents sont protégées par RLS et ajoutées au journal administratif. Les opérations sur la galerie sont également enregistrées par le journal V11.
- Les profils étudiants peuvent être modifiés depuis la liste pour les champs déjà présents (nom, téléphone, matricule, établissement, filière et niveau). L’e-mail d’authentification et le rôle ne sont ni exposés ni modifiables par cette interface; les changements de profil sont journalisés.
- Le tableau de bord affiche le nombre réel de pièces restant à vérifier. Le graphique mensuel distingue les dossiers reçus des changements de statut journalisés; les changements antérieurs à l’installation du journal ne sont pas reconstitués.
- Après déploiement du site, réexécutez le fichier `supabase.sql` complet dans SQL Editor. Les nouvelles colonnes et règles sont ajoutées sans supprimer les documents existants.
- La vérification reste une information interne : l’envoi d’une demande de complément dédiée et les rôles différenciés ne sont pas encore implémentés.
