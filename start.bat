@echo off
title Leaflet Dev Server
cd /d "%~dp0"
echo Запуск сервера разработки Leaflet...
npm run dev -- --open
pause
