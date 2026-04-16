param(
  [ValidateSet('app', 'browser', 'stop')]
  [string]$Mode = 'app',
  [int]$PreferredPort = 8765,
  [string]$BindHost = '127.0.0.1',
  [string]$EntryPath = 'index.html',
  [string]$StateDir = '',
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$NormalizedRepoRoot = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd('\', '/')
$ServerScript = Join-Path $RepoRoot 'tools\local_server.py'
$ResolvedStateDir = if ($StateDir) { $StateDir } else { Join-Path $env:LOCALAPPDATA 'axiomOSLiteStrippedLocal' }
$StateFile = Join-Path $ResolvedStateDir 'server-state.json'
$LocalLauncherVersion = '20260408b'

function Normalize-PathValue([string]$PathValue) {
  if ([string]::IsNullOrWhiteSpace($PathValue)) { return '' }
  try {
    return [System.IO.Path]::GetFullPath($PathValue).TrimEnd('\', '/')
  } catch {
    return $PathValue.TrimEnd('\', '/')
  }
}

function Ensure-StateDir {
  if (-not (Test-Path $ResolvedStateDir)) {
    New-Item -Path $ResolvedStateDir -ItemType Directory -Force | Out-Null
  }
}

function Read-State {
  if (-not (Test-Path $StateFile)) { return $null }
  try {
    return (Get-Content -Path $StateFile -Raw | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Write-State([int]$ProcessId, [int]$Port, [string]$PythonCommand) {
  Ensure-StateDir
  $payload = @{
    pid = $ProcessId
    port = $Port
    host = $BindHost
    root = $NormalizedRepoRoot
    python = $PythonCommand
    startedAt = (Get-Date).ToString('o')
  }
  $payload | ConvertTo-Json | Set-Content -Path $StateFile -Encoding UTF8
}

function Remove-State {
  Remove-Item -Path $StateFile -Force -ErrorAction SilentlyContinue
}

function Invoke-AxiomPing([int]$Port) {
  try {
    $url = "http://$BindHost`:$Port/__axiom_ping"
    return Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 2
  } catch {
    return $null
  }
}

function Test-AxiomServer([int]$Port) {
  $response = Invoke-AxiomPing -Port $Port
  if (-not ($response -and $response.app -eq 'axiomOS')) { return $false }
  $responseRoot = Normalize-PathValue ([string]$response.root)
  return $responseRoot -eq $NormalizedRepoRoot
}

function Get-PythonCommand {
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    return @{
      File = $py.Source
      Prefix = @('-3')
      Label = 'py -3'
    }
  }

  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    return @{
      File = $python.Source
      Prefix = @()
      Label = 'python'
    }
  }

  throw 'Python 3 was not found. Install Python 3 to use the local launcher.'
}

function Get-PortCandidates {
  $candidates = [System.Collections.Generic.List[int]]::new()
  $state = Read-State
  if ($state -and $state.port) {
    [void]$candidates.Add([int]$state.port)
  }
  for ($port = $PreferredPort; $port -le ($PreferredPort + 10); $port++) {
    if (-not $candidates.Contains($port)) {
      [void]$candidates.Add($port)
    }
  }
  return $candidates
}

function Wait-ForServer([int]$Port, $Process) {
  for ($i = 0; $i -lt 24; $i++) {
    if (Test-AxiomServer -Port $Port) { return $true }
    if ($Process -and $Process.HasExited) { return $false }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function Ensure-AxiomServer {
  if (-not (Test-Path $ServerScript)) {
    throw "Local server script not found: $ServerScript"
  }

  foreach ($port in Get-PortCandidates) {
    if (Test-AxiomServer -Port $port) {
      Write-State -Pid 0 -Port $port -PythonCommand 'existing'
      return $port
    }

    $python = Get-PythonCommand
    $args = @()
    $args += $python.Prefix
    $args += @($ServerScript, '--host', $BindHost, '--port', "$port", '--root', $RepoRoot)

    $process = Start-Process -FilePath $python.File -ArgumentList $args -WorkingDirectory $RepoRoot -WindowStyle Hidden -PassThru

    if (Wait-ForServer -Port $port -Process $process) {
      Write-State -Pid $process.Id -Port $port -PythonCommand $python.Label
      return $port
    }
  }

  throw 'Unable to start the local axiomOS Lite server. Close any conflicting loopback servers and try again.'
}

function Stop-AxiomServer {
  $state = Read-State
  if ($state -and $state.pid -and [int]$state.pid -gt 0) {
    try {
      Stop-Process -Id ([int]$state.pid) -Force -ErrorAction Stop
    } catch {
      # Ignore stale PID or already-stopped server.
    }
  }
  Remove-State
  Write-Host 'axiomOS Lite local server stopped.'
}

function Get-AppBrowser {
  $candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:LocalAppData 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LocalAppData 'Google\Chrome\Application\chrome.exe')
  ) | Where-Object { $_ -and (Test-Path $_) }

  return ($candidates | Select-Object -First 1)
}

function Open-AxiomUrl([string]$Url) {
  if ($NoOpen) {
    Write-Host "axiomOS Lite is ready at $Url"
    return
  }

  if ($Mode -eq 'app') {
    $browser = Get-AppBrowser
    if ($browser) {
      Start-Process -FilePath $browser -ArgumentList @(
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-http-cache',
        "--app=$Url"
      )
      return
    }
  }

  Start-Process $Url
}

if ($Mode -eq 'stop') {
  Stop-AxiomServer
  exit 0
}

$port = Ensure-AxiomServer
$entry = if ([string]::IsNullOrWhiteSpace($EntryPath)) { 'index.html' } else { $EntryPath.TrimStart('/') }
$separator = if ($entry.Contains('?')) { '&' } else { '?' }
$query = if ($Mode -eq 'app') { "${separator}local-launcher=1&v=$LocalLauncherVersion" } else { '' }
$url = "http://$BindHost`:$port/$entry$query"

if ($Mode -eq 'browser') {
  Write-Host "Opening axiomOS Lite in the browser on $url"
  Write-Host 'Use the browser install action on index.html if you want a true PWA install.'
} else {
  Write-Host "Opening axiomOS Lite as a local desktop window on $url"
}

Open-AxiomUrl -Url $url
