# Met en ligne le portail AEDT sur GitHub Pages.
# Usage : .\deploy.ps1 "Description de la modification"
# Le dépôt origin et le workflow GitHub Actions sont déjà configurés :
#   https://github.com/ciss223/AEDT-portail

$ErrorActionPreference = "Stop"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "ERREUR : Git n'est pas installé ou n'est pas dans le PATH." -ForegroundColor Red
    Write-Host "Installez-le depuis https://git-scm.com/download/win puis relancez ce script." -ForegroundColor Yellow
    exit 1
}

Write-Host "`n=== Publication du portail AEDT ===" -ForegroundColor Cyan

# config.js est indispensable en production : le site ne peut pas joindre Supabase sans lui.
if (-not (Test-Path "config.js")) {
    Write-Host "  ATTENTION : config.js est absent ! Le site ne pourra pas joindre Supabase." -ForegroundColor Yellow
    Write-Host "  Copiez config.example.js vers config.js et renseignez vos identifiants." -ForegroundColor Yellow
}

Write-Host "`n[1/3] Ajout des fichiers modifiés..." -ForegroundColor Cyan
git add .

Write-Host "`n[2/3] Création du commit..." -ForegroundColor Cyan
$message = if ($args.Count -gt 0 -and $args[0]) { $args[0] } else { "Mise à jour du portail AEDT" }
git commit -m $message
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Aucune modification à publier." -ForegroundColor Yellow
    exit 0
}

Write-Host "`n[3/3] Envoi vers GitHub..." -ForegroundColor Cyan
git push

Write-Host "`n=== Envoyé ===" -ForegroundColor Green
Write-Host @"
Le déploiement est en cours (environ 1 minute).

  Dépôt   : https://github.com/ciss223/AEDT-portail
  Suivi   : onglet "Actions" du dépôt (pastille verte = en ligne)
  Site    : https://ciss223.github.io/AEDT-portail/
"@ -ForegroundColor White

