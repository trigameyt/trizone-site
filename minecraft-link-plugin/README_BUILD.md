# Compiler TrizoneWebLink 1.3.2

Pré-requis : Java 21 + Maven 3.9+.

PowerShell :

```powershell
cd "CHEMIN\VERS\minecraft-link-plugin"
Unblock-File .\build-windows.bat
.\build-windows.bat
```

JAR attendu :

```text
target\TrizoneWebLink-1.3.2.jar
```

Le plugin est prévu pour Paper 1.21.11. Depuis la 1.3.2, seule la sauvegarde du monde configuré dans `survival-world` (par défaut `world`) est envoyée au site.
