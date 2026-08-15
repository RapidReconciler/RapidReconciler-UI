# Minimal static file server for previewing RR docs
$port = if ($env:PORT) { [int]$env:PORT } else { 8765 }
$root = (Get-Location).Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$port/"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".woff" = "font/woff"
  ".woff2"= "font/woff2"
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $relPath = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart("/"))
    if ($relPath -eq "" -or $relPath.EndsWith("/")) { $relPath += "index.html" }
    $full = Join-Path $root $relPath
    if (Test-Path $full -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] }
      # Never let a browser cache a dev preview file. This server previously sent
      # NO caching headers at all - no Cache-Control, no ETag, no Last-Modified -
      # so browsers fell back to heuristic caching with nothing to revalidate
      # against, and happily served an old copy of a page for an entire session.
      # That cost a long debugging session: an edit was live on disk and in the
      # server's response, the owner's browser kept running the previous copy,
      # and every fix looked like it had done nothing. Worse, the stale copy was
      # PARTIAL - a freshly fetched sidebar.js rendered new text on top of old
      # HTML, which reads as "the page updated" and hides the problem.
      # no-store rather than no-cache: no-cache still stores and revalidates,
      # and with no validator to revalidate WITH that is the same trap.
      $res.AddHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
      $res.AddHeader("Pragma", "no-cache")
      $res.AddHeader("Expires", "0")
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [Text.Encoding]::UTF8.GetBytes("404: $relPath")
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
    $res.Close()
  } catch {
    Write-Host "err: $_"
  }
}
