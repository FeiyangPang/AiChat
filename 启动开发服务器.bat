@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title 故事AI角色扮演游戏 - 一键启动

echo ========================================
echo   故事AI角色扮演游戏 - 一键启动
echo ========================================
echo.
echo  本脚本会自动检查并配置所需环境：
echo  - Node.js / npm（没有会自动下载安装）
echo  - 项目依赖（npm install）
echo  - 启动本地游戏服务器
echo.
echo  小白用户只需双击本文件即可，无需手动安装任何东西。
echo ========================================
echo.

:: 切换到脚本所在目录
cd /d "%~dp0"
echo [信息] 当前目录: %CD%
echo.

:: --------------------------------------------------
:: 1. 检查 / 自动安装 Node.js + npm
:: --------------------------------------------------
call :EnsureNode
if errorlevel 1 (
    echo.
    echo [错误] Node.js 自动安装失败。
    echo        请手动打开 https://nodejs.org 下载 LTS 版本安装后，再双击本文件。
    echo.
    pause
    exit /b 1
)

echo [成功] Node.js:
call node -v
echo [成功] npm:
call npm -v
echo.

:: --------------------------------------------------
:: 2. 安装项目依赖
:: --------------------------------------------------
set "NEED_INSTALL=0"
if not exist "node_modules\" set "NEED_INSTALL=1"
if not exist "node_modules\vite\" set "NEED_INSTALL=1"
if not exist "node_modules\react\" set "NEED_INSTALL=1"

if "!NEED_INSTALL!"=="1" (
    echo [信息] 正在安装项目依赖，请稍候（首次可能需要几分钟）...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [警告] 依赖安装失败，正在尝试使用国内镜像重试...
        echo.
        call npm install --registry=https://registry.npmmirror.com
        if errorlevel 1 (
            echo.
            echo [错误] 依赖安装仍然失败，请检查网络后重试。
            pause
            exit /b 1
        )
    )
    echo.
    echo [成功] 项目依赖安装完成！
    echo.
) else (
    echo [信息] 项目依赖已就绪，跳过安装。
    echo.
)

:: --------------------------------------------------
:: 3. 启动开发服务器
:: --------------------------------------------------
echo ========================================
echo [信息] 正在启动游戏服务器...
echo.
echo  启动后浏览器通常会自动打开。
echo  若未自动打开，请手动访问：
echo      http://localhost:3000
echo.
echo  关闭本窗口或按 Ctrl+C 可停止服务器。
echo ========================================
echo.

call npm run dev
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
    echo [错误] 服务器异常退出，代码: %EXITCODE%
) else (
    echo [信息] 服务器已停止。
)
pause
exit /b %EXITCODE%


:: ==================================================
:: 子程序：确保 Node.js / npm 可用；没有则自动安装
:: ==================================================
:EnsureNode
where node >nul 2>&1
if not errorlevel 1 (
    where npm >nul 2>&1
    if not errorlevel 1 (
        exit /b 0
    )
)

echo [信息] 未检测到 Node.js / npm，开始自动安装...
echo.

:: 优先使用 winget（Win10/11 常见）
where winget >nul 2>&1
if not errorlevel 1 (
    echo [信息] 使用 winget 安装 Node.js LTS...
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if not errorlevel 1 (
        call :RefreshPath
        where node >nul 2>&1
        if not errorlevel 1 (
            where npm >nul 2>&1
            if not errorlevel 1 exit /b 0
        )
    )
    echo [警告] winget 安装未成功，改为直接下载安装包...
    echo.
)

:: 回退：下载官方 MSI 并静默安装
set "NODE_MSI=%TEMP%\node-lts-x64.msi"
set "NODE_URL=https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi"

echo [信息] 正在下载 Node.js LTS 安装包...
echo        %NODE_URL%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ^
   try { ^
     Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_MSI%' -UseBasicParsing; ^
     if (-not (Test-Path '%NODE_MSI%')) { exit 1 }; ^
     exit 0 ^
   } catch { ^
     Write-Host $_.Exception.Message; ^
     exit 1 ^
   }"

if errorlevel 1 (
    echo [错误] 下载 Node.js 失败，请检查网络。
    exit /b 1
)

echo [信息] 正在静默安装 Node.js（可能弹出 UAC 权限确认，请点“是”）...
msiexec /i "%NODE_MSI%" /qn /norestart
set "MSI_EXIT=%ERRORLEVEL%"

:: msiexec 成功通常是 0 或 3010（需要重启，但一般仍可用）
if not "%MSI_EXIT%"=="0" if not "%MSI_EXIT%"=="3010" (
    echo [错误] Node.js 安装失败，代码: %MSI_EXIT%
    exit /b 1
)

call :RefreshPath

where node >nul 2>&1
if errorlevel 1 (
    echo [错误] 安装后仍找不到 node 命令。
    echo        请关闭本窗口后重新双击启动，或重启电脑后再试。
    exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
    echo [错误] 安装后仍找不到 npm 命令。
    echo        请关闭本窗口后重新双击启动，或重启电脑后再试。
    exit /b 1
)

echo [成功] Node.js 安装完成！
echo.
exit /b 0


:: ==================================================
:: 子程序：刷新当前会话 PATH（读取注册表最新环境变量）
:: ==================================================
:RefreshPath
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%B"
if defined SYS_PATH (
    if defined USER_PATH (
        set "PATH=%SYS_PATH%;%USER_PATH%"
    ) else (
        set "PATH=%SYS_PATH%"
    )
) else if defined USER_PATH (
    set "PATH=%USER_PATH%"
)
:: 常见 Node 安装路径兜底
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"
exit /b 0
