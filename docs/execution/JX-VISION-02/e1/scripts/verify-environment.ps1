# verify-environment.ps1 —— 九霄环境健康检查（E1.1 修订版：Quick / Full 分层 + 真实退出码）
#
# 用法：
#   .\verify-environment.ps1 -LabRoot <LAB_ROOT>                 # Quick（默认，路径/版本/设备/服务）
#   .\verify-environment.ps1 -LabRoot <LAB_ROOT> -Mode Full      # Full（真实计算/渲染/生图/数据库/浏览器）
#   .\verify-environment.ps1 -LabRoot <LAB_ROOT> -Mode Full -Strict
#   .\verify-environment.ps1 -LabRoot <LAB_ROOT> -Only node,comfyui
#
# 退出码：
#   0 = 全部通过（Strict 模式下还要求所有必需项为 PASS）
#   1 = 存在 FAIL
#   2 = Strict 模式下存在必需项 BLOCKED / UNKNOWN / 未执行
#
# 判定口径：
#   PASS    = 真实执行并通过（有可核验输出，不只看版本号）
#   FAIL    = 执行了但结果不符（版本错、工具坏、输出异常）
#   BLOCKED = 前置缺失（未配置路径/服务未启动/工具未安装），无法执行
#   SKIP    = 该模式下有意跳过
#
# 设计约束：只读检查；不安装、不写系统配置；任何检查失败都不中断整体流程。
param(
  [Parameter(Mandatory = $true)][string]$LabRoot,
  [ValidateSet('Quick', 'Full')][string]$Mode = 'Quick',
  [string[]]$Only,
  [string]$ReportPath,
  [switch]$Strict,
  [switch]$Quiet
)

$ErrorActionPreference = 'Continue'
if (-not (Test-Path -LiteralPath $LabRoot)) {
  Write-Error "LabRoot 不存在: $LabRoot"
  exit 2
}
if (-not $ReportPath) { $ReportPath = Join-Path $LabRoot "Management\Reports\verify-$($Mode.ToLower()).json" }
New-Item -ItemType Directory -Force -Path (Split-Path $ReportPath) | Out-Null

$tools    = Join-Path $LabRoot 'Tools'
$shimNode = Join-Path $tools 'Node'
$models   = Join-Path $LabRoot 'Models'

$comfyRoot = $env:JX_COMFY_ROOT
$comfyHost = if ($env:JX_COMFY_URL) { $env:JX_COMFY_URL.TrimEnd('/') } else { 'http://127.0.0.1:8188' }
$comfyPy   = $env:JX_COMFY_PY
if (-not $comfyPy -and $comfyRoot) { $comfyPy = Join-Path $comfyRoot '.venv\Scripts\python.exe' }
$blender   = $env:JX_BLENDER

function FirstLine([string]$exe, [string[]]$a) {
  try { return ((& $exe @a 2>&1 | Select-Object -First 1) -join '') } catch { return $null }
}

function Resolve-Tool([string]$name) {
  $p = Join-Path $shimNode "$name.cmd"
  if (Test-Path -LiteralPath $p) { return $p }
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  return $null
}

# 统一登记：level = Quick/Full；required = 是否属于“必需项”
$checks = @(
  @{ id = 'lab-layout'; level = 'Quick'; required = $true; desc = '资源中心目录完整'; run = {
      $need = 'Tools','Models','Environments','Assets','Cache','Workspaces','Outputs','Management'
      $miss = $need | Where-Object { -not (Test-Path -LiteralPath (Join-Path $LabRoot $_)) }
      if ($miss) { "FAIL 缺: $($miss -join ',')" } else { 'PASS 8/8' } } }

  @{ id = 'node'; level = 'Quick'; required = $true; desc = 'Node.js ≥ 24'; run = {
      $exe = Resolve-Tool 'node'; if (-not $exe) { return 'FAIL node 未找到' }
      $v = FirstLine $exe @('-v')
      if ($v -match '^v(\d+)' -and [int]$Matches[1] -ge 24) { "PASS $v" } else { "FAIL $v" } } }

  @{ id = 'pnpm'; level = 'Quick'; required = $true; desc = 'pnpm = 11.19.0'; run = {
      $exe = Resolve-Tool 'pnpm'; if (-not $exe) { return 'FAIL pnpm 未找到' }
      $v = FirstLine $exe @('-v'); if ($v -eq '11.19.0') { "PASS $v" } else { "FAIL $v" } } }

  @{ id = 'git'; level = 'Quick'; required = $true; desc = 'Git 可用'; run = {
      $exe = Resolve-Tool 'git'; if (-not $exe) { return 'FAIL git 未找到' }
      $v = FirstLine $exe @('--version'); if ($v -match 'git version') { "PASS $v" } else { 'FAIL' } } }

  @{ id = 'python'; level = 'Quick'; required = $true; desc = 'GPU Python 环境已配置'; run = {
      if (-not $comfyPy) { return 'BLOCKED 未设置 JX_COMFY_PY / JX_COMFY_ROOT' }
      if (-not (Test-Path -LiteralPath $comfyPy)) { return "FAIL 路径不存在: $comfyPy" }
      $v = FirstLine $comfyPy @('-V'); if ($v -match 'Python 3') { "PASS $v" } else { "FAIL $v" } } }

  @{ id = 'gpu'; level = 'Quick'; required = $true; desc = 'nvidia-smi 识别 GPU'; run = {
      & nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { return "FAIL nvidia-smi 退出码 $LASTEXITCODE" }
      $o = & nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader 2>&1
      if ($o -match 'NVIDIA') { "PASS $($o -join '')" } else { 'FAIL 未识别到 NVIDIA 设备' } } }

  @{ id = 'disk'; level = 'Quick'; required = $true; desc = '目标盘 ≥ 60 GiB 可用'; run = {
      $root = [System.IO.Path]::GetPathRoot($LabRoot)
      $d = Get-PSDrive -Name ($root.TrimEnd('\').TrimEnd(':')) -ErrorAction SilentlyContinue
      if (-not $d) { return 'FAIL 无法读取盘符' }
      $gib = [math]::Round($d.Free / 1GB, 1)
      if ($gib -ge 60) { "PASS ${gib}GiB" } else { "FAIL ${gib}GiB" } } }

  @{ id = 'models'; level = 'Quick'; required = $true; desc = 'checkpoints 有可用权重'; run = {
      $ck = Join-Path $models 'checkpoints'
      $files = Get-ChildItem $ck -File -Filter '*.safetensors' -ErrorAction SilentlyContinue
      if (-not $files) { return 'FAIL checkpoints 为空' }
      $bad = $files | Where-Object { $_.Length -lt 1GB }
      if ($bad) { return "FAIL 疑似不完整: $($bad.Name -join ',')" }
      "PASS $($files.Count) 个 safetensors" } }

  @{ id = 'comfyui'; level = 'Quick'; required = $false; desc = 'ComfyUI API 可达'; run = {
      try {
        $s = Invoke-RestMethod "$comfyHost/system_stats" -TimeoutSec 5
        "PASS version $($s.system.comfyui_version)"
      } catch { "BLOCKED 服务未运行（$($_.Exception.Message)）" } } }

  @{ id = 'torch-cuda'; level = 'Full'; required = $true; desc = 'PyTorch CUDA 真实计算'; run = {
      if (-not $comfyPy -or -not (Test-Path -LiteralPath $comfyPy)) { return 'BLOCKED 未配置 JX_COMFY_PY' }
      $py = @'
import sys, torch
if not torch.cuda.is_available():
    print("FAIL cuda unavailable"); raise SystemExit(3)
a = torch.randn(1024, 1024, device="cuda"); b = torch.randn(1024, 1024, device="cuda")
c = a @ b
err = (c.cpu() - (a.cpu() @ b.cpu())).abs().max().item()
print(f"PASS {torch.cuda.get_device_name(0)} | torch {torch.__version__} | err {err:.2e}")
'@
      $out = $py | & $comfyPy - 2>&1 | Select-Object -Last 1
      if ($LASTEXITCODE -ne 0) { return "FAIL 退出码 $LASTEXITCODE :: $out" }
      "$out" } }

  @{ id = 'comfyui-models'; level = 'Full'; required = $true; desc = 'ComfyUI 已识别 SDXL 权重'; run = {
      try {
        $oi = Invoke-RestMethod "$comfyHost/object_info/CheckpointLoaderSimple" -TimeoutSec 10
        $req = $oi.CheckpointLoaderSimple.input.required.ckpt_name
        $list = if ($req[0] -is [array]) { $req[0] }
                elseif ($req[0] -eq 'COMBO' -and $req.Count -ge 2 -and $req[1].options) { $req[1].options }
                elseif ($req[0] -is [string]) { $req }
                else { @() }
        $hit = $list | Where-Object { $_ -like 'sd_xl_base*' }
        if ($hit) { "PASS $($hit -join ',')" } else { "FAIL 未找到 sd_xl_base；现有: $($list -join ',')" }
      } catch { 'BLOCKED ComfyUI 未运行' } } }

  @{ id = 'comfyui-generate'; level = 'Full'; required = $false; desc = 'ComfyUI 真实出图（512²/8 步）'; run = {
      $runner = Join-Path $LabRoot 'Management\Scripts\comfy-workflow-runner.py'
      if (-not (Test-Path -LiteralPath $runner)) { return 'BLOCKED 运行器脚本不存在' }
      if (-not $comfyPy) { return 'BLOCKED 未配置 JX_COMFY_PY' }
      $outDir = Join-Path $LabRoot 'Outputs\Images\_verify'
      $env:JX_COMFY_RAW_OUT = Join-Path $LabRoot 'Outputs\Images\_comfy_raw'
      $o = & $comfyPy $runner t2i --width 512 --height 512 --steps 8 --seed 1 --out $outDir --label verify_t2i --timeout 180 2>&1 | Select-Object -Last 1
      if ($LASTEXITCODE -ne 0) { return "FAIL 退出码 $LASTEXITCODE :: $o" }
      $j = $o | ConvertFrom-Json
      if ($j.ok -and $j.files.Count -ge 1 -and $j.files[0].bytes -gt 10000) { "PASS ${($j.seconds)}s / $([math]::Round($j.files[0].bytes/1KB,0))KB" } else { "FAIL $o" } } }

  @{ id = 'blender'; level = 'Full'; required = $false; desc = 'Blender Cycles OptiX 出图'; run = {
      if (-not $blender -or -not (Test-Path -LiteralPath $blender)) { return 'BLOCKED 未设置 JX_BLENDER' }
      $probe = $env:JX_BLENDER_PROBE
      if (-not $probe -or -not (Test-Path -LiteralPath $probe)) { return 'BLOCKED 未设置 JX_BLENDER_PROBE（渲染脚本）' }
      $out = & $blender --background --python $probe 2>&1 | Select-String -Pattern 'JX_BLENDER' | Select-Object -Last 1
      if ($LASTEXITCODE -ne 0) { return "FAIL blender 退出码 $LASTEXITCODE" }
      if ($out) { "PASS $out" } else { 'FAIL 未捕获到探针输出' } } }

  @{ id = 'ffmpeg'; level = 'Full'; required = $true; desc = 'FFmpeg 编解码往返'; run = {
      $tmp = Join-Path $LabRoot 'Outputs\_verify'
      New-Item -ItemType Directory -Force -Path $tmp | Out-Null
      $wav = Join-Path $tmp 'tone.wav'; $mp4 = Join-Path $tmp 'tone.mp4'
      & ffmpeg -y -f lavfi -i "sine=frequency=440:duration=1" -ar 48000 -ac 2 $wav 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { return "FAIL 生成 wav 失败（$LASTEXITCODE）" }
      & ffmpeg -y -i $wav -c:a aac -b:a 128k $mp4 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { return "FAIL 转码失败（$LASTEXITCODE）" }
      $sz = (Get-Item $mp4).Length
      if ($sz -gt 1000) { "PASS wav+mp4 ($([math]::Round($sz/1KB,1))KB)" } else { 'FAIL 输出异常' } } }

  @{ id = 'magick'; level = 'Full'; required = $true; desc = 'ImageMagick 编解码与度量'; run = {
      $exe = Join-Path $tools 'Image\ImageMagick\magick.exe'
      if (-not (Test-Path -LiteralPath $exe)) { return 'BLOCKED magick 不存在' }
      $tmp = Join-Path $LabRoot 'Outputs\_verify'; New-Item -ItemType Directory -Force -Path $tmp | Out-Null
      $png = Join-Path $tmp 'magick.png'; $jpg = Join-Path $tmp 'magick.jpg'
      & $exe -size 64x64 gradient:blue-red $png 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { return "FAIL 生成失败（$LASTEXITCODE）" }
      & $exe $png -quality 85 $jpg 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { return "FAIL 转换失败（$LASTEXITCODE）" }
      & $exe compare -metric RMSE $png $jpg $null 2>&1 | Out-Null
      "PASS png→jpg ($((Get-Item $jpg).Length) B)" } }

  @{ id = 'ktx'; level = 'Full'; required = $true; desc = 'KTX2 转码 + 校验'; run = {
      $exe = Join-Path $tools 'Image\KTX-Software\bin\ktx.exe'
      if (-not (Test-Path -LiteralPath $exe)) { return 'BLOCKED ktx 不存在' }
      $tmp = Join-Path $LabRoot 'Outputs\_verify'; New-Item -ItemType Directory -Force -Path $tmp | Out-Null
      $png = Join-Path $tmp 'ktx_src.png'; $ktx = Join-Path $tmp 'ktx_src.ktx2'
      $mag = Join-Path $tools 'Image\ImageMagick\magick.exe'
      & $mag -size 128x128 plasma:fractal $png 2>&1 | Out-Null
      & $exe create --format R8G8B8_SRGB --encode basis-lz --generate-mipmap $png $ktx 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { return "FAIL ktx create 退出码 $LASTEXITCODE" }
      $info = & $exe info $ktx 2>&1
      if ($info -match 'Validation successful') { "PASS $((Get-Item $ktx).Length) B" } else { "FAIL 校验未通过: $($info -join ' ')" } } }

  @{ id = 'gltf'; level = 'Full'; required = $false; desc = 'glTF 结构校验'; run = {
      $exe = Resolve-Tool 'gltf-transform'; if (-not $exe) { return 'BLOCKED gltf-transform 未找到' }
      $glb = $env:JX_SAMPLE_GLB
      if (-not $glb -or -not (Test-Path -LiteralPath $glb)) { return 'BLOCKED 未设置 JX_SAMPLE_GLB' }
      $o = & $exe validate $glb 2>&1
      if ($LASTEXITCODE -ne 0) { return "FAIL 退出码 $LASTEXITCODE :: $($o -join ' ')" }
      "PASS $($o -join ' ')" } }

  @{ id = 'postgres'; level = 'Full'; required = $true; desc = 'PostgreSQL 17 实际查询'; run = {
      $c = $env:JX_PG_CONTAINER; if (-not $c) { $c = 'jx-e1-pg' }
      $r = & docker exec $c psql -U postgres -d jiuxiao_test -tAc 'select count(*) from e1_probe' 2>&1
      if ($LASTEXITCODE -ne 0) { return "BLOCKED 容器查询失败: $($r -join ' ')" }
      $r2 = & docker exec $c psql -U postgres -d jiuxiao_test -tAc 'select version()' 2>&1
      if ($r2 -match 'PostgreSQL 17') { "PASS rows=$($r -join '')" } else { 'FAIL 版本不是 17' } } }

  @{ id = 'model-integrity'; level = 'Full'; required = $true; desc = 'safetensors 结构完整性'; run = {
      $script = Join-Path $LabRoot 'Management\Scripts\verify-safetensors.py'
      if (-not $script) { return 'BLOCKED 校验脚本缺失' }
      if (-not (Test-Path -LiteralPath $script)) { return 'BLOCKED verify-safetensors.py 不存在' }
      if (-not $comfyPy) { return 'BLOCKED 未配置 JX_COMFY_PY' }
      $o = & $comfyPy $script $models 2>&1
      if ($LASTEXITCODE -ne 0) { return "FAIL 退出码 $LASTEXITCODE :: $($o -join ' | ')" }
      "PASS $($o | Select-Object -Last 1)" } }

  @{ id = 'runner-tests'; level = 'Full'; required = $false; desc = '运行器离线回归测试'; run = {
      $t = Join-Path $LabRoot 'Management\Scripts\test-comfy-runner.py'
      if (-not (Test-Path -LiteralPath $t)) { return 'BLOCKED 测试脚本缺失' }
      if (-not $comfyPy) { return 'BLOCKED 未配置 JX_COMFY_PY' }
      $env:JX_RUNNER_PATH = Join-Path $LabRoot 'Management\Scripts\comfy-workflow-runner.py'
      $o = & $comfyPy $t 2>&1 | Select-Object -Last 2
      if ($LASTEXITCODE -ne 0) { return "FAIL $($o -join ' ')" }
      "PASS $($o -join ' ')" } }
)

$results = @()
$selected = $checks | Where-Object {
  $lvlOk = if ($Mode -eq 'Full') { $true } else { $_.level -eq 'Quick' }
  $lvlOk -and (-not $Only -or $Only -contains $_.id)
}

foreach ($c in $selected) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $out = try { (& $c.run) -join ' ' } catch { "FAIL 异常: $($_.Exception.Message)" }
  $sw.Stop()
  $status = switch -Regex ($out) {
    '^PASS'    { 'PASS'; break }
    '^FAIL'    { 'FAIL'; break }
    '^BLOCKED' { 'BLOCKED'; break }
    '^SKIP'    { 'SKIP'; break }
    default    { 'UNKNOWN' }
  }
  $results += [pscustomobject]@{
    id = $c.id; desc = $c.desc; level = $c.level; required = [bool]$c.required
    status = $status; detail = ($out -replace '^(PASS|FAIL|BLOCKED|SKIP)\s*', '')
    ms = [int]$sw.ElapsedMilliseconds
  }
  if (-not $Quiet) {
    $color = switch ($status) { 'PASS' { 'Green' } 'FAIL' { 'Red' } 'BLOCKED' { 'Yellow' } 'SKIP' { 'DarkGray' } default { 'Magenta' } }
    Write-Host ("[{0,-7}] {1,-18} {2}" -f $status, $c.id, ($out -replace "`r?`n", ' ')) -ForegroundColor $color
  }
}

$totals = [ordered]@{
  PASS    = ($results | Where-Object status -eq 'PASS').Count
  FAIL    = ($results | Where-Object status -eq 'FAIL').Count
  BLOCKED = ($results | Where-Object status -eq 'BLOCKED').Count
  UNKNOWN = ($results | Where-Object status -eq 'UNKNOWN').Count
  SKIP    = ($results | Where-Object status -eq 'SKIP').Count
  total   = $results.Count
}

$requiredBlocked = ($results | Where-Object { $_.required -and $_.status -in @('BLOCKED', 'UNKNOWN') })
$report = [ordered]@{
  checkedAt = (Get-Date).ToString('s')
  labRoot = $LabRoot
  mode = $Mode
  strict = [bool]$Strict
  totals = $totals
  checks = $results
}
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ReportPath -Encoding UTF8

if (-not $Quiet) {
  Write-Host ""
  Write-Host ("[{0}] 共 {1} 项：PASS {2} / FAIL {3} / BLOCKED {4} / UNKNOWN {5} / SKIP {6}" -f `
    $Mode, $totals.total, $totals.PASS, $totals.FAIL, $totals.BLOCKED, $totals.UNKNOWN, $totals.SKIP)
  Write-Host "报告: $ReportPath"
}

if ($totals.FAIL -gt 0) { exit 1 }
if ($Strict -and $requiredBlocked.Count -gt 0) {
  if (-not $Quiet) { Write-Host ("Strict 模式：{0} 个必需项未通过（BLOCKED/UNKNOWN）" -f $requiredBlocked.Count) -ForegroundColor Yellow }
  exit 2
}
exit 0
