@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules call npm install
start "游鉴" http://localhost:5173
npm run dev

