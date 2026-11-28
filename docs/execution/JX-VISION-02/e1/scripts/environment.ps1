# environment.ps1 —— 九霄本地环境统一入口（模板）
#
# 用法（新开的 PowerShell 窗口）：
#   . <LAB_ROOT>\Management\environment.ps1
#   Start-JxComfyUI
#   jx-verify
#
# 所有路径均可用参数或环境变量覆盖；脚本不写注册表、不改系统 PATH、不需要管理员权限。
param(
  [string]$LabRoot = $(if ($env:JX_LAB_ROOT) { $env:JX_LAB_ROOT } else { Join-Path (Get-Location) 'Jiuxiao-Lab' }),
  [string]$ComfyRoot = $env:JX_COMFY_ROOT,
  [string]$ComfyUrl = 'http://127.0.0.1:8188',
  [switch]$Quiet
)

if (-not (Test-Path -LiteralPath $LabRoot)) {
  throw "LabRoot 不存在：$LabRoot。请传 -LabRoot 指向资源中心根目录。"
}
if (-not $ComfyRoot -or -not (Test-Path -LiteralPath $ComfyRoot)) {
  throw "ComfyRoot 未设置或不存在。请先设置 `$env:JX_COMFY_ROOT，或传 -ComfyRoot 指向现有 ComfyUI 目录。"
}

$script:JxLabRoot = (Resolve-Path -LiteralPath $LabRoot).Path
$script:JxComfyRoot = (Resolve-Path -LiteralPath $ComfyRoot).Path

# ---- 目录约定（与 README 的 Lab 布局一致）----
$env:JX_LAB_ROOT     = $script:JxLabRoot
$env:JX_COMFY_ROOT   = $script:JxComfyRoot
$env:JX_COMFY_URL    = $ComfyUrl
$env:JX_COMFY_PY     = Join-Path $script:JxComfyRoot '.venv\Scripts\python.exe'
$env:JX_COMFY_RAW_OUT = Join-Path $script:JxLabRoot 'Outputs\Images\_comfy_raw'
$env:JX_INPUT_DIR    = Join-Path $script:JxLabRoot 'Workspaces\AI-Art\inputs'

# ---- Blender：优先 5.3 便携 → 5.2.5 LTS 便携 → 系统安装 ----
$blenderCandidates = @(
  (Join-Path $script:JxLabRoot 'Tools\Graphics\Blender\blender-5.3.0-windows-x64\blender.exe'),
  (Join-Path $script:JxLabRoot 'Tools\Graphics\Blender\blender-5.2.5-windows-x64\blender.exe'),
  (Join-Path $env:ProgramFiles 'Blender Foundation\Blender 5.2\blender.exe')
)
$env:JX_BLENDER = ($blenderCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)

# ---- PATH：只在当前进程前置 Lab 工具，不动系统环境 ----
$pathDirs = @(
  (Join-Path $script:JxLabRoot 'Tools\Node'),
  (Join-Path $script:JxLabRoot 'Tools\Image\ImageMagick'),
  (Join-Path $script:JxLabRoot 'Tools\Image\KTX-Software\bin'),
  (Join-Path $script:JxLabRoot 'Tools\Download'),
  (Join-Path $script:JxLabRoot 'Tools\Graphics\RenderDoc\RenderDoc_1.47_64')
) | Where-Object { Test-Path -LiteralPath $_ }
$env:PATH = ($pathDirs -join ';') + ';' + $env:PATH

# ---- 常用函数 ----
function Start-JxComfyUI {
  <# 启动 ComfyUI；PID 写入 <LAB_ROOT>\Cache\comfyui.pid，日志在 Management\Logs #>
  $py = $env:JX_COMFY_PY
  if (-not (Test-Path -LiteralPath $py)) { throw "找不到 ComfyUI Python: $py" }
  $logOut = Join-Path $env:JX_LAB_ROOT 'Management\Logs\comfyui.out'
  $logErr = Join-Path $env:JX_LAB_ROOT 'Management\Logs\comfyui.err'
  New-Item -ItemType Directory -Force -Path (Split-Path $logOut) | Out-Null
  $extra = Join-Path $env:JX_LAB_ROOT 'Management\comfyui-extra-model-paths.yaml'
  $args = @(
    (Join-Path $env:JX_COMFY_ROOT 'main.py'), '--listen', '127.0.0.1', '--port', '8188',
    '--output-directory', $env:JX_COMFY_RAW_OUT,
    '--temp-directory', (Join-Path $env:JX_LAB_ROOT 'Cache\Render'),
    '--input-directory', $env:JX_INPUT_DIR
  )
  if (Test-Path -LiteralPath $extra) { $args += @('--extra-model-paths-config', $extra) }
  $p = Start-Process -FilePath $py -ArgumentList $args -WorkingDirectory $env:JX_COMFY_ROOT -WindowStyle Hidden `
    -RedirectStandardOutput $logOut -RedirectStandardError $logErr -PassThru
  Set-Content -LiteralPath (Join-Path $env:JX_LAB_ROOT 'Cache\comfyui.pid') -Value $p.Id
  Write-Host "ComfyUI PID $($p.Id)；等待 /system_stats …"
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 2
    try { $null = Invoke-RestMethod "$env:JX_COMFY_URL/system_stats" -TimeoutSec 3; Write-Host 'ComfyUI 就绪'; return $p } catch {}
  }
  Write-Warning 'ComfyUI 在 80s 内未就绪，请查看 Management\Logs\comfyui.err'
}

function Stop-JxComfyUI {
  $pidFile = Join-Path $env:JX_LAB_ROOT 'Cache\comfyui.pid'
  if (-not (Test-Path -LiteralPath $pidFile)) { Write-Warning '没有 PID 记录'; return }
  $processId = Get-Content -LiteralPath $pidFile -Raw
  try { Stop-Process -Id ([int]$processId) -Force; Write-Host "已停止 PID $processId" } catch { Write-Warning $_ }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

function jx-verify([string]$Mode = 'Quick', [switch]$Strict) {
  $script = Join-Path $env:JX_LAB_ROOT 'Management\Scripts\verify-environment.ps1'
  $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $script, '-LabRoot', $env:JX_LAB_ROOT, '-Mode', $Mode)
  if ($Strict) { $a += '-Strict' }
  & (Get-Process -Id $PID).Path @a
}

if (-not $Quiet) {
  Write-Host "JX Lab : $env:JX_LAB_ROOT"
  Write-Host "ComfyUI: $env:JX_COMFY_ROOT  ($env:JX_COMFY_URL)"
  Write-Host "Blender: $env:JX_BLENDER"
  Write-Host '函数：Start-JxComfyUI / Stop-JxComfyUI / jx-verify'
}
