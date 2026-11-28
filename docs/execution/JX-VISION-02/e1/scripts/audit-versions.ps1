# audit-versions.ps1 —— 已装软件/工具的最新稳定版复核（不自动升级，只出结论）
# 用法：先 dot-source environment.ps1，或设置 JX_LAB_ROOT / JX_COMFY_ROOT。
param([string]$Out)
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$UA = @{ 'User-Agent' = 'jx-lab-audit/1.0' }

$LabRoot = $env:JX_LAB_ROOT
$ComfyRoot = $env:JX_COMFY_ROOT
$ComfyPy = $env:JX_COMFY_PY
if (-not $ComfyPy -and $ComfyRoot) { $ComfyPy = Join-Path $ComfyRoot '.venv\Scripts\python.exe' }
if (-not $Out) {
  $Out = if ($LabRoot) { Join-Path $LabRoot 'Management\Reports\version-audit.json' } else { Join-Path (Get-Location) 'version-audit.json' }
}

function J($url) { try { return Invoke-RestMethod -Uri $url -Headers $UA -TimeoutSec 25 } catch { return $null } }
function Row($name, $installed, $latest, $note = '') {
  $s = if (-not $latest) { 'UNKNOWN' } elseif ($installed -and $installed.ToString().Contains($latest)) { 'CURRENT' } else { 'CHECK' }
  [pscustomobject]@{ name = $name; installed = $installed; latest = $latest; status = $s; note = $note }
}
function Find-Exe([string]$name) {
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  return $null
}

$rows = @()

# --- Node / pnpm / npm 生态 ---
$nodeInst = (& node -v) 2>$null
$nodeIdx = J 'https://nodejs.org/dist/index.json'
$nodeLatest = if ($nodeIdx) { ($nodeIdx | Where-Object { $_.lts } | Select-Object -First 1).version } else { $null }
$rows += Row 'Node.js' $nodeInst $nodeLatest
foreach ($p in @('pnpm', 'wrangler', 'gltf-transform', 'axe-core', 'lighthouse', 'pixelmatch')) {
  $inst = switch ($p) {
    'pnpm' { (& pnpm -v) 2>$null }
    'wrangler' { (& wrangler --version) 2>$null }
    'gltf-transform' { (& gltf-transform --version) 2>$null }
    default { $null }
  }
  $j = J ("https://registry.npmjs.org/{0}/latest" -f $p)
  $rows += Row $p $inst ($j.version) 'npm registry latest'
}

# --- Python / torch / ComfyUI ---
$pyInst = if ($ComfyPy -and (Test-Path -LiteralPath $ComfyPy)) { (& $ComfyPy -V) 2>$null } else { $null }
$pyEol = J 'https://endoflife.date/api/python.json'
$pyLatest = if ($pyEol) { if ($pyEol[0].latest) { $pyEol[0].latest } else { $pyEol[0].cycle } } else { $null }
$rows += Row 'Python (ComfyUI venv)' $pyInst $pyLatest
$torchInst = if ($ComfyPy -and (Test-Path -LiteralPath $ComfyPy)) { (& $ComfyPy -c "import torch;print(torch.__version__)") 2>$null } else { $null }
$torchPy = J 'https://pypi.org/pypi/torch/json'
$rows += Row 'PyTorch' $torchInst ($torchPy.info.version) 'PyPI latest（CUDA 轮子版本可能不同）'
$comfyUrl = if ($env:JX_COMFY_URL) { $env:JX_COMFY_URL.TrimEnd('/') } else { 'http://127.0.0.1:8188' }
$comfy = J "$comfyUrl/system_stats"
$comfyInst = if ($comfy) { $comfy.system.comfyui_version } else { $null }
$comfyRel = J 'https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest'
$rows += Row 'ComfyUI' $comfyInst ($comfyRel.tag_name) 'core 版本，非前端'

# --- 图形/媒体工具 ---
$blendExe = $env:JX_BLENDER
if (-not $blendExe) { $blendExe = Find-Exe 'blender' }
$blendInst = if ($blendExe) { ((& $blendExe -b --version) 2>&1 | Select-String 'Blender' | Select-Object -First 1) } else { $null }
$rows += Row 'Blender' ($blendInst -replace '\s+', ' ').Trim() '5.3.0 / 5.2.5' '稳定版 + LTS 双版本并存'
$ffInst = ((& ffmpeg -version) 2>$null | Select-Object -First 1)
$ffLatest = (J 'https://www.gyan.dev/ffmpeg/builds/release-version').ToString().Trim()
$rows += Row 'FFmpeg (gyan)' $ffInst $ffLatest

$imExe = Find-Exe 'magick'
$imInst = if ($imExe) { ((& $imExe -version) 2>$null | Select-Object -First 1) } else { $null }
$imRel = J 'https://api.github.com/repos/ImageMagick/ImageMagick/releases/latest'
$rows += Row 'ImageMagick' $imInst $imRel.tag_name

$ktxExe = Find-Exe 'ktx'
$ktxInst = if ($ktxExe) { ((& $ktxExe --version) 2>$null | Select-Object -First 1) } else { $null }
$ktxRel = J 'https://api.github.com/repos/KhronosGroup/KTX-Software/releases/latest'
$rows += Row 'KTX-Software' $ktxInst $ktxRel.tag_name

$rdExe = Find-Exe 'renderdoccmd'
$rdInst = if ($rdExe) { ((& $rdExe version) 2>$null | Select-String 'v1\.' | Select-Object -First 1) } else { $null }
$rdRel = J 'https://api.github.com/repos/baldurk/renderdoc/releases/latest'
$rows += Row 'RenderDoc' $rdInst $rdRel.tag_name

$godotExe = Find-Exe 'godot'
$godotInst = if ($godotExe) { ((& $godotExe --version) 2>$null) } else { $null }
$godotRel = J 'https://api.github.com/repos/godotengine/godot/releases/latest'
$rows += Row 'Godot' $godotInst $godotRel.tag_name
$glInst = ((& gitleaks version) 2>$null)
$glRel = J 'https://api.github.com/repos/gitleaks/gitleaks/releases/latest'
$rows += Row 'gitleaks' $glInst $glRel.tag_name
$sbInst = ((& supabase --version) 2>$null)
$sbRel = J 'https://api.github.com/repos/supabase/cli/releases/latest'
$rows += Row 'Supabase CLI' $sbInst $sbRel.tag_name
$a2Inst = ((& aria2c --version) 2>$null | Select-Object -First 1)
$a2Rel = J 'https://api.github.com/repos/aria2/aria2/releases/latest'
$rows += Row 'aria2' $a2Inst $a2Rel.tag_name
$gitInst = ((& git --version) 2>$null)
$gitRel = J 'https://api.github.com/repos/git-for-windows/git/releases/latest'
$rows += Row 'Git for Windows' $gitInst $gitRel.tag_name
$ghInst = ((& gh --version) 2>$null | Select-Object -First 1)
$ghRel = J 'https://api.github.com/repos/cli/cli/releases/latest'
$rows += Row 'GitHub CLI' $ghInst $ghRel.tag_name
$rows += Row 'Docker' ((& docker --version) 2>$null) '见 Docker Desktop 更新通道' 'Docker Desktop 自动更新'
$rows += Row 'PostgreSQL (容器)' '17' '17.x' '主版本跟随 supabase 镜像'
$rows += Row 'WSL2 Ubuntu' 'Ubuntu 24.04 LTS' '24.04 LTS' 'LTS 通道，无需跳版'

$rows | Format-Table -AutoSize
$json = [pscustomobject]@{ generated = (Get-Date).ToString('s'); rows = $rows }
New-Item -ItemType Directory -Force -Path (Split-Path $Out) | Out-Null
$json | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $Out -Encoding UTF8
"report: $Out"
