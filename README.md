# Axis Agenda — Personal Board Operativo V5 Final

Agenda personal diaria con tablero visual libre, calendario, tareas, proyectos, cierre diario y sincronización opcional con Supabase. Está lista para GitHub Pages.

La filosofía de esta V5 es **comodidad + orden**: capturar rápido, decidir visualmente y ejecutar desde la agenda diaria.

## Archivos

- `index.html`: estructura principal.
- `styles.css`: interfaz responsive, mobile-first y mejoras visuales V5.
- `app.js`: lógica completa, CRUD, canvas, conexiones, atajos, búsqueda, backup, sync y tablero visual.
- `config.js`: configuración activa. Por defecto viene en modo local.
- `config.example.js`: plantilla para conectar Supabase.
- `supabase_schema.sql`: tablas, índices, triggers y RLS.

## Uso rápido sin Supabase

1. Subí todos los archivos a GitHub Pages.
2. Abrí la página.
3. La app funciona en modo local usando `localStorage`.

Limitación: si cambiás de navegador o dispositivo, no se sincroniza. Sirve para testear, pero para uso serio conviene Supabase.

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
- Calendario mensual con eventos y vencimientos.
- CRUD completo de tareas, eventos y proyectos.
- Repetición simple de tareas: diaria, semanal o mensual.
- Cierre diario: plan, bloqueos y avances.
- Búsqueda global.
- Backup JSON export/import.
- Indicador visible de modo de datos: Local, Supabase o Error.
- Responsive para celular.
- Modo local fallback si Supabase no está configurado.

## V5 — Mejoras finales

### Tablero Canvas más cómodo

La pestaña **Tablero** funciona como mesa de trabajo visual, no como Kanban.

- Arrastrás tarjetas desde la paleta superior.
- Doble click en espacio vacío: crea una nota.
- Click derecho: menú contextual estilo Canva.
- Barra de tarjeta seleccionada con acciones rápidas.
- Botón **Flujo base** para crear una estructura mínima de trabajo.
- Botón **Ayuda** con reglas de uso y atajos.
- Selector de color para líneas.
- Limpieza de conexiones huérfanas desde el menú contextual.

### Barra de selección

Cuando seleccionás una tarjeta aparece una barra rápida para:

- Editar.
- Duplicar.
- Conectar desde esa tarjeta.
- Mandar a tareas de hoy.
- Limpiar selección.

Esto evita abrir el modal para tareas repetitivas. Menos clicks, menos fricción.

### Flujo base

El botón **Flujo base** crea automáticamente:

- Objetivo / norte.
- Decisión clave.
- Próxima acción.
- Bloqueo / riesgo.
- Recursos.

Con conexiones prearmadas y colores distintos. Es ideal para empezar un proyecto sin caer en un mural caótico.

## Click derecho

En espacio vacío permite crear:

- Nueva nota.
- Nueva tarea visual.
- Nueva idea.
- Nueva decisión.
- Nuevo bloqueo.
- Nuevo proceso.
- Nuevo recurso.
- Crear flujo base.
- Sanear conexiones.
- Activar/desactivar grilla.
- Ordenar vista.

Sobre una tarjeta permite:

- Editar.
- Duplicar.
- Conectar desde esa tarjeta.
- Mandar a tareas de hoy.
- Quitar conexiones.
- Eliminar.

## Atajos de teclado en Tablero

- `N`: nueva nota.
- `T`: nueva tarea visual.
- `I`: nueva idea.
- `D`: nueva decisión.
- `B`: nuevo bloqueo.
- `P`: nuevo proceso.
- `R`: nuevo recurso.
- `Ctrl + D`: duplicar tarjeta seleccionada.
- `Ctrl + C`: copiar tarjeta seleccionada.
- `Ctrl + V`: pegar/duplicar tarjeta copiada.
- `Del` o `Backspace`: eliminar tarjeta seleccionada.
- `Esc`: cerrar menú contextual o salir del modo conexión.
- `Ctrl + /`: abrir ayuda rápida.

## Conexiones

- Elegí el color de línea desde el selector **Línea**.
- Botón **Conectar**: seleccioná origen y destino.
- Click derecho sobre una tarjeta > **Conectar desde acá**: más rápido para armar diagramas.
- Para cancelar: botón **Cancelar conexión**, tecla `Esc`, click en el fondo del canvas o click derecho.
- Si tocás la misma tarjeta como origen y destino, la app cancela el modo conexión en vez de quedar trabada.
- El icono de enlace roto quita conexiones de una tarjeta.

## Supabase login

La app valida `config.js` antes de mostrar login. Si detecta placeholders, URL inválida, anon key mal copiada o SDK no cargado, activa modo local y muestra diagnóstico.

Checklist si no loguea:

1. `config.js` tiene `Project URL` y `anon public key` reales.
2. No pegaste `service_role key`.
3. Ejecutaste `supabase_schema.sql` completo.
4. En Supabase > Authentication > Providers, Email está activo.
5. Si usás confirmación por email, agregá tu URL de GitHub Pages en Authentication > URL Configuration > Site URL.
6. En GitHub Pages, revisá consola del navegador: la app muestra el error concreto en pantalla y en toast.

## Nota de seguridad

La anon key de Supabase puede estar en frontend. La protección real está en Row Level Security. No uses nunca la service role key en GitHub Pages.

## SQL

Si venís de la V4, no deberías necesitar cambiar la base. Igual podés ejecutar `supabase_schema.sql` completo: está preparado con `if not exists` para no romper datos.

Si venís desde una versión anterior a la V2, ejecutá `supabase_schema.sql` completo.
