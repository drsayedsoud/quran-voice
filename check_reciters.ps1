[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$data = Invoke-RestMethod -Uri 'https://api.quran.com/api/v4/resources/recitations'
foreach ($r in $data.recitations) {
    Write-Host "$($r.id): $($r.reciter_name) ($($r.style))"
}
