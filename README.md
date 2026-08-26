# Trazia

**Traza tu día.**

Trazia es una aplicación web de productividad para estudiantes de ESO y
Bachillerato: horario, notas, hábitos, concentración, diario, libros y cuentas
atrás en un mismo sitio.

Está hecha con HTML, CSS y JavaScript sin frameworks. Los datos viven en
**Supabase** (Auth + PostgreSQL con Row Level Security) y el sitio se publica
como estático en **Netlify**.

---

## Índice

1. [Cómo está montado](#cómo-está-montado)
2. [Puesta en marcha](#puesta-en-marcha)
   1. [Crear el proyecto de Supabase](#1-crear-el-proyecto-de-supabase)
   2. [Ejecutar el SQL](#2-ejecutar-el-sql)
   3. [Configurar Auth](#3-configurar-auth)
   4. [Configurar el correo](#4-configurar-el-correo)
   5. [Google OAuth (opcional)](#5-google-oauth-opcional)
   6. [Variables de entorno](#6-variables-de-entorno)
   7. [Comprobar que el proyecto está listo](#61-comprobar-que-el-proyecto-está-listo)
   8. [Ejecutar en local](#7-ejecutar-en-local)
   9. [Desplegar en Netlify](#8-desplegar-en-netlify)
3. [Estructura del proyecto](#estructura-del-proyecto)
4. [Base de datos y seguridad](#base-de-datos-y-seguridad)
5. [Pruebas](#pruebas)
6. [Identidad de marca](#identidad-de-marca)
7. [Privacidad](#privacidad)

---

## Cómo está montado

- **Sin frameworks.** JavaScript nativo con módulos ES. La única dependencia de
  ejecución es el cliente oficial `@supabase/supabase-js`, que se sirve desde el
  propio dominio (`vendor/supabase-js.esm.js`) para no depender de un CDN
  externo y poder aplicar una CSP estricta.
- **Entrada directa.** `index.html` no es una página de marketing: es una intro
  de tres pantallas que se pasan tocando y acaba en crear cuenta o entrar. Si ya
  hay sesión pasa sola a `app.html`, y justo después de registrarse viene el
  onboarding. Las otras páginas son `auth.html` (registro, acceso y
  recuperación), `app.html` (la aplicación, con rutas por hash) y `reset.html`
  (nueva contraseña desde el enlace del correo).
- **Nada técnico a la vista.** Si la aplicación no puede conectarse, quien la
  usa ve un aviso neutro. La pantalla de configuración es solo para desarrollo.
- **La seguridad vive en PostgreSQL.** Todas las tablas tienen RLS activado y
  políticas por usuario. El navegador nunca es la capa de seguridad.
- **Nada inventado.** La aplicación solo muestra datos que ha creado la persona
  usuaria. Cuando no hay datos, lo dice.

---

## Puesta en marcha

### 1. Crear el proyecto de Supabase

1. Entra en [supabase.com](https://supabase.com) y crea un proyecto nuevo.
2. Elige una región cercana (por ejemplo, Europa) y guarda la contraseña de la
   base de datos que te pida.

### 2. Ejecutar el SQL

1. En el panel de Supabase abre **SQL Editor → New query**.
2. Pega el contenido completo de [`database.sql`](database.sql) y ejecútalo.

Crea las diez tablas, los índices, los disparadores, las políticas de RLS y la
función `delete_account()`. El archivo es idempotente: puedes volver a
ejecutarlo cuando lo actualices sin perder datos.

Para comprobar que ha ido bien, en **Table Editor** deberías ver: `profiles`,
`subjects`, `schedule_items`, `grades`, `habits`, `habit_completions`,
`journal_entries`, `books`, `focus_sessions` y `countdowns`, todas con el
indicador de *RLS enabled*.

### 3. Configurar Auth

En **Authentication → Providers → Email**:

- Deja **Email** activado.
- Decide si quieres **Confirm email**:
  - *Activado* (recomendado): al registrarse hay que confirmar el correo.
    Trazia muestra la pantalla "Confirma tu correo" con la opción de reenviar.
  - *Desactivado*: se entra directamente tras el registro.

En **Authentication → URL Configuration**:

- **Site URL**: la URL pública de tu sitio, sin barra final: `https://trazia.site`.
- **Redirect URLs**: la lista acepta comodines, así que con una entrada por
  entorno es suficiente:

  ```
  https://trazia.site/**
  http://localhost:8788/**
  ```

  Si prefieres no usar comodines, añade una por página:
  `https://trazia.site/app.html` y `https://trazia.site/reset.html`.

Sin esas URLs, los enlaces de confirmación y de recuperación no vuelven a la
aplicación.

Si cambias de dominio, acuérdate de actualizar también `og:url`, `og:image` y
`canonical` en `index.html`.

### 4. Configurar el correo

Supabase trae un servidor de correo de cortesía con un límite muy bajo, pensado
solo para probar. Para uso real, en **Project Settings → Authentication → SMTP
Settings** configura tu propio SMTP (Resend, Postmark, Brevo, SendGrid…).

Plantillas recomendadas en **Authentication → Email Templates**: puedes dejar
las de serie. Trazia acepta los tres formatos de enlace que genera Supabase
(`#access_token`, `?code` y `?token_hash`), así que funcionan tanto las
plantillas antiguas como las nuevas.

### 5. Google OAuth (opcional)

Trazia funciona perfectamente solo con correo y contraseña. Si además quieres
Google:

1. En Google Cloud crea unas credenciales **OAuth 2.0 Client ID** de tipo
   *Web application*.
2. Como *Authorized redirect URI* pon la que te indica Supabase:
   `https://TU-PROYECTO.supabase.co/auth/v1/callback`.
3. En Supabase, **Authentication → Providers → Google**: activa el proveedor y
   pega el *Client ID* y el *Client Secret*.
4. Pon la variable de entorno `GOOGLE_AUTH_ENABLED=true` y vuelve a desplegar.

Mientras `GOOGLE_AUTH_ENABLED` no sea `true`, el botón aparece desactivado con
una nota explicando que requiere configuración. Nunca se simula el acceso con
Google ni se inventan datos de cuentas.

### 6. Variables de entorno

| Variable | Obligatoria | Para qué sirve |
| --- | --- | --- |
| `SUPABASE_URL` | Sí | *Project Settings → API → Project URL* |
| `SUPABASE_ANON_KEY` | Sí | *Project Settings → API → anon public* |
| `GOOGLE_AUTH_ENABLED` | No | `true` solo si has configurado Google OAuth |

`node scripts/generate-config.mjs` lee esas variables (o un archivo `.env`) y
escribe `config.js`. Ese archivo se publica **vacío** en el repositorio: las
claves solo se inyectan en el despliegue.

> La *anon key* es una clave pública pensada para el navegador: sin sesión no da
> acceso a nada porque las políticas RLS lo impiden. La **service role key nunca
> debe aparecer en el frontend**; el generador aborta si detecta que se la han
> pasado.

### 6.1. Comprobar que el proyecto está listo

```bash
node scripts/check-supabase.mjs
```

Con la anon key y sin escribir nada, revisa que el registro esté activado, si
hace falta confirmar el correo, si Google está configurado, que existan las diez
tablas, que **ninguna sea legible sin iniciar sesión** y que esté publicada
`delete_account()`. Termina con código de salida distinto de cero si encuentra
algún problema, así que sirve también en integración continua.

### 7. Ejecutar en local

```bash
cp .env.example .env          # y rellena SUPABASE_URL y SUPABASE_ANON_KEY
node scripts/generate-config.mjs
npx http-server . -p 8788 -c-1    # o cualquier servidor estático
```

Abre <http://localhost:8788>. Tiene que servirse por HTTP (no `file://`) porque
la aplicación usa módulos ES.

Si prefieres no crear el `.env`, abre la aplicación sin configurar: en local
verás un formulario que permite guardar la URL y la anon key en este navegador.

Esa pantalla es solo para desarrollo. **Quien use Trazia nunca la ve**: fuera de
`localhost` aparece un aviso neutro de que la aplicación no está disponible, sin
detalles técnicos. Para verla en otro entorno hay que pedirla con `?setup` en la
dirección, y con `?setup=0` puedes comprobar en local qué se ve en producción.

### 8. Desplegar en Netlify

1. Sube el repositorio a GitHub y en Netlify elige **Add new site → Import an
   existing project**.
2. Netlify lee [`netlify.toml`](netlify.toml), así que la configuración ya viene
   puesta:
   - *Build command*: `node scripts/generate-config.mjs`
   - *Publish directory*: `.`
3. En **Site configuration → Environment variables** añade `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` y, si procede, `GOOGLE_AUTH_ENABLED`.
4. Despliega y copia la URL resultante en la configuración de Auth de Supabase
   (paso 3).

`netlify.toml` añade además cabeceras de seguridad (CSP estricta, `nosniff`,
`X-Frame-Options`, `Referrer-Policy`) y caché larga para `assets/` y `vendor/`.

---

## Estructura del proyecto

```
index.html              Intro a pantalla completa y entrada a la aplicación
auth.html               Registro, inicio de sesión y recuperación
reset.html              Nueva contraseña desde el enlace del correo
app.html                Contenedor de la aplicación
styles.css              Toda la hoja de estilos
config.js               Generado en el build. Nunca contiene claves en el repo
site.webmanifest        Manifiesto para instalarla como aplicación
netlify.toml            Build, redirecciones y cabeceras
database.sql            Esquema completo, RLS y función de borrado de cuenta

js/
  supabase.js           Cliente, sesión y traducción de errores
  auth.js               Pantallas de acceso y validaciones
  reset.js              Cambio de contraseña
  app.js                Shell, rutas, navegación y sesión
  store.js              Estado en memoria y acceso a datos
  compute.js            Cálculos puros (medias, rachas, agenda)
  forms.js              Editores compartidos (hojas modales)
  backup.js             Exportar e importar copia de seguridad
  format.js             Fechas, números y textos en español
  validation.js         Validación de nombre, correo y contraseña
  ui.js                 Iconos, marca, avisos, diálogos y estados
  setup.js              Aviso de no disponible y configuración de desarrollo
  welcome.js            Intro que se pasa tocando
  boot-redirect.js      Entra directo si ya hay sesión guardada
  views/                Una vista por sección
    onboarding.js  home.js  schedule.js  grades.js  habits.js
    journal.js  books.js  focus.js  countdowns.js  settings.js  parts.js

assets/                 Símbolo, logo, favicon, iconos e imagen Open Graph
vendor/                 Cliente de Supabase empaquetado (generado)
scripts/                Generadores y comprobaciones
tests/                  Pruebas de RLS y de extremo a extremo
```

### Scripts

| Comando | Qué hace |
| --- | --- |
| `node scripts/generate-config.mjs` | Genera `config.js` desde el entorno |
| `node scripts/generate-icons.mjs` | Regenera los PNG de icono y la imagen Open Graph |
| `node scripts/vendor-supabase.mjs` | Reempaqueta `vendor/supabase-js.esm.js` |
| `node scripts/check-supabase.mjs` | Comprueba que tu proyecto de Supabase está listo |
| `node scripts/lint.mjs` | Importaciones sin usar y acciones sin manejador |
| `node --experimental-vm-modules scripts/check-syntax.mjs` | Sintaxis de todos los módulos |

Los dos últimos generadores necesitan dependencias de desarrollo puntuales:
`npm install --no-save @supabase/supabase-js esbuild`.

---

## Base de datos y seguridad

Diez tablas, todas ligadas al UUID del usuario de Supabase Auth:

| Tabla | Contenido |
| --- | --- |
| `profiles` | Nombre, curso, modalidad, objetivo de nota y preferencias del temporizador |
| `subjects` | Asignaturas con su color |
| `schedule_items` | Clases semanales, exámenes y entregas (`kind`) |
| `grades` | Notas con su peso |
| `habits` / `habit_completions` | Hábitos, días en que tocan y días completados |
| `journal_entries` | Diario privado |
| `books` | Lista de lectura con su estado |
| `focus_sessions` | Sesiones de concentración guardadas |
| `countdowns` | Cuentas atrás |

Cada tabla tiene **Row Level Security** activado y cuatro políticas
(`select`, `insert`, `update`, `delete`) que comparan `auth.uid()` con la
columna propietaria. Un usuario no puede leer, crear, modificar ni borrar filas
de otro, ni siquiera manipulando las peticiones: el filtro lo aplica PostgreSQL,
no el JavaScript. El rol `anon` no recibe ningún permiso sobre los datos.

`delete_account()` es la única función `security definer`: borra al usuario que
la invoca (`auth.uid()`) y, en cascada, todos sus datos.

---

## Pruebas

### Row Level Security y restricciones

Con un PostgreSQL local:

```bash
createdb trazia_test
psql -d trazia_test -f tests/bootstrap-auth.sql   # emula el esquema auth de Supabase
psql -d trazia_test -f database.sql
psql -v ON_ERROR_STOP=1 -d trazia_test -f tests/rls.sql
```

`tests/rls.sql` comprueba, entre otras cosas, que el perfil se crea solo al
registrarse, que una persona no ve ni toca los datos de otra, que no puede
insertar filas a nombre de otra, que las notas fuera de 0–10 se rechazan y que
`delete_account()` borra la cuenta entera.

### Extremo a extremo

`tests/mock-supabase.mjs` levanta un servidor que habla el protocolo de Supabase
(GoTrue + PostgREST) contra ese PostgreSQL real, sirviendo además los archivos
del proyecto. Es solo para pruebas locales: no firma JWT ni envía correos.

```bash
cp tests/config.test.js config.js
DATABASE_URL='postgresql://usuario@/trazia_test' node tests/mock-supabase.mjs 8788 &
node tests/e2e.mjs        # necesita playwright
node scripts/generate-config.mjs   # deja config.js como estaba
```

`tests/e2e.mjs` recorre con un navegador real el flujo completo: intro,
validaciones del registro, onboarding entero, inicio, notas y cálculo de medias,
hábitos y rachas, horario en día y semana, diario, libros, cuentas atrás,
temporizador (comprobando que el tiempo avanza, se pausa y sobrevive al cambio
de pantalla), exportación e importación, cierre de sesión, vuelta a entrar,
recuperación de contraseña completa (abriendo el enlace, cambiándola y
comprobando que la antigua deja de valer), diseño en móvil, tablet y
escritorio, nombres accesibles y ausencia de errores en consola.

`tests/rls.sql` necesita una base de datos recién creada, porque inserta
usuarios de prueba con UUID fijos.

---

## Identidad de marca

- **Símbolo**: dos barras diagonales redondeadas del mismo grosor y un punto.
  La principal en azul `#574CEF`, la secundaria en lavanda `#9473E8` y el punto
  en naranja `#FE7444`, sobre `#030826` cuando lleva fondo. Esos son los colores
  del logo original y no se retocan. Funciona en color, en una sola tinta
  (`assets/symbol-mono.svg`) y como icono de aplicación.
- **Wordmark**: `trazia`, siempre en minúsculas, con el punto de la i en coral.
- **Usos**: símbolo + wordmark, símbolo solo o wordmark solo.

| Color | Hex |
| --- | --- |
| Navy | `#172554` |
| Azul | `#4056B5` |
| Lavanda | `#A99BE8` |
| Coral | `#F47F68` |
| Crema | `#FAF7F0` |
| Gris texto | `#5F6472` |

Lenguaje visual: **cuaderno**. Papel cuadriculado, pegatinas con borde de tinta
y sombra dura (sin desenfoque), rotulador para lo que importa y monoespaciada
para las etiquetas. Nada de degradados ni cristalitos.

Tipografías: **Nunito** (wordmark), **Archivo** (titulares e interfaz),
**Shantell Sans** cursiva (acentos de rotulador) y **Space Mono** (etiquetas).

El sistema está pensado para poder crecer a productos físicos —cuadernos,
estuches, pegatinas, cajas de bienvenida— sin rehacer nada: el símbolo aguanta
tamaños pequeños y la paleta funciona en tinta plana. No hay ecommerce ni nada
parecido implementado en la aplicación.

---

## Privacidad

Trazia se dirige también a menores de edad, así que guarda lo mínimo para
funcionar: el correo con el que se accede, el nombre que la persona escribe, su
curso y lo que ella misma crea dentro de la aplicación. No hay analítica de
terceros, ni seguimiento, ni contenido social.

- El diario y el resto de secciones son privados: las políticas de RLS impiden
  que nadie más los lea.
- **Exportar mis datos** genera un JSON con todo lo que hay guardado.
- **Eliminar cuenta** borra la cuenta y sus datos en cascada.
