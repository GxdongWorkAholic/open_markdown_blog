@echo off
rem ============================================================================
rem  open markdown blog -- local dev launcher (Windows)
rem
rem  Usage:  double-click this file, or run start-dev.bat from anywhere
rem          start-dev.bat stop     kill whatever holds ports 8090 / 5173
rem
rem  What it does:
rem    1. builds the backend jar, then starts both services IN THE BACKGROUND
rem       (no extra windows). The backend log is written BY THE APP itself, to
rem       api\build\libs\logs\<date>\api.log -- i.e. next to the jar it runs
rem       from (see com.gxdong.blog.config.LogDir). The frontend log is npm
rem       build output, which the app knows nothing about, so it stays in
rem       file\db\h2\web.log next to the H2 database.
rem    2. prints the web UI links: frontend, backend API, and the H2 database
rem       web console (with the exact JDBC URL to paste)
rem    3. keeps this window as the single control window -- CLOSING IT STOPS
rem       BOTH SERVICES, because they are attached to this console
rem
rem  Three hard-won constraints -- please keep them:
rem
rem  1) CRLF LINE ENDINGS (.gitattributes pins *.bat to eol=crlf). With LF-only
rem     cmd still runs most of it, but `call :label` fails with "cannot find the
rem     batch label". Verified.
rem
rem  2) ASCII-ONLY. cmd reads .bat files using the console code page (GBK/936 on
rem     Chinese Windows). UTF-8 Chinese in a .bat makes cmd swallow the
rem     following newline as the second byte of a double-byte char, merging two
rem     lines into one bogus command. "chcp 65001" does not help, because cmd
rem     does not re-read the rest of the file after the code page changes.
rem     Also verified. (The Chinese the backend itself prints goes to the log
rem     files, which are UTF-8 and stay readable.)
rem
rem  3) It runs `java -jar` instead of `gradlew bootRun` ON PURPOSE. bootRun
rem     hands the app to the Gradle daemon -- a deliberately detached process --
rem     so the app JVM would NOT be attached to this console and closing the
rem     window would leave it running. Running the jar directly makes the app a
rem     direct, console-attached child.
rem
rem  Sleep uses `ping`, not `timeout`: timeout.exe refuses to run with stdin
rem  redirected, and can be shadowed by the coreutils `timeout` under Git Bash.
rem ============================================================================

setlocal
rem Fixed window title, so "close this window" is unambiguous.
title open-markdown-blog-dev
rem Always work from the repo root, no matter where this was called from.
cd /d "%~dp0"

if /i "%~1"=="stop" goto :stop

echo.
echo ============================================================
echo   open markdown blog  -  local dev launcher
echo ============================================================
echo.

rem -- preflight checks -------------------------------------------------------
where java >nul 2>&1
if errorlevel 1 (
  echo [x] java not found on PATH. Install JDK 17+ and open a NEW terminal.
  goto :fail
)

if not exist "api\gradlew.bat" (
  echo [x] api\gradlew.bat is missing.
  echo     Make sure this script sits in the repo root and api\gradle\wrapper\ is intact.
  goto :fail
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [x] npm not found on PATH. Install Node 18+ and open a NEW terminal.
  goto :fail
)

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
  echo [v] frontend deps installed
)

rem -- port checks ------------------------------------------------------------
set "BUSY="
call :check_port 8090
if not errorlevel 1 set "BUSY=1"
call :check_port 5173
if not errorlevel 1 set "BUSY=1"
if defined BUSY (
  echo.
  echo [!] The ports above are already in use -- usually a leftover from last time.
  echo     Run:   start-dev.bat stop
  echo     or close the old window, then run this script again.
  goto :fail
)

rem -- layout ----------------------------------------------------------------
rem Dev data lives inside the repo so it is easy to find and easy to reset
rem (just delete the folder): application-dev.yml puts it in file/db/h2 and
rem uploads in file/img. The launcher's own logs (build.log / web.log) go to
rem file\db\h2, next to the database.
set "LOGDIR=%~dp0file\db\h2"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

rem The backend writes its own log next to the jar it is running from:
rem api\build\libs\logs\<date>\api.log -- see com.gxdong.blog.config.LogDir.
rem NOTE: that folder lives under api\build\, so `gradlew clean` wipes the logs
rem along with the build. Set APP_LOG_DIR below if you would rather keep them.
rem The date comes from PowerShell, not %DATE%: on some locales %DATE% contains
rem parentheses, which would close the redirection block early (same reason
rem make-package.bat does it this way).
set "APILOGDIR=%~dp0api\build\libs\logs"
set "TODAY="
for /f "delims=" %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd" 2^>nul') do set "TODAY=%%d"
rem No PowerShell -> the paths printed below are just less precise; nothing else breaks.
set "TODAYSHOW=%TODAY%"
if not defined TODAYSHOW set "TODAYSHOW=[today]"
set "APILOG=%APILOGDIR%\%TODAYSHOW%\api.log"

rem -- build the backend -----------------------------------------------------
rem Call the wrapper by FULL PATH on purpose: if NoDefaultCurrentDirectoryInExePath
rem is set (some shells/environments do), cmd refuses to look in the current
rem directory for executables -- `gradlew.bat` alone then fails with "not
rem recognized as an internal or external command" even though `where` finds it.
rem The pushd is still needed: Gradle resolves settings.gradle from the cwd.
echo [ ] building backend jar...
pushd api
call "%~dp0api\gradlew.bat" bootJar -q > "%~dp0file\db\h2\build.log" 2>&1
if errorlevel 1 (
  popd
  echo [x] backend build failed. See file\db\h2\build.log
  goto :fail
)
popd
echo [v] backend jar ready

rem -- start both services in the background ---------------------------------
rem Environment variables instead of --args: no nested-quote hazards, and they
rem are inherited by the children started below.
rem
rem The two data dirs come from application-dev.yml (./file/db/h2 for the H2
rem database, ./file/img for uploads), so java MUST be started with the repo root
rem as its working directory -- otherwise those relative paths resolve to
rem api/file/... instead. That is why there is no `pushd api` below: the launcher
rem already did `cd /d "%~dp0"`, so the children inherit the repo root.
rem (Do NOT add a pushd around the java line without switching it to an absolute
rem jar path -- it would silently move the database.)
set "SPRING_PROFILES_ACTIVE=dev"
set "SPRING_H2_CONSOLE_ENABLED=true"
rem vite.config.js already defaults the /api proxy to this backend (8090). Set it
rem explicitly anyway, so a stray API_TARGET in the environment cannot redirect it.
set "API_TARGET=http://127.0.0.1:8090"

rem `start /B` = same console, no new window -- so closing this window kills them.
rem The backend's stdout goes to the null device ON PURPOSE: the app writes a
rem proper rolling log file itself (api\build\libs\logs\<date>\api.log, UTF-8,
rem gzipped archives), and letting the console copy land in the same file would
rem write every line twice. Startup failures still reach that file -- logback is
rem initialised before any of the app's own beans.
rem -Dstdout.encoding only matters if you ever redirect this by hand.
start /B "" cmd /c "java -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8 -jar api\build\libs\blog-api.jar > nul 2>&1"

pushd vue3
start /B "" cmd /c "npm run dev > ..\file\db\h2\web.log 2>&1"
popd

echo [ ] starting backend  api  ... log: %APILOG%
echo [ ] starting frontend vue3 ... log: file\db\h2\web.log

echo.
echo [ ] waiting for the backend to become ready...
set /a TRIES=0

:waitloop
call :port_up 8090
if not errorlevel 1 goto :ready
ping -n 3 127.0.0.1 >nul
set /a TRIES+=1
if %TRIES% lss 60 goto :waitloop

echo.
echo [!] backend not listening after about two minutes.
echo     Check %APILOG% for the actual error.
echo.
goto :hold

:ready
rem The H2 console login page does NOT pre-fill the JDBC URL (the DataSource is
rem built by hand, so Spring Boot has nothing to pre-fill from). Take the exact
rem string the running app uses out of the log -- it MUST match, because H2 treats
rem a URL with different parameters as a different database and then hits the file
rem lock. That log line is pure ASCII, so echoing it here cannot mojibake.
echo.
echo [v] backend ready
echo.
echo ------------------------------------------------------------
echo   frontend  ^(hot reload^) : http://127.0.0.1:5173/
echo   backend API             : http://127.0.0.1:8090/
echo   database web UI         : http://127.0.0.1:8090/h2-console/
echo                             connection string is ALREADY pre-filled -- just click Connect
echo                             user: sa      password: ^(empty^)
echo.
rem H2 console Pre-filled -- see the note above. In short: the H2 console ships with
rem jdbc:h2:~/test pre-filled, and connecting to that gives the confusing error
rem 90149. The backend writes this app's own connection string into
rem ~/.h2.server.properties (same as clicking Save once in the console), so you
rem normally never have to type anything. The line below is just a fallback.
set "H2LINE="
rem Only worth grepping when we actually know today's date; otherwise the path
rem below is the "[today]" placeholder and findstr would silently find nothing.
if defined TODAY for /f "delims=" %%a in ('findstr /C:";DB_CLOSE_DELAY=-1" "%APILOG%" 2^>nul') do set "H2LINE=%%a"
if defined H2LINE set "H2URL=%H2LINE:*jdbc:=jdbc:%"
if defined H2URL echo   ^(if you ever need it manually: %H2URL%^)
echo.
echo   unlock settings page    : http://127.0.0.1:5173/?key=YOUR_KEY
echo   default key is "ihateblog" - change it on the settings page.
echo.
echo   logs: %APILOG%   file\db\h2\web.log
echo   stop: close this window  ^(both services die with it^)
echo         or run  start-dev.bat stop
echo ------------------------------------------------------------
start "" "http://127.0.0.1:5173/"

:hold
echo.
echo ============================================================
echo   Both services are running in the background.
rem The ">" and "<" must be escaped: cmd reads a bare ">>>" as redirection
rem operators and fails with "> was unexpected at this time", which aborts the
rem whole batch file -- so the pause below would never run and "press any key to
rem stop" would silently do nothing. Verified the hard way.
echo   ^>^>^>  Press any key  ^(or close this window^)  to STOP them.  ^<^<^<
echo ============================================================
pause >nul

echo.
echo stopping services...
call :kill_port 8090
call :kill_port 5173
echo done.
goto :done

:stop
echo.
echo Stopping whatever holds ports 8090 / 5173...
call :kill_port 8090
call :kill_port 5173
echo Done.
goto :done

rem -- subroutines ------------------------------------------------------------
rem Returns 0 when the port is taken, 1 when it is free.
:check_port
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%1 " ^| findstr "LISTENING"') do (
  echo [!] port %1 is in use by PID %%p
  exit /b 0
)
exit /b 1

rem Returns 0 when something is listening on the port.
:port_up
netstat -ano | findstr ":%1 " | findstr "LISTENING" >nul 2>&1
exit /b %errorlevel%

:kill_port
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%1 " ^| findstr "LISTENING"') do (
  echo   stopping PID %%p  on port %1
  taskkill /F /PID %%p >nul 2>&1
)
exit /b 0

:fail
echo.
pause
exit /b 1

:done
echo.
endlocal
exit /b 0
