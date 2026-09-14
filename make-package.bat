@echo off
rem ============================================================================
rem  open markdown blog -- build a shippable deploy package into pkg\
rem
rem  Usage:  make-package.bat            build jar + dist into pkg\
rem          make-package.bat web        rebuild ONLY the frontend; jar left as-is
rem
rem  Produces (pkg\ is rebuilt from scratch every time):
rem     pkg\api\lastest\   backend jar + run.sh + README.txt + BUILD.txt
rem     pkg\www\lastest\   frontend static build
rem     the two folders mirror the deploy paths in env_config.md, so one rsync per
rem     folder puts it in place (and a frontend-only round needs just the www one).
rem
rem  Use the `web` form when only the frontend changed -- that is the common case
rem  (copy tweaks, styles). It skips the ~40MB jar rebuild, leaves pkg\api\lastest\
rem  exactly as the last full build left it, and you upload only pkg\www\lastest\.
rem  No backend restart needed afterwards: the web root is read straight off disk.
rem  A full run is required whenever Java/config changed, or before the very first
rem  deploy (there has to be a jar in pkg\api\lastest\ for `web` to keep).
rem
rem  Constraints this file must keep (all learned the hard way, see start-dev.bat):
rem    1) CRLF line endings (.gitattributes pins *.bat to eol=crlf). With LF-only
rem       cmd still runs most of it but `call :label` fails.
rem    2) ASCII ONLY. cmd reads .bat with the console code page (GBK/936 on a
rem       Chinese Windows); UTF-8 Chinese makes cmd swallow the following
rem       newline and merge two lines into one bogus command.
rem    3) Never call gradlew.bat unqualified when NoDefaultCurrentDirectoryInExePath
rem       may be set -- use the full path.
rem    4) Escape parentheses inside echo lines that sit in a ( ) block.
rem ============================================================================

setlocal
cd /d "%~dp0"

set "PKG=%~dp0pkg"

rem `web` = frontend-only round: the jar does not change, so neither rebuild nor
rem repack it. Everything else keeps the full behaviour.
set "WEBONLY="
if /i "%~1"=="web" set "WEBONLY=1"

echo.
echo ============================================================
echo   open markdown blog  -  build deploy package
echo ============================================================
echo.

rem -- preflight ---------------------------------------------------------------
where java >nul 2>&1
if errorlevel 1 (
  echo [x] java not found on PATH. Install JDK 17+ and open a NEW terminal.
  goto :fail
)
if not exist "api\gradlew.bat" (
  echo [x] api\gradlew.bat is missing -- run this script from the repo root.
  goto :fail
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [x] npm not found on PATH. Install Node 18+ and open a NEW terminal.
  goto :fail
)

rem -- build backend -----------------------------------------------------------
rem Skipped in `web` mode: the jar is not part of this round.
if defined WEBONLY goto :skipbackend

echo [ ] building backend jar...
pushd api
call "%~dp0api\gradlew.bat" bootJar -q
if errorlevel 1 (
  popd
  echo [x] backend build failed -- see the output above.
  goto :fail
)
popd
if not exist "api\build\libs\blog-api.jar" (
  echo [x] backend build finished but blog-api.jar is missing.
  goto :fail
)
echo [v] backend jar ready

:skipbackend
if not defined WEBONLY goto :backendok
rem A frontend-only round still needs an existing jar, otherwise pkg\ would end up
rem with a web root and nothing to serve it from.
if not exist "%PKG%\api\lastest\blog-api.jar" (
  echo [x] pkg\api\lastest\blog-api.jar is missing.
  echo     Run a full build first:  make-package.bat
  goto :fail
)
echo [-] backend skipped ^(web mode^) -- pkg\api\lastest\ keeps the last full build
:backendok

rem -- build frontend ----------------------------------------------------------
if not exist "vue3\node_modules" (
  echo [ ] vue3\node_modules missing, installing frontend deps...
  pushd vue3
  call npm install
  if errorlevel 1 (
    popd
    echo [x] npm install failed
    goto :fail
  )
  popd
)
echo [ ] building frontend...
pushd vue3
call npm run build
if errorlevel 1 (
  popd
  echo [x] frontend build failed -- see the output above.
  goto :fail
)
popd
if not exist "vue3\dist\index.html" (
  echo [x] frontend build finished but vue3\dist\index.html is missing.
  goto :fail
)
echo [v] frontend dist ready

rem -- assemble ---------------------------------------------------------------
rem pkg\ mirrors the deploy layout recorded in env_config.md:
rem     pkg\api\lastest  ->  /srv/open-markdown-blog/api/lastest
rem     pkg\www\lastest  ->  /srv/open-markdown-blog/www/lastest
set "API_DIR=%PKG%\api\lastest"
set "WWW_DIR=%PKG%\www\lastest"

if defined WEBONLY goto :assembleweb

echo [ ] assembling pkg\ ...
if exist "%PKG%" rd /s /q "%PKG%"
mkdir "%API_DIR%"
mkdir "%WWW_DIR%"

copy /y "api\build\libs\blog-api.jar" "%API_DIR%\blog-api.jar" >nul
xcopy /e /i /q /y "vue3\dist" "%WWW_DIR%" >nul
copy /y "tools\pkg\run.sh" "%API_DIR%\run.sh" >nul
copy /y "tools\pkg\README.txt" "%API_DIR%\README.txt" >nul
echo [v] api\lastest\blog-api.jar  +  www\lastest\  +  run.sh  +  README.txt
goto :buildinfo

:assembleweb
rem Only www\lastest is refreshed. api\lastest is deliberately left alone --
rem wiping it would throw away the jar that this mode exists to preserve.
echo [ ] refreshing pkg\www\lastest ...
if exist "%WWW_DIR%" rd /s /q "%WWW_DIR%"
mkdir "%WWW_DIR%"
xcopy /e /i /q /y "vue3\dist" "%WWW_DIR%" >nul
echo [v] www\lastest  ^(api\lastest untouched^)

:buildinfo
rem BUILD.txt records which jar is in the package -- meaningless after a
rem frontend-only round, where the jar is by definition last full build's.
if defined WEBONLY goto :report

rem -- build info (kept ASCII so it reads fine in any editor) --------------------
rem Take the timestamp from PowerShell rather than %DATE%/%TIME%: on some locales
rem (e.g. Japanese Windows) %DATE% contains parentheses, which would close the
rem redirection block early and run the rest as commands.
set "BUILT="
for /f "delims=" %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd-HH:mm:ss" 2^>nul') do set "BUILT=%%d"
if not defined BUILT set "BUILT=unknown"

> "%API_DIR%\BUILD.txt" (
  echo open markdown blog - build info
  echo ============================================================
  echo built at : %BUILT%
  echo host     : %COMPUTERNAME%
  echo.
  for /f "delims=" %%v in ('java -version 2^>^&1 ^| findstr /i "version"') do echo %%v
  for /f "delims=" %%v in ('node -v 2^>^&1') do echo node     : %%v
  echo.
  for %%f in ("%API_DIR%\blog-api.jar") do echo jar      : %%~zf bytes
  echo.
  echo deploy root: /srv/open-markdown-blog
  echo   this folder -^> api/lastest   ^(jar + run.sh^)
  echo   www/lastest -^> www/lastest   ^(frontend^)
  echo run       : sh run.sh          ^(backgrounds itself; stop with: sh run.sh stop^)
  echo details   : see README.txt in this folder
)

:report
if defined WEBONLY goto :reportweb

rem -- report ------------------------------------------------------------------
echo.
echo ============================================================
echo   pkg\ is ready  -^>  /srv/open-markdown-blog
echo ============================================================
echo.
dir /s /b "%PKG%" | findstr /v "\\assets\\"
echo.
echo next steps:
echo   1) upload the backend ^(only needed when Java or config changed^):
echo        rsync -av --delete pkg/api/lastest/ user@server:/srv/open-markdown-blog/api/lastest/
echo   2) upload the frontend:
echo        rsync -av --delete pkg/www/lastest/ user@server:/srv/open-markdown-blog/www/lastest/
echo   3) restart the backend on the server:
echo        sudo systemctl restart open-markdown-blog
echo      first time instead:  cd /srv/open-markdown-blog/api/lastest ^&^& sh run.sh
echo   4) the notes you want to browse go up separately:
echo        rsync -av "YOUR_MD_DIR/" user@server:/srv/blog/
echo.
echo   NEVER rsync the whole pkg\ with --delete: pkg\ contains no file\, so that
echo   would wipe the server's H2 database and uploaded images.
echo.
goto :done

:reportweb
echo.
echo ============================================================
echo   pkg\www\lastest is ready  ^(web mode^)
echo ============================================================
echo.
echo upload ONLY the frontend:
echo   rsync -av --delete pkg/www/lastest/ user@server:/srv/open-markdown-blog/www/lastest/
echo.
echo notes:
echo   * pkg\api\lastest\ is untouched -- the jar in it is from the last FULL build.
echo   * No restart needed: Caddy reads the web root straight off disk.
echo   * --delete is scoped to www/lastest, so stale hashed assets go and nothing
echo     else does. Never rsync the whole pkg\ with --delete -- pkg\ contains no
echo     file\, and that WOULD wipe the server's H2 database and uploaded images.
echo.
goto :done

:fail
echo.
pause
exit /b 1

:done
endlocal
exit /b 0
