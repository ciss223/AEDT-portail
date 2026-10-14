# Script de mise en ligne du portail AEDT sur GitHub Pages.
# Usage : .\deploy.ps1 -RepoUrl "https://github.com/VOTRE-COMPTE/VOTRE-DEPOT.git"
# Prérequis : Git installé (https://git-scm.com/download/win)

param(
    [Parameter(Mandatory = $true)]
    [string]$RepoUrl
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "ERREUR : Git n'est pas installé ou n'est pas dans le PATH." -ForegroundColor Red
    Write-Host "Installez-le depuis https://git-scm.com/download/win puis relancez ce script." -ForegroundColor Yellow
    exit 1
}

Write-Host "`n=== Déploiement du portail AEDT ===" -ForegroundColor Cyan

# Initialise le dépôt s'il n'existe pas encore.
if (-not (Test-Path ".git")) {
    Write-Host "`n[1/5] Initialisation du dépôt Git..." -ForegroundColor Cyan
    git init
    git branch -M main
} else {
    Write-Host "`n[1/5] Dépôt Git déjà initialisé." -ForegroundColor Green
}

# Vérifie que config.js est bien présent (indispensable en production).
if (-not (Test-Path "config.js")) {
    Write-Host "  ATTENTION : config.js est absent ! Le site ne pourra pas joindre Supabase." -ForegroundColor Yellow
    Write-Host "  Copiez config.example.js vers config.js et renseignez vos identifiants." -ForegroundColor Yellow
}

Write-Host "`n[2/5] Ajout des fichiers..." -ForegroundColor Cyan
git add .

Write-Host "`n[3/5] Création du commit..." -ForegroundColor Cyan
$message = if ($args.Count -gt 0) { $args[0] } else { "Mise à jour du portail AEDT" }
git commit -m $message

Write-Host "`n[4/5] Liaison au dépôt distant..." -ForegroundColor Cyan
$existing = git remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0) {
    git remote add origin $RepoUrl
    Write-Host "  Remote 'origin' ajouté : $RepoUrl" -ForegroundColor Green
} else {
    git remote set-url origin $RepoUrl
    Write-Host "  Remote 'origin' mis à jour : $RepoUrl" -ForegroundColor Green
}

Write-Host "`n[5/5] Envoi vers GitHub..." -ForegroundColor Cyan
git push -u origin main

Write-Host "`n=== Terminé ===" -ForegroundColor Green
Write-Host @"
Le site sera en ligne dans environ 1 minute sur GitHub Pages.

Étapes restantes (une seule fois, sur github.com) :
  1. Ouvrez votre dépôt dans le navigateur.
  2. Settings > Pages > Source : choisissez "GitHub Actions".
  3. Onglet "Actions" : vérifiez que le workflow "Déployer le portail AEDT" est vert.
  4. L'URL de votre site s'affiche en haut de la page Settings > Pages.

Rappel : exécutez supabase.sql dans le SQL Editor de Supabase avant la première
utilisation, et donnez le rôle admin à votre compte de confiance.
"@ -ForegroundColor White
