# UMI — Agenda Personal V6

Agenda personal diaria con tablero visual libre, calendario, tareas, proyectos, cierre diario y sincronización opcional con Supabase. Esta V6 renombra la app a UMI e incorpora tareas multidía en calendario.

La filosofía de UMI es **calma + claridad**: capturar rápido, decidir con criterio y ejecutar sin ruido.

## Archivos

- `index.html`: estructura principal.
- `styles.css`: interfaz responsive, mobile-first y nueva estética UMI.
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
   - publishable key o legacy anon public key
6. Editá `config.js` así:

```js
window.AGENDA_CONFIG = {
  SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
  SUPABASE_ANON_KEY: "TU_PUBLISHABLE_KEY_O_ANON_PUBLIC_KEY"
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

## V6 — Novedades principales

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

1. `config.js` tiene `Project URL` y `publishable key o legacy anon public key` reales.
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


## Nota V5.1 — Publishable key de Supabase

Supabase puede mostrar claves públicas nuevas con formato `sb_publishable_...`. Esta V5.1 las acepta correctamente. También sigue aceptando la legacy anon public key con formato JWT que empieza con `eyJ...`.

Usá cualquiera de estas dos en `SUPABASE_ANON_KEY`. El nombre de la variable queda así por compatibilidad, pero puede contener una publishable key.

No uses `sb_secret_...` ni `service_role` en frontend.


## V5.2 — Calendario editable

- Click sobre una tarea del calendario: abre la tarea para editar, mover fecha, completar o eliminar.
- Click sobre un evento del calendario: abre el evento para editar, mover fecha o eliminar.
- Arrastrá tareas/eventos entre días para cambiar la fecha directamente desde el calendario.
- En el modal de tarea agregué **Quitar fecha** para sacarla del calendario sin borrar la tarea.



## V5.3 — Proyectos sincronizados con calendario

Corrección funcional: los eventos creados desde Calendario con un proyecto asignado ahora impactan en la pestaña Proyectos.

- Los proyectos cuentan tareas abiertas, tareas hechas, eventos próximos y eventos pasados.
- El progreso global del proyecto combina tareas completadas + eventos ya ocurridos sobre el total de tareas + eventos.
- Cada tarjeta de proyecto muestra el próximo evento vinculado, si existe.
- El badge lateral del proyecto suma tareas abiertas + eventos próximos.
- Al eliminar un proyecto, las tareas y eventos vinculados quedan sin proyecto en lugar de quedar con una referencia colgada.

No requiere cambios de base de datos si ya tenés la V5.2/V5.1 funcionando.

## V5.4 — Horarios aproximados en calendario

Esta versión permite asignar hora aproximada a lo agendado:

- Las tareas con fecha pueden tener **hora aprox.** y duración estimada.
- Los eventos pueden tener **inicio aprox.** y **fin aprox.**.
- El calendario muestra los horarios con prefijo `~`, por ejemplo `~15:00`.
- La vista Hoy ordena primero por fecha, después por hora aproximada y luego por prioridad.
- Los modales incluyen atajos rápidos: `~09:00`, `~12:00`, `~15:00`, `~18:00` y opción para dejar sin hora.

No requiere cambios nuevos en Supabase. La base ya tenía `start_time`, `end_time` y `duration_min`.

## V5.5 — Tipos de calendario editables

Esta versión convierte el campo **Tipo** de los eventos en una configuración editable por usuario.

Ahora podés:

- Crear tipos propios: Trabajo, Personal, Clientes, Trámites, Salud, Finanzas, etc.
- Editar nombre, color, icono, orden y estado visible/oculto.
- Eliminar tipos que ya no uses.
- Ver el color del tipo reflejado directamente en el calendario y en la agenda del día.
- Gestionar tipos desde **Configuración > Tipos de calendario**.
- Abrir la gestión desde el modal de evento con el botón al lado del selector de Tipo.

### Importante para Supabase

V5.5 sí requiere volver a ejecutar `supabase_schema.sql`, porque agrega la tabla:

```sql
event_types
```

y elimina el `check` rígido anterior sobre `events.type`, para permitir tipos personalizados.

No borra tus eventos existentes. Si un evento tiene un tipo viejo, la app lo sigue mostrando. Si eliminás un tipo usado, sus eventos se reasignan automáticamente a otro tipo activo.


### Cambios de V6

- Rebranding completo de Axis a **UMI**.
- Estética más minimalista, clara y con una impronta oriental suave.
- Las tareas ahora pueden durar varios días usando `Desde` y `Hasta`.
- En el calendario, una tarea multidía se ve extendida en cada jornada y conserva su rango al arrastrarla.
- Los días del calendario ya no cortan visualmente después de 3 tareas: muestran todas las que entren en la celda.
- Si usás Supabase, corré nuevamente `supabase_schema.sql` para agregar la columna `end_date` en `tasks`.
