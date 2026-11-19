@echo off
title Setup Python for the ring size service
cd /d "%~dp0onehand-service"
python --version
if errorlevel 1 (
  echo Python was not found. Install Python 3.11 or 3.12 from python.org, tick "Add python.exe to PATH", then run this file again.
  pause
  exit /b 1
)
echo Creating the environment in onehand-service\.venv ...
python -m venv .venv
if errorlevel 1 (
  echo Could not create the environment.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m pip install --upgrade pip
echo Installing the packages, this takes a few minutes ...
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo INSTALL FAILED. Copy the red lines above and send them to Claude.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -c "import cv2, mediapipe, numpy, onnxruntime; print('OK: all packages work')"
echo.
echo Done. Now stop and start:  npm run onehand
pause
