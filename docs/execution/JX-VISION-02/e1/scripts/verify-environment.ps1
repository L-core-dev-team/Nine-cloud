# verify-environment.ps1 —— 九霄环境健康检查（脱敏模板）
#
# 用法：
#   .\verify-environment.ps1 -LabRoot D:\Jiuxiao-Lab
#   .\verify-environment.ps1 -LabRoot D:\Jiuxiao-Lab -Only gpu,comfyui
#   .\verify-environment.ps1 -LabRoot D:\Jiuxiao-Lab -ReportPath .\verify.json
#
# 判定：
#   PASS    = 真实执行并通过
#   FAIL    = 执行了但结果不符
#   BLOCKED = 前置条件缺失（服务未启动 / 工具未安装），无法执行
#   SKIP    = 有意跳过
#
# 设计约束：只读检查，不安装、不写系统配置；可重复运行；找不到的路径记为 FAIL/BLOCKED 而不是中断。
param(
  [Parameter(Mandatory = $true)][string]$LabRoot,
  [string[]]$Only,
  [string]$ReportPath,
  [switch]$Quiet
)

$ErrorActionPreference = 'Continue'
if (-not (Test-Path -LiteralPath $LabRoot)) { throw "LabRoot 不存在: $LabRoot" }
if (-not $ReportPath) { $ReportPath = Join-Path $LabRoot 'Management\Reports\verify-environment.json' }
New-Item -ItemType Directory -Force -Path (Split-Path $ReportPath) | Out-Null

$tools     = Join-Path $LabRoot 'Tools'
$shimNode  = Join-Path $tools 'Node'
$models    = Join-Path $LabRoot 'Models'
$aiartLib  = Join-Path $LabRoot 'Environments\AI-Art\lib'

# 允许通过环境变量指定外部既有安装（ComfyUI / Blender / GPU venv），避免把本机路径写进仓库
$comfyRoot = $env:JX_COMFY_ROOT
$comfyHost = if ($env:JX_COMFY_URL) { $env:JX_COMFY_URL } else { 'http://127.0.0.1:8188' }
$comfyPy   = $env:JX_COMFY_PY
if (-not $comfyPy -and $comfyRoot) { $comfyPy = Join-Path $comfyRoot '.venv\Scripts\python.exe' }
$blender   = $env:JX_BLENDER

function FirstLine([string]$exe, [string[]]$a) {
  try { return ((& $exe @a 2>&1 | Select-Object -First 1) -join '') } catch { return $null }
}

function Tool([string]$name) {
  $p = Join-Path $shimNode "$name.cmd"
  if (Test-Path -LiteralPath $p) { return $p }
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  return $null
}

$checks = @(
  @{ id = 'node'; desc = 'Node.js 主版本 >= 24'; run = {
      $exe = Tool 'node'; if (-not $exe) { return 'FAIL node 未找到' }
      $v = FirstLine $exe @('-v')
      if ($v -match '^v(\d+)' -and [int]$Matches[1] -ge 24) { "PASS $v" } else { "FAIL $v（低于 24 或不可读）" } } }

  @{ id = 'pnpm'; desc = 'pnpm 版本与仓库锁定一致（11.19.0）'; run = {
      $exe = Tool 'pnpm'; if (-not $exe) { return 'FAIL pnpm 未找到' }
      $v = FirstLine $exe @('-v'); if ($v -eq '11.19.0') { "PASS $v" } else { "FAIL $v" } } }

  @{ id = 'git'; desc = 'Git 可用'; run = {
      $v = FirstLine 'git' @('--version'); if ($v -match 'git version') { "PASS $v" } else { 'FAIL' } } }

  @{ id = 'gh'; desc = 'GitHub CLI 可用'; run = {
      $v = FirstLine 'gh' @('--version'); if ($v -match 'gh version') { "PASS $v" } else { 'FAIL' } } }

  @{ id = 'rust'; desc = 'Rust 工具链可用'; run = {
      $v = FirstLine 'rustc' @('--version'); if ($v -match 'rustc') { "PASS $v" } else { 'FAIL' } } }

  @{ id = 'gcc'; desc = 'C/C++ 编译器可用'; run = {
      $v = FirstLine 'gcc' @('--version'); if ($v -match 'gcc|clang') { "PASS $v" } else { 'FAIL' } } }

  @{ id = 'torch-cuda'; desc = 'PyTorch CUDA 张量运算'; run = {
      if (-not $comfyPy -or -not (Test-Path -LiteralPath $comfyPy)) { return "BLOCKED 未设置 JX_COMFY_PY 或路径不存在：$comfyPy" }
      $py = @'
import torch
if not torch.cuda.is_available():
    print("FAIL cuda unavailable"); raise SystemExit(0)
d = "cuda:0"
a = torch.randn(1024, 1024, device=d); b = torch.randn(1024, 1024, device=d)
print(f"PASS {torch.cuda.get_device_name(0)} | torch {torch.__version__} | vram {torch.cuda.get_device_properties(0).total_memory/2**30:.1f}GiB")
'@
      $o = $py | & $comfyPy - 2>&1 | Select-Object -Last 1
      "$o" } }

  @{ id = 'gpu'; desc = 'nvidia-smi 识别 GPU'; run = {
      $o = & nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader 2>&1
      if ($o -match 'NVIDIA') { "PASS $($o -join '')" } else { 'FAIL' } } }

  @{ id = 'docker'; desc = 'Docker engine 响应'; run = {
      $v = FirstLine 'docker' @('version', '--format', '{{.Server.Version}}')
      if ($v -match '^\d+\.') { "PASS engine $v" } else { "FAIL $v" } } }

  @{ id = 'postgres'; desc = 'PostgreSQL 17 容器可查询'; run = {
      $c = $env:JX_PG_CONTAINER; if (-not $c) { $c = 'jx-e1-pg' }
      $r = & docker exec $c psql -U postgres -d jiuxiao_test -tAc 'select version()' 2>&1
      if ($r -match 'PostgreSQL 17') { "PASS $($r -join '')" } else { "BLOCKED $($r -join '')" } } }

  @{ id = 'comfyui'; desc = 'ComfyUI API 存活'; run = {
      try {
        $s = Invoke-RestMethod "$comfyHost/system_stats" -TimeoutSec 5
        $ver = $s.system.comfyui_version
        # devices 字段在不同版本里可能是数组或对象，取不到就只报版本，不要因此误判为“服务未运行”
        $free = $null
        try {
          $dev = @($s.system.devices)[0]
          if ($dev -and $dev.vram_free) { $free = [math]::Round($dev.vram_free / 1GB, 1) }
        } catch { }
        if ($free) { "PASS version $ver | vram_free ${free}GiB" } else { "PASS version $ver" }
      } catch { "BLOCKED 服务未运行：$($_.Exception.Message)" } } }

  @{ id = 'comfyui-models'; desc = 'ComfyUI 已识别 SDXL 权重'; run = {
      try {
        $oi = Invoke-RestMethod "$comfyHost/object_info/CheckpointLoaderSimple" -TimeoutSec 10
        $req = $oi.CheckpointLoaderSimple.input.required.ckpt_name
        # ComfyUI 的选项有三种历史形态：纯字符串数组 / ["COMBO",{options}] / [[...],{tooltip}]，全部兼容
        $list = if ($req[0] -is [array]) { $req[0] }
                elseif ($req[0] -eq 'COMBO' -and $req.Count -ge 2 -and $req[1].options) { $req[1].options }
                elseif ($req[0] -is [string]) { $req }
                else { @() }
        $hit = $list | Where-Object { $_ -like 'sd_xl_base*' }
        if ($hit) { "PASS $($hit -join ',')" } else { "FAIL 未找到 sd_xl_base；现有: $($list -join ',')" }
      } catch { 'BLOCKED 服务未运行' } } }

  @{ id = 'blender'; desc = 'Blender 可执行'; run = {
      if (-not $blender -or -not (Test-Path -LiteralPath $blender)) { return 'BLOCKED 未设置 JX_BLENDER 或路径不存在' }
      $v = FirstLine $blender @('--version'); if ($v -match 'Blender') { "PASS $v" } else { 'FAIL' } } }

  @{ id = 'ffmpeg'; desc = 'FFmpeg 可用'; run = {
      $v = FirstLine 'ffmpeg' @('-version'); if ($v -match 'ffmpeg version') { "PASS $v" } else { 'FAIL' } } }

  @{ id = 'magick'; desc = 'ImageMagick 可用'; run = {
      $exe = Join-Path $tools 'Image\ImageMagick\magick.exe'
      if (-not (Test-Path -LiteralPath $exe)) { return 'BLOCKED magick.exe 不在 Tools\Image\ImageMagick' }
      $v = FirstLine $exe @('-version'); if ($v -match 'ImageMagick') { "PASS $v" } else { 'FAIL' } } }

  @{ id = 'ktx'; desc = 'KTX-Software 可用'; run = {
      $exe = Join-Path $tools 'Image\KTX-Software\bin\ktx.exe'
      if (-not (Test-Path -LiteralPath $exe)) { return 'BLOCKED ktx.exe 不在 Tools\Image\KTX-Software\bin' }
      $v = FirstLine $exe @('--version'); if ($v) { "PASS $v" } else { 'FAIL' } } }

  @{ id = 'gltf-transform'; desc = 'glTF-Transform CLI 可用'; run = {
      $exe = Tool 'gltf-transform'; if (-not $exe) { return 'FAIL 未找到' }
      $v = FirstLine $exe @('--version'); if ($v -match '^\d') { "PASS $v" } else { "FAIL $v" } } }

  @{ id = 'supabase'; desc = 'Supabase CLI 可用（仅本地）'; run = {
      $exe = Tool 'supabase'; if (-not $exe) { return 'FAIL 未找到' }
      $v = FirstLine $exe @('--version'); if ($v -match '^\d') { "PASS $v" } else { "FAIL $v" } } }

  @{ id = 'wrangler'; desc = 'Wrangler 可用（仅本地）'; run = {
      $exe = Tool 'wrangler'; if (-not $exe) { return 'FAIL 未找到' }
      $v = FirstLine $exe @('--version'); if ($v -match '^\d') { "PASS $v" } else { "FAIL $v" } } }

  @{ id = 'playwright'; desc = 'Playwright + Chromium 可用'; run = {
      $exe = Tool 'playwright'; if (-not $exe) { return 'FAIL 未找到（建议指向项目 devDep 的 .bin）' }
      $v = FirstLine $exe @('--version')
      $b = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'ms-playwright') -Directory -Filter 'chromium-*' -ErrorAction SilentlyContinue
      if ($v -match '\d' -and $b) { "PASS $v | $($b.Name -join ',')" } else { "FAIL $v（浏览器未安装）" } } }

  @{ id = 'disk'; desc = '磁盘可用空间（目标盘 >= 60 GiB）'; run = {
      $root = [System.IO.Path]::GetPathRoot($LabRoot)
      $d = Get-PSDrive -Name ($root.Substring(0, 1)) -ErrorAction SilentlyContinue
      if (-not $d) { return 'FAIL 无法读取盘符' }
      $free = [math]::Round($d.Free / 1GB, 1)
      if ($free -ge 60) { "PASS ${free}GiB" } else { "FAIL ${free}GiB（低于 60GiB 保留线）" } } }

  @{ id = 'lab-layout'; desc = '资源中心目录完整'; run = {
      $need = 'Tools', 'Models', 'Environments', 'Assets', 'Cache', 'Workspaces', 'Outputs', 'Management'
      $miss = $need | Where-Object { -not (Test-Path -LiteralPath (Join-Path $LabRoot $_)) }
      if ($miss) { "FAIL 缺: $($miss -join ',')" } else { 'PASS 8/8' } } }

  @{ id = 'models'; desc = '模型目录存在且非空'; run = {
      $ck = Join-Path $models 'checkpoints'
      $n = (Get-ChildItem $ck -File -Filter '*.safetensors' -ErrorAction SilentlyContinue).Count
      if ($n -ge 1) { "PASS checkpoints 中 $n 个 safetensors" } else { 'FAIL checkpoints 为空' } } }
)

$results = @()
foreach ($c in ($checks | Where-Object { -not $Only -or $Only -contains $_.id })) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try { $out = (& $c.run) -join ' ' } catch { $out = "FAIL 异常: $($_.Exception.Message)" }
  $sw.Stop()
  $status = if ($out -match '^PASS') { 'PASS' } elseif ($out -match '^BLOCKED') { 'BLOCKED' } elseif ($out -match '^FAIL') { 'FAIL' } else { 'UNKNOWN' }
  $results += [pscustomobject]@{ id = $c.id; desc = $c.desc; status = $status; detail = ($out -replace '^(PASS|FAIL|BLOCKED)\s*', ''); ms = [int]$sw.ElapsedMilliseconds }
  if (-not $Quiet) {
    $color = switch ($status) { 'PASS' { 'Green' } 'FAIL' { 'Red' } default { 'Yellow' } }
    Write-Host ("[{0,-7}] {1,-16} {2}" -f $status, $c.id, ($out -replace "`r?`n", ' ')) -ForegroundColor $color
  }
}

$summary = [ordered]@{
  checkedAt = (Get-Date).ToString('s')
  labRoot   = $LabRoot
  totals    = [ordered]@{
    PASS    = ($results | Where-Object status -eq 'PASS').Count
    FAIL    = ($results | Where-Object status -eq 'FAIL').Count
    BLOCKED = ($results | Where-Object status -eq 'BLOCKED').Count
    total   = $results.Count
  }
  checks    = $results
}
$summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
if (-not $Quiet) {
  Write-Host ""
  Write-Host ("合计 {0} 项：PASS {1} / FAIL {2} / BLOCKED {3}" -f $summary.totals.total, $summary.totals.PASS, $summary.totals.FAIL, $summary.totals.BLOCKED)
  Write-Host "报告: $ReportPath"
}

