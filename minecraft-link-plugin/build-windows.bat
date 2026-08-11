@echo off
setlocal
where mvn >nul 2>nul
if errorlevel 1 (
  echo Maven n'est pas installe ou n'est pas dans le PATH.
  echo Installe Maven puis relance ce fichier.
  pause
  exit /b 1
)
call mvn -U clean package
if errorlevel 1 (
  echo.
  echo ECHEC DE LA COMPILATION
  pause
  exit /b 1
)
echo.
echo JAR cree dans target\TrizoneWebLink-1.0.0.jar
pause
