# Maka Clothing — app de escritorio

Electron + Node.js, conectada directo a Supabase (Postgres + Auth + RLS).
Corre igual en Ubuntu y en Windows.

## Antes de arrancar

1. Corré en el SQL Editor de Supabase, en este orden: `maka_schema.sql`,
   `maka_schema_funciones.sql`, `maka_schema_compras.sql`,
   `maka_schema_activo.sql`, el fix de la columna de compras,
   `maka_schema_costo_ponderado.sql`, y por último `maka_schema_v2.sql`
   (corte/talla en productos, acceso de ventas a Diseños, Pedidos, Pagos
   y el reset total del sistema).
2. Confirmá que tu usuario y el de María ya tienen fila en `perfiles` con
   su `rol` (`admin` / `ventas`).

## Usar en modo desarrollo (correr con npm)

```bash
npm install
npm start
```

Necesita Node.js instalado (v18 o más nueva). En Windows, `npm install`
puede tardar un poco más porque Electron descarga el binario de Chromium.

## Armar el instalador (.deb / .AppImage / .exe) y publicar una versión nueva

El proyecto vive en un repositorio de GitHub
(`https://github.com/TU_USUARIO_DE_GITHUB/maka-desktop` — reemplazar en
`package.json`, en `repository.url` y en `build.publish`). Un workflow de
GitHub Actions (`.github/workflows/release.yml`) compila el instalador de
Linux **y** el de Windows en la nube cada vez que subís un tag de versión,
así que ya no hace falta una PC con Windows para generar el `.exe`.

**Para publicar una versión nueva:**

1. Subí los cambios a GitHub (commit + push) como siempre.
2. Subí la versión en `package.json` (ej. `"version": "0.1.1"`).
3. Creá y subí un tag con ese mismo número, con el prefijo `v`:
   ```bash
   git add package.json
   git commit -m "Versión 0.1.1"
   git tag v0.1.1
   git push origin main --tags
   ```
4. Entrá a la pestaña **Actions** del repositorio en GitHub — vas a ver el
   workflow corriendo (tarda unos minutos, arma Linux y Windows en
   paralelo).
5. Cuando termina, en la pestaña **Releases** del repositorio quedan
   publicados el `.exe` (Windows), el `.deb` y el `.AppImage` (Linux),
   junto con los archivos que usa el auto-updater para detectar la
   versión nueva.

**Para compilar solo en tu máquina** (sin publicar, para probar), seguís
usando:

```bash
npm install
npm run dist
```

Esto genera los instaladores en la carpeta `dist/` de tu propia compu,
pero solo para el sistema operativo en el que lo corrés (Ubuntu genera
`.deb`/`.AppImage`; Windows genera `.exe`) — para eso sigue sirviendo,
pero ya no hace falta para sacar el `.exe`: lo hace GitHub Actions.

## Actualizaciones automáticas

La app revisa sola si hay una versión nueva publicada en GitHub Releases
(al abrir, y cada 4 horas mientras queda abierta):

- **Windows (.exe)**: la descarga sola y, cuando está lista, te pregunta
  si querés reiniciar ya o que se instale la próxima vez que cierres el
  programa. Totalmente automático para María.
- **Linux AppImage**: funciona igual que Windows — descarga e instala
  sola.
- **Linux .deb**: por una limitación de la librería de actualizaciones,
  el `.deb` **no** se actualiza solo. Vas a ver en la consola que hay una
  versión nueva, pero hay que bajar el `.deb` nuevo desde la página de
  Releases del repositorio e instalarlo a mano (`sudo dpkg -i
  nombre-nuevo.deb`, pisa la instalación anterior). Si preferís que se
  actualice solo también en Ubuntu, instalá el `.AppImage` en vez del
  `.deb` (se ejecuta directo, sin pedir contraseña de administrador, y sí
  soporta auto-actualización).

**Importante: el repositorio de GitHub tiene que ser Público** para que
esto funcione sin pasos extra. `electron-updater` consulta y descarga los
instaladores desde la página de Releases del repositorio sin ningún
usuario ni contraseña — si el repo es privado, esa consulta falla salvo
que le metas un token de acceso dentro de la app instalada, lo cual no es
buena práctica (cualquiera podría extraerlo del instalador). No hay nada
sensible en este código: la clave de Supabase que usa la app está pensada
para exponerse del lado del cliente (la seguridad real la da Supabase con
Row Level Security, no el secreto de esa clave), así que hacer público el
repositorio no expone nada delicado del negocio. Si ya creaste el
repositorio como privado, lo podés cambiar en GitHub: **Settings** (del
repositorio) → bajar hasta **Danger Zone** → **Change visibility** →
**Make public**.

## Qué hace esta versión

- Login contra Supabase Auth, con el rol (admin/ventas) leído de la tabla
  `perfiles` — el menú lateral se ajusta solo según el rol.
- **Resumen**: stock de productos, cuáles están bajos, últimas ventas.
- **Materia prima**: solo lectura de stock y costo — el alta es solo para
  dar de alta un material nuevo (código/nombre/unidad/categoría). El
  stock y el costo unitario (promedio ponderado) se actualizan únicamente
  desde **Compras**, nunca a mano.
- **Productos**: alta, edición y baja (desactivar en vez de borrar si ya
  tienen historial), con corte (Slim fit / Clásica / Oversize) y talla
  (infantil 2–16, adulto S–XL) para camisas.
- **Diseños**: catálogo (DTF u otros) para enlazar a productos — visible y
  editable tanto por admin como por ventas (eliminar sigue siendo solo
  admin).
- **Producción**: arma un producto desde su receta, descontando materia
  prima automáticamente.
- **Clientes**: alta (con validación de dirección fiscal), también desde
  Ventas, Presupuestos y Pedidos sin cambiar de pantalla.
- **Ventas**: calcula IVA/exento, muestra el total en Bs en vivo, descuenta
  stock automáticamente, imprime una nota de entrega con el logo, y
  permite registrar los pagos/abonos de cada venta (botón "Pagos").
- **Presupuestos**: arma un presupuesto (sin descontar stock), con estado
  pendiente/aceptado/rechazado/ajustado, se puede enlazar a un Pedido, e
  imprime una nota con el logo.
- **Pedidos**: agrupa el ciclo completo — se crea el pedido, se arma su
  presupuesto desde ahí mismo (botón "Armar presupuesto"), y cuando el
  presupuesto queda aceptado el pedido pasa a "Aprobado" y habilita
  "Registrar venta" para cerrarlo. Cada pedido también tiene su propio
  registro de pagos/abonos (útil para el 50% inicial de los pedidos
  personalizados).
- **Compras**: suma el stock de materia prima y recalcula el costo
  unitario como promedio ponderado.
- **Configuración**: tasa BCV, y un botón para **vaciar todo el sistema**
  (catálogos incluidos) antes de pasar a producción — pide escribir
  "BORRAR TODO" para confirmar, y no toca las cuentas de acceso.
- **Compras** y **Configuración**: solo visibles para admin.

## Lo que falta pulir (para la próxima vuelta)

- Mandar la nota de entrega / presupuesto directo por WhatsApp (hoy se
  imprime o se guarda como PDF manualmente desde ahí).
- Ícono propio para el instalador en vez del logo genérico (ya está
  configurado para usarlo, solo falta ajustarlo si se ve recortado).
