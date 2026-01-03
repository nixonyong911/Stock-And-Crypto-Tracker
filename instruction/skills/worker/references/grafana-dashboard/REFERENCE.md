# Grafana Dashboard Reference

## 1. Create Dashboard JSON

Location: `grafana/dashboards/yourworker-details.json`

| Panel | Type | PromQL |
|-------|------|--------|
| Worker Status | Stat | `yourworker_worker_up` |
| Operations Rate | Timeseries | `rate(yourworker_fetch_operations_total[5m])` |
| Error Rate | Gauge | `rate(errors[5m]) / rate(operations[5m]) * 100` |

Template: Copy from `grafana/dashboards/twelvedata-details.json`

## 2. Upload to Grafana Cloud (API)

```powershell
$json = Get-Content "grafana/dashboards/yourworker-details.json" -Raw | ConvertFrom-Json
$body = @{ dashboard = $json; overwrite = $true } | ConvertTo-Json -Depth 100
$headers = @{ "Authorization" = "Bearer $env:GRAFANA_TOKEN"; "Content-Type" = "application/json" }
Invoke-RestMethod -Uri "https://stockandcryptotracker.grafana.net/api/dashboards/db" -Method Post -Headers $headers -Body $body
```

Token: `GRAFANA_SERVICE_ACCOUNT_TOKEN` from Infisical

## 3. Verify Upload

```powershell
$headers = @{ "Authorization" = "Bearer $env:GRAFANA_TOKEN" }
Invoke-RestMethod -Uri "https://stockandcryptotracker.grafana.net/api/search?query=yourworker" -Headers $headers | Select uid, title
```

## Related
- [Grafana CLI Skill](../../../cli/References/grafana/REFERENCE.md)

