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
      # ⚠ `no-store` WAS DROPPED 2026-09-12 (owner). It was costing a full cold
      # rebuild of home.html on every back-navigation from the transaction detail
      # page: `no-store` on the MAIN RESOURCE disqualifies a page from the
      # browser's back/forward cache, so returning tore down and re-executed a
      # 1.23 MB document instead of restoring it. Confirmed in Chrome DevTools ->
      # Application -> Back/forward cache, which named the reason exactly:
      # `MainResourceHasCacheControlNoStore`.
      #
      # THE ORIGINAL REASONING IS KEPT ABOVE BECAUSE THE HAZARD IS REAL, and this
      # is the part that answers it. It argued `no-store` over `no-cache` on the
      # grounds that "no-cache still stores and revalidates, and with no validator
      # to revalidate WITH that is the same trap." It is not the same trap, and the
      # missing validator is what makes it safe rather than what makes it risky:
      #
      #   - The session that was lost happened with NO Cache-Control header at all.
      #     That is what lets a browser apply HEURISTIC freshness and serve a stored
      #     copy for an entire session without asking. An explicit `no-cache,
      #     must-revalidate, max-age=0` forbids heuristics outright.
      #   - `no-cache` means a stored copy may NEVER be used without first
      #     revalidating against this server. With no ETag and no Last-Modified,
      #     that revalidation cannot be conditional -- it is a plain request, and
      #     this server answers every plain request by reading the file off disk.
      #     So the bytes the browser runs are always the bytes on disk, which is the
      #     property the original rule was protecting.
      #
      # Do not add an ETag or Last-Modified here without thinking that through: a
      # validator is what would let a 304 answer a revalidation, and THAT is the
      # shape where a stale body becomes possible again.
      $res.AddHeader("Cache-Control", "no-cache, must-revalidate, max-age=0")
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
