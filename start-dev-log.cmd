@echo off
cd /d "%~dp0"
call "%~dp0dev.cmd" > "%~dp0next-dev.log" 2>&1
