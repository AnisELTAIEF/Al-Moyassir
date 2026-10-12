# Supprime les fichiers de la version 1 (Supabase) devenus inutiles.
# Exécuter une fois depuis ce dossier : clic droit > « Exécuter avec PowerShell »
#   ou : powershell -ExecutionPolicy Bypass -File .\nettoyer_v1.ps1
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$obsolete = @(
  'supabase',
  'tools\db-test',
  'admin\src\supabaseApi.ts',
  'admin\src\pages\Groups.tsx',
  'mobile\lib\core\backend.dart',
  'mobile\lib\screens\auth_screen.dart',
  'mobile\lib\screens\common.dart',
  'mobile\lib\screens\group_detail_screen.dart',
  'mobile\lib\screens\groups_screen.dart',
  'mobile\lib\screens\member_detail_screen.dart',
  'mobile\lib\screens\progress_screen.dart',
  'mobile\lib\screens\settings_screen.dart',
  'mobile\android\app\src\main\kotlin\com\fifidh',
  'mobile\assets\fonts\OFL.txt'
)
foreach ($p in $obsolete) {
  if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Recurse -Force; Write-Host "supprimé : $p" }
}
Write-Host 'Nettoyage terminé.'
