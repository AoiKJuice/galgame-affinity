@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul || goto missing_node
where npm >nul 2>nul || goto missing_node

if not exist node_modules (
  echo 正在安装首次运行所需依赖...
  call npm install || goto failed
)

start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "$url='http://localhost:5173'; for($i=0;$i -lt 120;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 $url;if($r.StatusCode -eq 200){Start-Process $url;exit 0}}catch{};Start-Sleep -Milliseconds 500};exit 1"
echo 游鉴启动中。这个窗口关闭后，本地网页也会停止。
call npm run dev
if errorlevel 1 goto failed
exit /b 0

:missing_node
echo 未找到 Node.js 22 或 npm。请安装 Node.js 22 LTS 后重新双击本文件。
pause
exit /b 1

:failed
echo 启动失败，错误信息见上方。
pause
exit /b 1
