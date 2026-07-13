param(
  [string]$Source = "public/logo.png",
  [string]$AndroidRes = "android/app/src/main/res"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$sourcePath = Resolve-Path (Join-Path $repoRoot $Source)
$resRoot = Join-Path $repoRoot $AndroidRes

if (-not (Test-Path $sourcePath)) {
  throw "Android icon source not found: $sourcePath"
}

$densities = @(
  @{ Folder = "mipmap-mdpi";    Icon = 48;  Foreground = 108 },
  @{ Folder = "mipmap-hdpi";    Icon = 72;  Foreground = 162 },
  @{ Folder = "mipmap-xhdpi";   Icon = 96;  Foreground = 216 },
  @{ Folder = "mipmap-xxhdpi";  Icon = 144; Foreground = 324 },
  @{ Folder = "mipmap-xxxhdpi"; Icon = 192; Foreground = 432 }
)

function Save-ScaledPng {
  param(
    [System.Drawing.Image]$SourceImage,
    [string]$OutputPath,
    [int]$CanvasSize,
    [double]$Scale
  )

  $bitmap = New-Object System.Drawing.Bitmap $CanvasSize, $CanvasSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    $drawSize = [Math]::Round($CanvasSize * $Scale)
    $offset = [Math]::Round(($CanvasSize - $drawSize) / 2)
    $rect = New-Object System.Drawing.Rectangle $offset, $offset, $drawSize, $drawSize
    $graphics.DrawImage($SourceImage, $rect)

    $dir = Split-Path -Parent $OutputPath
    if (-not (Test-Path $dir)) {
      New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
try {
  foreach ($density in $densities) {
    $folder = Join-Path $resRoot $density.Folder
    Save-ScaledPng -SourceImage $sourceImage -OutputPath (Join-Path $folder "ic_launcher.png") -CanvasSize $density.Icon -Scale 0.94
    Save-ScaledPng -SourceImage $sourceImage -OutputPath (Join-Path $folder "ic_launcher_round.png") -CanvasSize $density.Icon -Scale 0.94
    Save-ScaledPng -SourceImage $sourceImage -OutputPath (Join-Path $folder "ic_launcher_foreground.png") -CanvasSize $density.Foreground -Scale 0.72
  }
}
finally {
  $sourceImage.Dispose()
}

Write-Host "Android launcher icons generated from $Source"
