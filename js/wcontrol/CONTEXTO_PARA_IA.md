# Módulo Wcontrol — Contexto para integración en Wizard Platform

## Qué es este módulo
Wcontrol es un sistema de gestión de trabajadores (RRHH básico) que se está
migrando desde un proyecto Supabase independiente hacia Wizard Platform.
Permite registrar trabajadores, llevar asistencia mensual y generar liquidaciones de sueldo.

## Ubicación dentro del proyecto
```
F:\Codex\wizard-menu\
├── platform\wcontrol\index.html   ← página principal del módulo (ya creada, shell vacío)
├── js\wcontrol\                   ← aquí van los módulos JS adaptados
│   ├── CONTEXTO_PARA_IA.md        ← este archivo
│   ├── db.js                      ← (por crear) queries Supabase del módulo
│   ├── trabajadores.js            ← (por crear) lógica de trabajadores
│   ├── asistencia.js              ← (por crear) lógica de asistencia mensual
│   └── liquidacion.js             ← (por crear) lógica de liquidaciones
└── backup\                        ← respaldo completo del proyecto Wcontrol original
    (en F:\Proyectos\Wcontrol\backup\)
```

## Supabase de Wizard Platform
- URL:      https://cwatxpuxttgeceahbciw.supabase.co
- Cliente:  importar desde `/js/core/supabase.js` (ya configurado)
- Auth:     usar `requireAuth` de `/js/core/auth.js`
- Shell:    usar `initShell('wcontrol', 'Wcontrol')` de `/js/ui/sidebar.js`

## Tablas a crear en Wizard Platform (Supabase cwatxpuxttgeceahbciw)
El script SQL completo está en:
  F:\Proyectos\Wcontrol\backup\03_schema_create_para_wizard.sql

Tablas:
- `empresa`            — datos de la empresa (id=1, RUT, nombre, dirección, logo)
- `trabajadores`       — registro de trabajadores (uuid, nombre, RUT, sueldo, AFP, etc.)
- `asistencia_mensual` — registro diario de asistencia por trabajador/mes (jsonb dias_data)
- `liquidaciones`      — liquidaciones de sueldo mensuales (jsonb datos con todos los cálculos)

## Módulo en tabla `modules` de Wizard Platform
Insertar esta fila para que aparezca en el sidebar:
```sql
INSERT INTO modules (slug, nombre, icono, habilitado, orden, descripcion)
VALUES ('wcontrol', 'Wcontrol', 'ti-users', true, 10, 'Gestión de trabajadores y liquidaciones')
ON CONFLICT (slug) DO NOTHING;
```

## Código original (fuente de la lógica de negocio)
Los archivos originales están en F:\Proyectos\Wcontrol\:
- app.js          → utilidades compartidas, auth, carga de trabajadores
- trabajadores.js → CRUD de trabajadores, horario semanal, contrato PDF
- asistencia.js   → planilla mensual, cálculo de horas, resumen semanal
- liquidacion.js  → cálculo de sueldo proporcional, AFP, salud, gratificación
- empresa.js      → logo de empresa en Storage

## Adaptación necesaria
El código original usa:
- Variables globales (var) y funciones globales
- `window.supabase.createClient(...)` con su propio cliente
- `document.getElementById(...)` directo sobre el HTML monolítico

Para Wizard Platform debe usar:
- ES modules (import/export)
- El cliente Supabase compartido: `import { supabase } from '/js/core/supabase.js'`
- El shell de la plataforma: `initShell('wcontrol', 'Wcontrol')`
- Inyectar el HTML en `document.getElementById('platform-content')`

## Buckets de Storage necesarios
- `contratos` (privado) — PDFs de contratos de trabajadores
- `logos`     (público) — logo de la empresa

Crearlos con el SQL en 03_schema_create_para_wizard.sql (sección STORAGE).

## Estado del respaldo
Todos los datos de Wcontrol están respaldados en:
  F:\Proyectos\Wcontrol\backup\
- data_01_empresa.csv        → 1 empresa (THE WIZARD COFFEE SPA)
- data_02_trabajadores.csv   → 1 trabajadora (Gabriela Paz Villalobos)
- data_03_asistencia.csv     → 4 meses de asistencia
- data_04_liquidaciones.csv  → 4 liquidaciones (ene-abr 2026)

Los CSV contienen sentencias INSERT listas para ejecutar en el SQL Editor
de Wizard Platform DESPUÉS de crear las tablas.

## Usuario Auth a migrar
- Email: hola@twcoffee.cl
- Recrear en Wizard Platform → Authentication → Users

## Nota sobre logo_url
Después de importar los datos, ejecutar este UPDATE para corregir la URL
del logo (que apunta al proyecto Supabase viejo):
```sql
UPDATE empresa
SET logo_url = REPLACE(
  logo_url,
  'https://zkqtcdxhwtonkrluvkbj.supabase.co',
  'https://cwatxpuxttgeceahbciw.supabase.co'
)
WHERE logo_url IS NOT NULL;
```

## Orden de trabajo recomendado
1. Ejecutar 03_schema_create_para_wizard.sql en Wizard Platform
2. Insertar el módulo en tabla `modules` (SQL de arriba)
3. Importar los datos (data_01 al data_04)
4. Ejecutar UPDATE de logo_url
5. Re-subir el contrato PDF y logo a los buckets de Wizard Platform
6. Adaptar e integrar el JS en js/wcontrol/
7. Construir la UI en platform/wcontrol/index.html
