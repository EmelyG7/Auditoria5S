# Activar entorno virtual
cd C:\Users\egomez\Documents\Auditoria5S
.\venv\Scripts\Activate

# Iniciar servidor
cd backend
uvicorn main:app --reload --port 8000
