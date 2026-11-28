# test-verify-negative.ps1 —— 自检脚本的“负例测试”：证明坏环境确实会被发现
#
# 场景：
#   N1 版本错误（node 报 v22）                → node FAIL，退出码 1
#   N2 可疑模型（checkpoints 只有 4KB 文件）   → models FAIL
#   N3 未配置 GPU Python                      → python BLOCKED
#   N4 Full 模式缺 ImageMagick                → magick BLOCKED
#   N5 只有必需项 BLOCKED、无 FAIL             → Strict 退出码 2
#   P1 真实资源中心 Quick                     → 全 PASS，退出码 0
#
# 用法：.\test-verify-negative.ps1 -LabRoot <LAB_ROOT>
param([Parameter(Mandatory = $true)][string]$LabRoot)

$ErrorActionPreference = 'Continue'
$origComfyPy = $env:JX_COMFY_PY
$origComfyRoot = $env:JX_COMFY_ROOT
$verify = Join-Path $LabRoot 'Management\Scripts\verify-environment.ps1'
$pwsh = (Get-Process -Id $PID).Path
$failures = @()
$tmpBase = Join-Path $LabRoot 'Cache\neg'
New-Item -ItemType Directory -Force -Path $tmpBase | Out-Null

function Invoke-Verify([string]$root, [string]$mode, [switch]$strict) {
  $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $verify, '-LabRoot', $root, '-Mode', $mode, '-Quiet')
  if ($strict) { $a += '-Strict' }
  $rep = Join-Path $root "Management\Reports\neg-$mode$(if($strict){'-strict'}).json"
  $a += @('-ReportPath', $rep)
  & $pwsh @a | Out-Null
  $code = $LASTEXITCODE
  $json = if (Test-Path $rep) { Get-Content $rep -Raw | ConvertFrom-Json } else { $null }
  return [pscustomobject]@{ code = $code; report = $json }
}

function Check([string]$name, $cond, [string]$detail) {
  if ($cond) { Write-Host "[PASS] $name" -ForegroundColor Green }
  else { Write-Host "[FAIL] $name :: $detail" -ForegroundColor Red; $script:failures += $name }
}

function New-FakeLab([string]$root) {
  $dirs = 'Tools\Node','Tools\Image\ImageMagick','Models\checkpoints','Environments','Assets','Cache','Workspaces','Outputs','Management\Reports','Management\Scripts'
  foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path (Join-Path $root $d) | Out-Null }
}

function State($report, [string]$id) {
  if (-not $report) { return 'NO_REPORT' }
  $c = $report.checks | Where-Object { $_.id -eq $id }
  if (-not $c) { return 'NOT_CHECKED' }
  return $c.status
}

function FailIds($report) {
  if (-not $report) { return 'NO_REPORT' }
  return (($report.checks | Where-Object { $_.status -eq 'FAIL' } | ForEach-Object { $_.id + '=' + $_.detail }) -join '; ')
}

# ---------- N1/N2/N3：故意坏掉的 node + 4KB 模型 + 无 GPU Python ----------
$tmp1 = Join-Path $tmpBase ("neg1-" + [guid]::NewGuid().ToString('N').Substring(0, 6))
New-FakeLab $tmp1
Set-Content -LiteralPath (Join-Path $tmp1 'Tools\Node\node.cmd') -Value '@echo v22.1.0' -Encoding ASCII
Set-Content -LiteralPath (Join-Path $tmp1 'Tools\Node\pnpm.cmd') -Value '@echo 11.19.0' -Encoding ASCII
Set-Content -LiteralPath (Join-Path $tmp1 'Tools\Node\git.cmd') -Value '@echo git version 2.0.0' -Encoding ASCII
[IO.File]::WriteAllBytes((Join-Path $tmp1 'Models\checkpoints\fake.safetensors'), (New-Object byte[] 4096))

Write-Host "`n===== N1/N2/N3 =====" -ForegroundColor Cyan
$env:JX_COMFY_PY = ''
$env:JX_COMFY_ROOT = ''
$r1 = Invoke-Verify $tmp1 'Quick' -strict
Check 'N1 node 版本错误被发现' ((State $r1.report 'node') -eq 'FAIL') "node=$(State $r1.report 'node')"
Check 'N2 可疑模型被发现' ((State $r1.report 'models') -eq 'FAIL') "models=$(State $r1.report 'models')"
Check 'N3 未配置 GPU Python 被标 BLOCKED' ((State $r1.report 'python') -eq 'BLOCKED') "python=$(State $r1.report 'python')"
Check '存在 FAIL 时退出码为 1' ($r1.code -eq 1) "code=$($r1.code)"

# ---------- N4：Full 模式缺 ImageMagick ----------
$tmp2 = Join-Path $tmpBase ("neg2-" + [guid]::NewGuid().ToString('N').Substring(0, 6))
New-FakeLab $tmp2
Remove-Item (Join-Path $tmp2 'Tools\Image\ImageMagick') -Force -Recurse
Write-Host "`n===== N4（Full，缺 magick） =====" -ForegroundColor Cyan
$r2 = Invoke-Verify $tmp2 'Full' -strict
Check 'N4 magick 被标 BLOCKED' ((State $r2.report 'magick') -eq 'BLOCKED') "magick=$(State $r2.report 'magick')"
Check 'N4 退出码非零' ($r2.code -ne 0) "code=$($r2.code)"

# ---------- N5：只有必需项 BLOCKED、无任何 FAIL → Strict 退出码 2 ----------
$tmp3 = Join-Path $tmpBase ("neg3-" + [guid]::NewGuid().ToString('N').Substring(0, 6))
New-FakeLab $tmp3
Set-Content -LiteralPath (Join-Path $tmp3 'Tools\Node\node.cmd') -Value '@echo v24.16.0' -Encoding ASCII
Set-Content -LiteralPath (Join-Path $tmp3 'Tools\Node\pnpm.cmd') -Value '@echo 11.19.0' -Encoding ASCII
Set-Content -LiteralPath (Join-Path $tmp3 'Tools\Node\git.cmd') -Value '@echo git version 2.0.0' -Encoding ASCII
$fs = [IO.File]::Open((Join-Path $tmp3 'Models\checkpoints\big.safetensors'), 'Create')
$fs.SetLength(1100MB); $fs.Close()

Write-Host "`n===== N5（仅 BLOCKED、无 FAIL） =====" -ForegroundColor Cyan
$env:JX_COMFY_PY = ''
$r3 = Invoke-Verify $tmp3 'Quick' -strict
Check 'N5 无 FAIL' ($r3.report.totals.FAIL -eq 0) (FailIds $r3.report)
Check 'N5 python BLOCKED' ((State $r3.report 'python') -eq 'BLOCKED') "python=$(State $r3.report 'python')"
Check 'N5 Strict 退出码=2' ($r3.code -eq 2) "code=$($r3.code)"

# ---------- P1：真实环境正例 ----------
Write-Host "`n===== P1（真实资源中心 Quick） =====" -ForegroundColor Cyan
$env:PATH = (Split-Path (Get-Command node).Source) + ';' + (Join-Path $LabRoot 'Tools\Node') + ';' + $env:PATH
$env:JX_COMFY_PY = if ($origComfyPy) { $origComfyPy } elseif ($origComfyRoot) { Join-Path $origComfyRoot '.venv\Scripts\python.exe' } else { '' }
$r4 = Invoke-Verify $LabRoot 'Quick' -strict
Check 'P1 退出码=0' ($r4.code -eq 0) "code=$($r4.code)，FAIL=$($r4.report.totals.FAIL)，BLOCKED=$($r4.report.totals.BLOCKED)"

foreach ($t in $tmp1, $tmp2, $tmp3) { Remove-Item $t -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host ""
if ($failures.Count -eq 0) { Write-Host "全部负例/正例测试通过" -ForegroundColor Green; exit 0 }
else { Write-Host "失败项: $($failures -join ', ')" -ForegroundColor Red; exit 1 }
