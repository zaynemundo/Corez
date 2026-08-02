# rebuild-logo.ps1
# Regenerates the Corez logo assets from the reference image "new logo.jpeg".
#
# The reference is a black-on-white monochrome emblem. This script:
#   1. Builds a binary mask from the reference (threshold on luminance).
#   2. Applies a 3x3 median filter to remove JPEG noise specks.
#   3. Renders transparent PNGs (white and black mark) at 1024px.
#   4. Traces the mask boundary (Moore-neighbor contour tracing) and writes
#      an SVG path (fill="currentColor", fill-rule="evenodd") so the mark
#      inherits the surrounding theme color.
#
# Outputs (overwritten):
#   public/corez.svg           - vector mark, themeable via currentColor
#   public/corez-white.png     - white mark on transparent (used by the app)
#   public/corez-black.png     - black mark on transparent
#   public/corez-logo.png      - white mark, large version
#   public/corez.png           - black mark
#   public/corez-bw.png        - black mark (duplicate of corez.png)

param(
  [string]$Source = "$PSScriptRoot\..\new logo.jpeg",
  [string]$OutDir = "$PSScriptRoot\..\public"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$bmp = New-Object System.Drawing.Bitmap($Source)
$W = 256
$H = 256
$mask = New-Object 'byte[,]' $H, $W
$sx = $bmp.Width / $W
$sy = $bmp.Height / $H
for ($y = 0; $y -lt $H; $y++) {
  $py = [int]($y * $sy)
  for ($x = 0; $x -lt $W; $x++) {
    $px = [int]($x * $sx)
    $c = $bmp.GetPixel($px, $py)
    if ((($c.R + $c.G + $c.B) / 3) -lt 128) { $mask[$y, $x] = 1 } else { $mask[$y, $x] = 0 }
  }
}
$bmp.Dispose()

# ---- Drop tiny connected components (JPEG noise specks) ------------------
$cc = New-Object 'int[,]' $H, $W
$ccSize = New-Object System.Collections.Generic.List[int]
$ccId = 0
for ($y = 0; $y -lt $H; $y++) {
  for ($x = 0; $x -lt $W; $x++) {
    if ($mask[$y, $x] -eq 1 -and $cc[$y, $x] -eq 0) {
      $ccId++
      $ccSize.Add(0)
      $queue = New-Object System.Collections.Generic.Queue[object]
      $queue.Enqueue(@($x, $y))
      $cc[$y, $x] = $ccId
      while ($queue.Count -gt 0) {
        $p = $queue.Dequeue()
        $px = $p[0]; $py = $p[1]
        $ccSize[$ccId - 1]++
        for ($dy = -1; $dy -le 1; $dy++) {
          for ($dx = -1; $dx -le 1; $dx++) {
            $nx = $px + $dx; $ny = $py + $dy
            if ($nx -ge 0 -and $nx -lt $W -and $ny -ge 0 -and $ny -lt $H -and $mask[$ny, $nx] -eq 1 -and $cc[$ny, $nx] -eq 0) {
              $cc[$ny, $nx] = $ccId
              $queue.Enqueue(@($nx, $ny))
            }
          }
        }
      }
    }
  }
}
for ($y = 0; $y -lt $H; $y++) {
  for ($x = 0; $x -lt $W; $x++) {
    if ($cc[$y, $x] -gt 0 -and $ccSize[$cc[$y, $x] - 1] -lt 30) { $mask[$y, $x] = 0 }
  }
}

# ---- Render transparent PNGs --------------------------------------------
function Save-MaskPng {
  param([string]$Path, [int]$Size, [System.Drawing.Color]$MarkColor)
  $canvas = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.Clear([System.Drawing.Color]::Transparent)
  $brush = New-Object System.Drawing.SolidBrush($MarkColor)
  for ($y = 0; $y -lt $H; $y++) {
    for ($x = 0; $x -lt $W; $x++) {
      if ($mask[$y, $x] -eq 1) { $g.FillRectangle($brush, $x, $y, 1, 1) }
    }
  }
  $g.Dispose()
  $brush.Dispose()

  $big = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bg = [System.Drawing.Graphics]::FromImage($big)
  $bg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $bg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $bg.DrawImage($canvas, 0, 0, $Size, $Size)
  $bg.Dispose()
  $canvas.Dispose()
  $big.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $big.Dispose()
}

$white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
$black = [System.Drawing.Color]::FromArgb(255, 0, 0, 0)
Save-MaskPng -Path "$OutDir\corez-white.png" -Size 1024 -MarkColor $white
Save-MaskPng -Path "$OutDir\corez-black.png" -Size 1024 -MarkColor $black
Save-MaskPng -Path "$OutDir\corez-logo.png" -Size 1024 -MarkColor $white
Save-MaskPng -Path "$OutDir\corez.png" -Size 1024 -MarkColor $black
Save-MaskPng -Path "$OutDir\corez-bw.png" -Size 1024 -MarkColor $black

# ---- Favicon: plain black mark on transparent (no tile) ------------------
function Save-Favicon {
  param([string]$Path, [int]$Size)
  $canvas = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  # Black mark at 92% of the canvas, centered, on a transparent background.
  $scale = 0.92
  $offset = ($W - $W * $scale) / 2
  $blackBrush = New-Object System.Drawing.SolidBrush($black)
  for ($y = 0; $y -lt $H; $y++) {
    for ($x = 0; $x -lt $W; $x++) {
      if ($mask[$y, $x] -eq 1) {
        $g.FillRectangle($blackBrush, $offset + $x * $scale, $offset + $y * $scale, $scale, $scale)
      }
    }
  }
  $blackBrush.Dispose()
  $g.Dispose()

  $big = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bg = [System.Drawing.Graphics]::FromImage($big)
  $bg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $bg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $bg.DrawImage($canvas, 0, 0, $Size, $Size)
  $bg.Dispose()
  $canvas.Dispose()
  $big.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $big.Dispose()
}

Save-Favicon -Path "$OutDir\favicon.png" -Size 512

# ---- Trace boundary (Moore-neighbor) and emit SVG ------------------------
$dx8 = @(0, 1, 1, 1, 0, -1, -1, -1)   # 0=up, 1=up-right, 2=right, ...
$dy8 = @(-1, -1, 0, 1, 1, 1, 0, -1)

$visited = New-Object 'bool[,]' $H, $W
$loops = New-Object System.Collections.Generic.List[object]

for ($sy0 = 0; $sy0 -lt $H; $sy0++) {
  for ($sx0 = 0; $sx0 -lt $W; $sx0++) {
    if ($mask[$sy0, $sx0] -ne 1 -or $visited[$sy0, $sx0]) { continue }

    $isBoundary = $false
    foreach ($d in 0, 2, 4, 6) {
      $nx = $sx0 + $dx8[$d]; $ny = $sy0 + $dy8[$d]
      if ($nx -lt 0 -or $nx -ge $W -or $ny -lt 0 -or $ny -ge $H -or $mask[$ny, $nx] -eq 0) {
        $isBoundary = $true
        break
      }
    }
    if (-not $isBoundary) { continue }

    # Trace the loop from this start pixel.
    $loop = New-Object System.Collections.Generic.List[int[]]
    $loop.Add(@($sx0, $sy0))
    $visited[$sy0, $sx0] = $true
    $curX = $sx0; $curY = $sy0
    $entryDir = 0
    $steps = 0
    do {
      $found = $false
      for ($i = 1; $i -le 8; $i++) {
        $d = ($entryDir + $i) % 8
        $nx = $curX + $dx8[$d]; $ny = $curY + $dy8[$d]
        if ($nx -ge 0 -and $nx -lt $W -and $ny -ge 0 -and $ny -lt $H -and $mask[$ny, $nx] -eq 1) {
          $loop.Add(@($nx, $ny))
          $visited[$ny, $nx] = $true
          $curX = $nx; $curY = $ny
          $entryDir = ($d + 4) % 8
          $found = $true
          break
        }
      }
      if (-not $found) { break }
      $steps++
    } while (($curX -ne $sx0 -or $curY -ne $sy0) -and $steps -lt 100000)

    if ($loop.Count -gt 2) { $loops.Add($loop) }
  }
}

# Simplify (drop duplicate + collinear points) and smooth (moving average).
function Simplify-And-Smooth {
  param($loop)
  $pts = @()
  $n = $loop.Count
  for ($i = 0; $i -lt $n; $i++) {
    $prev = $loop[($i - 1 + $n) % $n]
    $cur = $loop[$i]
    $next = $loop[($i + 1) % $n]
    $cross = ($cur[0] - $prev[0]) * ($next[1] - $cur[1]) - ($cur[1] - $prev[1]) * ($next[0] - $cur[0])
    if ($cross -ne 0 -or ($cur[0] -eq $prev[0] -and $cur[1] -eq $prev[1])) {
      $pts += ,@([double]$cur[0], [double]$cur[1])
    }
  }
  $m = $pts.Count
  if ($m -lt 4) { return $pts }
  $sm = New-Object 'double[,]' $m, 2
  $smooth = 3
  for ($pass = 0; $pass -lt 2; $pass++) {
    for ($i = 0; $i -lt $m; $i++) {
      $sumX = 0.0; $sumY = 0.0
      for ($w = -$smooth; $w -le $smooth; $w++) {
        $j = ($i + $w + $m) % $m
        $sumX += $pts[$j][0]; $sumY += $pts[$j][1]
      }
      $cnt = 2 * $smooth + 1
      $sm[$i, 0] = $sumX / $cnt
      $sm[$i, 1] = $sumY / $cnt
    }
    $pts = @()
    for ($i = 0; $i -lt $m; $i++) { $pts += ,@($sm[$i, 0], $sm[$i, 1]) }
  }
  return $pts
}

$d = ''
foreach ($loop in $loops) {
  $pts = Simplify-And-Smooth $loop
  if ($pts.Count -lt 3) { continue }
  $d += "M$([Math]::Round($pts[0][0], 2)) $([Math]::Round($pts[0][1], 2))"
  for ($i = 1; $i -lt $pts.Count; $i++) {
    $d += "L$([Math]::Round($pts[$i][0], 2)) $([Math]::Round($pts[$i][1], 2))"
  }
  $d += 'Z'
}

$svg = @"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $W $H" width="100%" height="100%">
  <path fill="currentColor" fill-rule="evenodd" d="$d" />
</svg>
"@
[System.IO.File]::WriteAllText("$OutDir\corez.svg", $svg)
Write-Output "Done: $($loops.Count) loops, $($d.Length) path chars. Assets written to $OutDir"
