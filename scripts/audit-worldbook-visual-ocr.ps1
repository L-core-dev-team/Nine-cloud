param(
  [Parameter(Mandatory = $true)][string]$SourceDirectory,
  [Parameter(Mandatory = $true)][string]$PrivateOutputDirectory
)
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Storage.FileAccessMode, Windows.Foundation, ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 } |
  Select-Object -First 1
function Await-Op($op, [Type]$resultType) {
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($op))
  $task.Wait()
  return $task.Result
}
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { throw 'No Windows OCR recognizer is available' }
New-Item -ItemType Directory -Force -Path $PrivateOutputDirectory | Out-Null
$imageNamePattern = '^[' + [char]0x539F + [char]0x8865 + ']\d{3}\.png$'
$images = @(Get-ChildItem -LiteralPath $SourceDirectory -File |
  Where-Object { $_.Name -match $imageNamePattern } | Sort-Object Name)
if ($images.Count -ne 207) { throw "Expected 179 original and 28 supplement images, found $($images.Count)" }
foreach ($item in $images) {
  $file = Await-Op ([Windows.Storage.StorageFile]::GetFileFromPathAsync($item.FullName)) ([Windows.Storage.StorageFile])
  $stream = Await-Op ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await-Op ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await-Op ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await-Op ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $destination = Join-Path $PrivateOutputDirectory ($item.BaseName + '.windows-ocr.txt')
  [IO.File]::WriteAllText($destination, $result.Text, (New-Object Text.UTF8Encoding($false)))
  $stream.Dispose()
}
Write-Output "Wrote independent Windows OCR for $($images.Count) images to private review directory."
