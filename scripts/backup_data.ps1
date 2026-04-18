# Respaldar base de datos SQLite
\ = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item "C:\Users\egomez\Documents\Auditoria5S\data\auditorias.db" "C:\Users\egomez\Documents\Auditoria5S\data\backup_\auditorias_\.db"
Write-Host "Backup creado: \.db" -ForegroundColor Green
