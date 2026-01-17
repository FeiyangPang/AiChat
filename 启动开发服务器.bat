@echo off
chcp 65001 >nul
title 故事AI角色扮演游戏 - 开发服务器

echo ========================================
echo   故事AI角色扮演游戏 - 开发服务器
echo ========================================
echo.

:: 切换到脚本所在目录
cd /d "%~dp0"

echo 当前目录: %CD%
echo.

:: 检查 node_modules 是否存在
if not exist "node_modules" (
    echo [信息] 检测到未安装依赖，正在安装...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [错误] 依赖安装失败，请检查网络连接和Node.js环境
        pause
        exit /b 1
    )
    echo.
    echo [成功] 依赖安装完成！
    echo.
) else (
    echo [信息] 依赖已安装，跳过安装步骤
    echo.
)

:: 启动开发服务器
echo [信息] 正在启动开发服务器...
echo.
echo 服务器启动后，浏览器将自动打开
echo 如果未自动打开，请访问: http://localhost:3000
echo.
echo 按 Ctrl+C 可以停止服务器
echo ========================================
echo.

call npm run dev

pause

