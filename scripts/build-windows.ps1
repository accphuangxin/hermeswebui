# Windows 打包脚本（PowerShell）
#
# 用法（在仓库根目录）：
#   pwsh -File scripts/build-windows.ps1
#   pwsh -File scripts/build-windows.ps1 -Bundles nsis
#   pwsh -File scripts/build-windows.ps1 -SkipChecks
#   powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
#
# 说明见 docs/build-windows.md

[CmdletBinding()]
param(
    # 要产出的安装包格式，逗号分隔：msi / nsis
    [string]$Bundles = "msi,nsis",

    # 跳过打包前的检查（类型检查 / 单测 / cargo clippy）
    [switch]$SkipChecks,

    # Debug 构建
    [switch]$DebugBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# StrictMode 下未赋值的变量读取会抛异常，先声明退出码
Set-Variable -Name LASTEXITCODE -Value 0 -Scope Global -Force

# Windows PowerShell 5.1 的默认输出编码不是 UTF-8，中文提示会乱码
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
    # 某些宿主（如 ISE）不允许改，忽略即可
}

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "    OK  $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "    !   $Message" -ForegroundColor Yellow
}

function Fail([string]$Message) {
    Write-Host ""
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------- 环境检查

Write-Step "检查构建环境"

# $IsWindows 只在 PowerShell 6+ 存在，Windows PowerShell 5.1 下引用会报错
$isWindowsHost = if ($PSVersionTable.PSVersion.Major -ge 6) {
    $IsWindows
} else {
    $env:OS -eq "Windows_NT"
}
if (-not $isWindowsHost) {
    Fail "此脚本只能在 Windows 上运行。Tauri 不支持从 macOS/Linux 交叉编译 Windows 安装包。"
}

foreach ($cmd in @("node", "pnpm", "rustc", "cargo")) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if (-not $found) { Fail "找不到 $cmd，请先安装并确保它在 PATH 中。" }
}

# pnpm 在 PowerShell 下是 .cmd shim，必须通过 cmd 调用才能拿到退出码
$nodeVersion = (& node -v).TrimStart("v")
$pnpmVersion = (& pnpm -v).Trim()
$rustVersion = (& rustc -V)

Write-Ok "Node.js $nodeVersion"
Write-Ok "pnpm    $pnpmVersion"
Write-Ok "$rustVersion"

# pnpm 12 才支持 pnpm-workspace.yaml 里的 allowBuilds
$pnpmMajor = [int]($pnpmVersion.Split(".")[0])
if ($pnpmMajor -lt 12) {
    Write-Warn "当前 pnpm 是 $pnpmVersion。pnpm-workspace.yaml 里的 allowBuilds 需要 pnpm 12 才生效。"
    Write-Warn "本次构建通常仍能成功（esbuild / tailwind oxide 用预编译二进制），但建议升级：corepack enable && corepack prepare pnpm@12 --activate"
}

# 版本一致性
$pkgVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tauriVersion = (Get-Content src-tauri/tauri.conf.json -Raw | ConvertFrom-Json).version
if ($pkgVersion -ne $tauriVersion) {
    Write-Warn "package.json ($pkgVersion) 与 tauri.conf.json ($tauriVersion) 版本不一致，安装包版本以 tauri.conf.json 为准。"
}

# ---------------------------------------------------------------- 安装依赖

Write-Step "安装前端依赖"
& pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { Fail "pnpm install 失败" }
Write-Ok "依赖已就绪"

# ---------------------------------------------------------------- 打包前检查

if (-not $SkipChecks) {
    Write-Step "类型检查"
    & pnpm typecheck
    if ($LASTEXITCODE -ne 0) { Fail "类型检查失败" }
    Write-Ok "无类型错误"

    Write-Step "单元测试"
    & pnpm test:unit
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "单元测试有失败项。"
        Write-Warn "已知与本功能无关的失败：tests/integration/App.test.tsx、tests/components/UnifiedSkillsPanel.test.tsx"
        Write-Warn "（jsdom 缺少 scrollIntoView / scrollTo 实现）"
        $answer = Read-Host "仍然继续打包？(y/N)"
        if ($answer -ne "y" -and $answer -ne "Y") { Fail "已取消打包" }
    } else {
        Write-Ok "全部通过"
    }

    Write-Step "Rust 检查（clippy）"
    Push-Location src-tauri
    try {
        & cargo clippy --lib
        if ($LASTEXITCODE -ne 0) { Fail "cargo clippy 失败" }
        Write-Ok "无 clippy 错误"
    } finally {
        Pop-Location
    }
} else {
    Write-Warn "已跳过打包前检查（-SkipChecks）"
}

# ---------------------------------------------------------------- 打包

Write-Step "开始打包（格式：$Bundles）"

$tauriArgs = @("tauri", "build", "--bundles", $Bundles)
if ($DebugBuild) { $tauriArgs += "--debug" }

Write-Host "    pnpm $($tauriArgs -join ' ')" -ForegroundColor DarkGray
& pnpm @tauriArgs
if ($LASTEXITCODE -ne 0) { Fail "打包失败，请检查上面的 cargo / tauri 输出" }

# ---------------------------------------------------------------- 结果

Write-Step "打包完成"

$mode = if ($DebugBuild) { "debug" } else { "release" }
$bundleRoot = "src-tauri\target\$mode\bundle"
$artifacts = @()

if (Test-Path "$bundleRoot\msi") {
    $artifacts += Get-ChildItem "$bundleRoot\msi" -Filter *.msi -ErrorAction SilentlyContinue
}
if (Test-Path "$bundleRoot\nsis") {
    $artifacts += Get-ChildItem "$bundleRoot\nsis" -Filter *.exe -ErrorAction SilentlyContinue
}
$appDir = "$bundleRoot\windows"
if (Test-Path $appDir) {
    $artifacts += Get-Item $appDir -ErrorAction SilentlyContinue
}

if ($artifacts.Count -eq 0) {
    Write-Warn "没有在 $bundleRoot 下找到安装包，请手动检查该目录。"
} else {
    foreach ($item in $artifacts) {
        # DirectoryInfo 没有 Length 属性，StrictMode 下直接读会抛异常
        if ($item.PSIsContainer) {
            Write-Host ("    {0,-58} {1}" -f $item.FullName, "目录") -ForegroundColor Green
        } else {
            $sizeMb = [math]::Round($item.Length / 1MB, 1)
            Write-Host ("    {0,-58} {1} MB" -f $item.FullName, $sizeMb) -ForegroundColor Green
        }
    }
}

Write-Host ""
Write-Host "下一步：" -ForegroundColor Cyan
Write-Host "  1. 把 .msi 或 .exe 拷到目标机器安装"
Write-Host "  2. 首次运行后在 设置 → 通用 → 语音输入 里填 API Key（安装包不含任何凭证）"
Write-Host "  3. 未签名的包会触发 SmartScreen「未知发布者」，点「更多信息 → 仍要运行」"
Write-Host ""
