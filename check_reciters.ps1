[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$resp = Invoke-WebRequest -Uri 'https://everyayah.com/data/' -UseBasicParsing
$lines = $resp.Content -split "`n"
foreach ($line in $lines) {
    if ($line -match 'href="([^"/]+)/"') {
        Write-Host $matches[1]
    }
}
