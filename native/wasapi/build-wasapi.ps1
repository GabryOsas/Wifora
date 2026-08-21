# PowerShell build script for Wifora WASAPI Native Audio Capture Helper
$ErrorActionPreference = "Continue"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceFile = Join-Path $scriptDir "wifora-audio.cpp"
$outputExe = Join-Path $scriptDir "wifora-audio.exe"

Write-Host "=== Wifora WASAPI Helper Build ==="
Write-Host "Source: $sourceFile"
Write-Host "Target: $outputExe"

# Check for CMake + MSVC / Ninja
if (Get-Command cmake -ErrorAction SilentlyContinue) {
    Write-Host "Found CMake. Attempting build via CMake..."
    $buildDir = Join-Path $scriptDir "build"
    if (!(Test-Path $buildDir)) { New-Item -ItemType Directory -Path $buildDir | Out-Null }
    
    cmake -B $buildDir -S $scriptDir
    if ($LASTEXITCODE -eq 0) {
        cmake --build $buildDir --config Release
        if ($LASTEXITCODE -eq 0) {
            $builtBinary = Join-Path $buildDir "Release\wifora-audio.exe"
            if (Test-Path $builtBinary) {
                Copy-Item -Path $builtBinary -Destination $outputExe -Force
                Write-Host "Successfully built and copied wifora-audio.exe" -ForegroundColor Green
                exit 0
            }
        }
    }
}

# Check for cl.exe (MSVC Compiler) directly
if (Get-Command cl -ErrorAction SilentlyContinue) {
    Write-Host "Found cl.exe (MSVC). Compiling directly..."
    cl.exe /std:c++20 /O2 /W3 /DUNICODE /D_UNICODE /DNOMINMAX /EHsc /Fe"$outputExe" "$sourceFile" ole32.lib avrt.lib
    if ($LASTEXITCODE -eq 0 -and (Test-Path $outputExe)) {
        Write-Host "Successfully compiled wifora-audio.exe with MSVC" -ForegroundColor Green
        exit 0
    }
}

# Check for g++ / clang++ (MinGW or Clang)
if (Get-Command g++ -ErrorAction SilentlyContinue) {
    Write-Host "Found g++. Compiling..."
    g++ -std=c++20 -O3 -municode -o "$outputExe" "$sourceFile" -lole32 -lavrt -lksuser -loleaut32
    if ($LASTEXITCODE -eq 0 -and (Test-Path $outputExe)) {
        Write-Host "Successfully compiled wifora-audio.exe with g++" -ForegroundColor Green
        exit 0
    }
}

# A double-clicked PowerShell session normally does not inherit the Visual
# Studio developer environment. Discover it and build in a child cmd.exe so
# the script works without asking the user to launch a special shell first.
$vsDevCmd = Get-ChildItem -Path @("C:\Program Files\Microsoft Visual Studio", "D:\Microsoft Visual Studio") -Filter "VsDevCmd.bat" -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($vsDevCmd) {
    $vsRoot = (Resolve-Path (Join-Path $vsDevCmd.DirectoryName "..\..")).Path
    $vsCmake = Join-Path $vsRoot "Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
    if (Test-Path $vsCmake) {
        Write-Host "Found Visual Studio developer tools. Attempting CMake build..."
        $buildDir = Join-Path $scriptDir "build"
        $command = 'call "{0}" -arch=x64 -host_arch=x64 && "{1}" -S "{2}" -B "{3}" -A x64 && "{1}" --build "{3}" --config Release' -f $vsDevCmd.FullName, $vsCmake, $scriptDir, $buildDir
        cmd.exe /d /c $command
        if ($LASTEXITCODE -eq 0) {
            $builtBinary = Join-Path $buildDir "Release\wifora-audio.exe"
            if (Test-Path $builtBinary) {
                Copy-Item -Path $builtBinary -Destination $outputExe -Force
                Write-Host "Successfully built and copied wifora-audio.exe" -ForegroundColor Green
                exit 0
            }
        }
    }
}

Write-Host "No C++20 Windows compiler found in PATH (CMake, MSVC cl.exe, or g++)." -ForegroundColor Yellow
Write-Host "Wifora will seamlessly use the browser capture fallback path until wifora-audio.exe is compiled."
exit 0
