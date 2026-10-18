@echo off
rem ============================================================================
rem  run-local.bat - open the backend for LOCAL development.
rem
rem  Why this exists: without these settings the backend reads backend\.env,
rem  which can point at the LIVE database. This script forces a local SQLite
rem  file instead, so nothing you do here can touch live data.
rem
rem  Usage:   run-local.bat          (serves on 127.0.0.1:8000)
rem           run-local.bat 8011     (another port, if 8000 is busy)
rem
rem  Paths are worked out from where THIS file is, so it works from any clone
rem  of the repo on any machine. There is no password, token or secret in this
rem  file. It never reads or changes backend\.env.
rem
rem  The frontend needs nothing: with no REACT_APP_API_BASE_URL set it talks to
rem  http://<this host>:8000/api, the local backend. Do not point that variable
rem  at the live site while developing.
rem ============================================================================
setlocal

set "ROOT=%~dp0"
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8000"

cd /d "%ROOT%backend"
if errorlevel 1 goto :no_backend

rem --- the local-only settings --------------------------------------------------
set "DB_ENGINE=sqlite"
set "SQLITE_DB_PATH=%ROOT%backend\data\local_dev.sqlite3"
set "USE_SEED_DATA=true"
rem A DATABASE_URL anywhere would win over DB_ENGINE and point at a real server.
set "DATABASE_URL="

rem --- which python: the project's own venv if there is one ----------------------
set "PY=python"
if exist "venv\Scripts\python.exe" set "PY=venv\Scripts\python.exe"

rem --- no backend\.env on this machine: stand-ins for this run only --------------
rem (nothing is stored; a new throwaway key is made each time)
if not exist ".env" set "DEBUG=true"
if not exist ".env" if not defined SECRET_KEY for /f "delims=" %%k in ('%PY% -c "import secrets;print(secrets.token_urlsafe(50))"') do set "SECRET_KEY=%%k"

if not exist "data" mkdir "data"

echo ============================================================
echo  LOCAL development server - this is NOT the live database
echo  Database : SQLite file  %SQLITE_DB_PATH%
echo  Address  : http://127.0.0.1:%PORT%
echo ============================================================

rem --- ask Django which database it REALLY resolved; refuse unless SQLite -------
%PY% -c "import os,sys;os.environ.setdefault('DJANGO_SETTINGS_MODULE','backend.settings');import django;django.setup();from django.conf import settings;d=settings.DATABASES['default'];print(' Django resolved:',d['ENGINE'],'->',d['NAME']);sys.exit(0 if d['ENGINE'].endswith('sqlite3') else 1)"
if errorlevel 1 goto :not_sqlite

rem --- first time on this machine: build the local database -----------------------
if not exist "%SQLITE_DB_PATH%" goto :first_time
goto :serve

:first_time
echo.
echo  The local database file does not exist yet. Creating it now (migrate).
echo.
%PY% manage.py migrate
if errorlevel 1 goto :migrate_failed
echo.

:serve
%PY% manage.py runserver 127.0.0.1:%PORT%
goto :end

:no_backend
echo Could not find the backend folder next to this file: %ROOT%backend
exit /b 1

:not_sqlite
echo.
echo  STOPPED: Django did not resolve a local SQLite database, so nothing was started.
echo  Check that no DATABASE_URL or DB_ENGINE is forced somewhere else on this machine.
exit /b 1

:migrate_failed
echo.
echo  STOPPED: migrate failed, the server was not started.
exit /b 1

:end
endlocal
