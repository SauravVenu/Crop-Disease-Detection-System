@echo off
powershell -NoProfile -Command "$ports = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($pid in $ports) { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue }" >nul 2>nul
where py >nul 2>nul
if %ERRORLEVEL%==0 (
	py "%~dp0server.py"
) else (
	where python >nul 2>nul
	if %ERRORLEVEL%==0 (
		python "%~dp0server.py"
	) else (
		"C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" "%~dp0server.py"
	)
)
pause
