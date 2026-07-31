import urllib.request
import json
import datetime
import os

SUPABASE_URL = "https://kwmvuuwinufksjjfsuls.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3bXZ1dXdpbnVma3NqamZzdWxzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjMyODM2OSwiZXhwIjoyMDk3OTA0MzY5fQ.0Q_wVVgFAF4rXIZxG2BTbY-dkjwYuY-WEGwxP7r7ygE"

TABLES = [
    "organizations", "roles", "permissions", "users", "donors", "projects", 
    "project_members", "agreements", "disbursements", "clauses", "budget_versions", 
    "budget_lines", "expenses", "receipts_vouchers", "documents", "reports", 
    "indicators", "audit_logs", "notifications", "tasks", "task_dependencies", 
    "task_comments", "project_logs", "events", "event_attendees", "document_analysis"
]

backup_data = {}

print("Iniciando respaldo de base de datos desde Supabase...")

for table in TABLES:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{table}?select=*",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}"
        }
    )
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            backup_data[table] = data
            print(f"Respaldada tabla: {table} ({len(data)} registros)")
    except Exception as e:
        print(f"Error al respaldar tabla {table}: {e}")

date_str = datetime.datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
filename = f"respaldo_proyecty_{date_str}.json"
filepath = os.path.join(os.getcwd(), filename)

with open(filepath, "w", encoding="utf-8") as f:
    json.dump(backup_data, f, indent=2, ensure_ascii=False)

print(f"\n¡Respaldo completado con éxito!")
print(f"Archivo guardado en: {filepath}")
