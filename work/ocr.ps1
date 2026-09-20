Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null=[Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null=[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function AwaitResult($op,$type) { $task=$asTask.MakeGenericMethod($type).Invoke($null,@($op)); $task.Wait(); $task.Result }
$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$root='C:\Users\11954\Desktop\chatgpt\九霄剧情卡\设定卡'
$target=Join-Path $PSScriptRoot 'ocr'
New-Item -ItemType Directory -Path $target -Force | Out-Null
$seen=@{}
$index=@()
foreach($entry in Get-ChildItem -LiteralPath $root -File) {
 $hash=(Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash
 if($seen.ContainsKey($hash)) { $index += [pscustomobject]@{file=$entry.Name; duplicate=$seen[$hash]}; continue }
 $seen[$hash]=$entry.Name
 $dest=Join-Path $target ($entry.BaseName+'.txt')
 if(!(Test-Path -LiteralPath $dest)) {
  $file=AwaitResult ([Windows.Storage.StorageFile]::GetFileFromPathAsync($entry.FullName)) ([Windows.Storage.StorageFile])
  $stream=AwaitResult ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder=AwaitResult ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap=AwaitResult ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result=AwaitResult ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  ($result.Lines | ForEach-Object {$_.Text}) | Set-Content -LiteralPath $dest -Encoding UTF8
  $bitmap.Dispose(); $stream.Dispose()
 }
 $index += [pscustomobject]@{file=$entry.Name; duplicate=$null}
}
$index | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target 'index.json') -Encoding UTF8
Write-Output ('Unique images: '+$seen.Count)
