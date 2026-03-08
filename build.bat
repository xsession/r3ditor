@echo off
set PATH=%USERPROFILE%\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin;%PATH%
cd /d c:\GIT\WORK\codelayer\r3ditor

echo === BUILD START %DATE% %TIME% === >> logs\build_output.txt
cargo build -p r3ditor-desktop >> logs\build_output.txt 2>&1
set EC=%ERRORLEVEL%
echo === BUILD END %DATE% %TIME% EXIT=%EC% === >> logs\build_output.txt

if %EC%==0 (
    echo BUILD_SUCCESS > logs\build_status.txt
) else (
    echo BUILD_FAILED > logs\build_status.txt
)
