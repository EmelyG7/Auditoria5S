"""
Prueba rápida del servicio de cálculo.
Ejecutar desde backend/ con: python test_service.py
"""
import sys
sys.path.insert(0, ".")

from app.services.audit_service import (
    GrupoS,
    calcular_puntajes_desde_dict,
    _semaforo,
    _extraer_peso,
    _parsear_respuesta,
)

# ── Test 1: Funciones utilitarias ─────────────────────────────────────────────
assert _extraer_peso("¿Área limpia? 4.55%") == 4.55
assert _extraer_peso("Observaciones 1") is None
assert _parsear_respuesta("100%") == 100.0
assert _parsear_respuesta("50%")  == 50.0
assert _parsear_respuesta(0)      == 0.0
assert _parsear_respuesta(0.5)    == 50.0
assert _semaforo(85)  == "Cumple"
assert _semaforo(70)  == "Por mejorar"
assert _semaforo(50)  == "Crítico"
print("✅ Test 1 — funciones utilitarias OK")

# ── Test 2: Cálculo con grupos simulados ──────────────────────────────────────
grupos_test = [
    GrupoS(
        s_index=0,
        nombre_s="Seiri (Clasificar)",
        columnas_preguntas=[
            "¿Se eliminan materiales innecesarios? 10%",
            "¿Hay etiquetas de clasificación? 10%",
        ],
        columna_observacion="Observaciones 1",
    ),
    GrupoS(
        s_index=1,
        nombre_s="Seiton (Ordenar)",
        columnas_preguntas=[
            "¿Cada cosa en su lugar? 10%",
        ],
        columna_observacion="Observaciones 2",
    ),
]

respuestas_test = {
    "FechaAuditoria": "2024-03-15",
    "Sucursal":       "Oficina Principal",
    "Auditor":        "Juan Pérez",
    "Email":          "juan@test.com",
    # Seiri: 100% + 50% = (10 + 5) / 20 = 75% → Por mejorar
    "¿Se eliminan materiales innecesarios? 10%": 100,
    "¿Hay etiquetas de clasificación? 10%":       50,
    "Observaciones 1":                            "Falta mejorar etiquetado",
    # Seiton: 80% = 8 / 10 → Cumple
    "¿Cada cosa en su lugar? 10%":               80,
    "Observaciones 2":                            "",
}

resultado = calcular_puntajes_desde_dict(respuestas_test, grupos_test)

assert resultado.sucursal == "Oficina Principal"
assert resultado.trimestre == "Q1"
assert resultado.anio == 2024

# Verificar Seiri
seiri = resultado.puntajes_por_s[0]
assert seiri.puntos_obtenidos == 15.0,  f"Esperado 15.0, obtenido {seiri.puntos_obtenidos}"
assert seiri.puntos_maximos   == 20.0
assert seiri.porcentaje       == 75.0
assert seiri.estado           == "Por mejorar"
assert seiri.observacion      == "Falta mejorar etiquetado"

# Verificar Seiton
seiton = resultado.puntajes_por_s[1]
assert seiton.porcentaje == 80.0
assert seiton.estado     == "Cumple"

# Verificar totales: (15+8)/(20+10) = 23/30 = 76.67%
assert resultado.puntaje_total    == 23.0
assert resultado.puntaje_maximo   == 30.0
assert resultado.porcentaje_general == round((23/30)*100, 2)
assert resultado.estado_general   == "Por mejorar"

# Verificar críticas (respuesta_pct < 100)
# La pregunta de etiquetas (50%) y la de seiton (80%) son críticas
assert len(resultado.preguntas_criticas) == 2

print(f"✅ Test 2 — cálculo completo OK")
print(f"   Porcentaje general: {resultado.porcentaje_general}% ({resultado.estado_general})")
print(f"   Preguntas críticas: {len(resultado.preguntas_criticas)}")
print(f"   Detalle por S:")
for ps in resultado.puntajes_por_s:
    print(f"     {ps.nombre_s}: {ps.porcentaje}% ({ps.estado})")

print("\n✅ Todos los tests pasaron correctamente.")