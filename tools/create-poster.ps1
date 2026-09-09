Add-Type -AssemblyName System.Drawing

$posterRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\assets\poster'))
$backgroundPath = Join-Path $posterRoot 'poster-background.png'
$qrPath = Join-Path $posterRoot 'qr-biblioteca.png'
$outputPath = Join-Path $posterRoot 'poster-biblioteca-stc.png'

$canvas = [System.Drawing.Bitmap]::FromFile($backgroundPath)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)
$qr = $null

try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $green = [System.Drawing.ColorTranslator]::FromHtml('#123F32')
    $terracotta = [System.Drawing.ColorTranslator]::FromHtml('#A44E27')
    $muted = [System.Drawing.ColorTranslator]::FromHtml('#56695F')

    $fontEyebrow = [System.Drawing.Font]::new('Segoe UI Semibold', 22, [System.Drawing.FontStyle]::Bold)
    $fontTitle = [System.Drawing.Font]::new('Segoe UI', 39, [System.Drawing.FontStyle]::Bold)
    $fontBody = [System.Drawing.Font]::new('Segoe UI', 19, [System.Drawing.FontStyle]::Regular)
    $fontCta = [System.Drawing.Font]::new('Segoe UI Semibold', 22, [System.Drawing.FontStyle]::Bold)
    $fontUrl = [System.Drawing.Font]::new('Segoe UI', 15, [System.Drawing.FontStyle]::Regular)
    $brushGreen = [System.Drawing.SolidBrush]::new($green)
    $brushTerracotta = [System.Drawing.SolidBrush]::new($terracotta)
    $brushMuted = [System.Drawing.SolidBrush]::new($muted)
    $whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $center = [System.Drawing.StringFormat]::new()
    $center.Alignment = [System.Drawing.StringAlignment]::Center
    $center.LineAlignment = [System.Drawing.StringAlignment]::Near

    $graphics.DrawString('BIBLIOTECA STC', $fontEyebrow, $brushTerracotta, [System.Drawing.RectangleF]::new(80, 545, 864, 45), $center)
    $graphics.DrawString("HAY UN LIBRO`nESPERANDO POR TI", $fontTitle, $brushGreen, [System.Drawing.RectangleF]::new(70, 590, 884, 145), $center)
    $graphics.DrawString('Descubre, aprende y comparte nuevas historias.', $fontBody, $brushMuted, [System.Drawing.RectangleF]::new(90, 735, 844, 42), $center)

    $qr = [System.Drawing.Image]::FromFile($qrPath)
    $qrSize = 350
    $qrX = [int](($canvas.Width - $qrSize) / 2)
    $qrY = 795
    $graphics.FillRectangle($whiteBrush, $qrX - 18, $qrY - 18, $qrSize + 36, $qrSize + 36)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $graphics.DrawImage($qr, $qrX, $qrY, $qrSize, $qrSize)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    $graphics.DrawString('ESCANEA  •  EXPLORA  •  SOLICITA', $fontCta, $brushGreen, [System.Drawing.RectangleF]::new(70, 1180, 884, 44), $center)
    $graphics.DrawString('Abre la cámara de tu teléfono y apunta al código QR', $fontBody, $brushMuted, [System.Drawing.RectangleF]::new(80, 1230, 864, 38), $center)
    $graphics.DrawString('meredeitor.github.io/biblioteca', $fontUrl, $brushTerracotta, [System.Drawing.RectangleF]::new(80, 1275, 864, 32), $center)

    $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    if ($qr) { $qr.Dispose() }
    $graphics.Dispose()
    $canvas.Dispose()
    foreach ($resource in @($fontEyebrow, $fontTitle, $fontBody, $fontCta, $fontUrl, $brushGreen, $brushTerracotta, $brushMuted, $whiteBrush, $center)) {
        if ($resource) { $resource.Dispose() }
    }
}

Get-Item -LiteralPath $outputPath | Select-Object FullName, Length
