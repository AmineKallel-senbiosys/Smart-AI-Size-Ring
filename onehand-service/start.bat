@echo off
title Ring size finder
cd /d "%~dp0"
echo Starting the ring size finder on http://localhost:4185 ...
echo Open that address in your browser. Press Ctrl+C to stop.
node server.mjs
pause
