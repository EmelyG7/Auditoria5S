from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base

# Crear tablas
Base.metadata.create_all(bind=engine)

app = FastAPI(title="API Dashboards", version="1.0.0")

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "API de Dashboards funcionando", "status": "ok"}

@app.get("/health")
def health():
    return {"status": "healthy", "database": "sqlite"}
