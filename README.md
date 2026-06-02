# Axis Agenda — Personal Board Operativo

V1 funcional para usar como agenda personal diaria, board de tareas, calendario y cierre diario. Está lista para GitHub Pages y preparada para Supabase.

## Archivos

- `index.html`: estructura principal.
- `styles.css`: interfaz responsive y mobile-first.
- `app.js`: lógica completa, CRUD, drag & drop, filtros, búsqueda, backup y sync.
- `config.js`: configuración activa. Por defecto viene en modo local.
- `config.example.js`: plantilla para conectar Supabase.
- `supabase_schema.sql`: tablas, índices, triggers y RLS.

## Uso rápido sin Supabase

1. Subí todos los archivos a GitHub Pages.
2. Abrí la página.
3. La app funciona en modo local usando `localStorage`.

Limitación: si cambiás de navegador o dispositivo, no se sincroniza. Sirve para testear, no para operar seriamente a largo plazo.

## Conectar Supabase

1. Creá un proyecto en Supabase.
2. Abrí `SQL Editor`.
3. Pegá y ejecutá `supabase_schema.sql`.
4. En Supabase, entrá en `Project Settings > API`.
5. Copiá:
   - Project URL
   - anon public key
6. Editá `config.js` así:

```js
window.AGENDA_CONFIG = {
  SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
  SUPABASE_ANON_KEY: "TU_SUPABASE_ANON_KEY"
};
```

7. Subí el cambio a GitHub Pages.
8. Al abrir la app, aparece login/registro.

## Funciones incluidas

- Vista Hoy con vencidas, tareas del día, progreso y agenda diaria.
- Captura rápida para cargar tareas sin fricción.
- Tablero Kanban con drag & drop.
- Calendario mensual con eventos y vencimientos.
- CRUD completo de tareas, eventos y proyectos.
- Repetición simple de tareas: diaria, semanal o mensual. Al completar una recurrente, crea la próxima ocurrencia.
- Cierre diario: plan, bloqueos y avances.
- Búsqueda global.
- Filtros por proyecto, prioridad y contexto.
- Backup JSON export/import.
- Responsive para celular.
- Modo local fallback si Supabase no está configurado.

## Nota de seguridad

La anon key de Supabase puede estar en frontend. La protección real está en Row Level Security. No uses nunca la service role key en GitHub Pages.

## V2 — Tablero visual libre

La pestaña **Tablero** ya no funciona como Kanban. Ahora es un canvas general de trabajo:

- Arrastrás plantillas desde la barra superior: Idea, Tarea, Decisión, Nota o Bloqueo.
- Cada tarjeta se puede mover libremente por el espacio.
- Cada tarjeta tiene título, categoría, color y texto.
- Podés conectar tarjetas con el botón **Conectar**.
- Podés quitar conexiones desde el icono de enlace roto en cada tarjeta.
- El botón **Ordenar vista** acomoda automáticamente las tarjetas si el tablero queda desprolijo.

Para Supabase, ejecutá de nuevo `supabase_schema.sql`. Agrega las tablas `board_cards` y `board_links` con RLS por usuario.
