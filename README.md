# Biblioteca STC PWA

Aplicación estática construida con HTML, CSS y JavaScript puro. Utiliza Firebase Authentication y Cloud Firestore; no utiliza Firebase Storage.

## Configuración inicial de Firebase

1. En Firebase Console abre el proyecto `comedor-a85c2`.
2. En **Authentication > Sign-in method** habilita:
   - Anónimo.
   - Correo electrónico/contraseña.
3. Crea la base de datos de Cloud Firestore.
4. Copia el contenido de `firestore.rules` en **Firestore Database > Rules** y publícalo.
5. En **Authentication > Users**, crea las cuentas de los administradores con correo y contraseña.

La aplicación no permite registrar cuentas desde el navegador. Las reglas reconocen como administrador únicamente a una cuenta autenticada mediante correo y contraseña; los usuarios de producción utilizan el proveedor anónimo.

## Colecciones

- `books`: catálogo, inventario y URL de portada.
- `requests`: solicitudes realizadas por usuarios anónimos autenticados.
- `loans`: préstamos aprobados y devoluciones.

Las imágenes pueden publicarse en `assets/portadas/` y registrarse como `./assets/portadas/archivo.jpg`, o utilizar una URL HTTPS pública. No se suben archivos a Firebase.

## Importar el catálogo inicial

La versión 1.2.2 corrige la asignación de las 141 portadas usando su posición vertical real dentro del catálogo de Excel.

1. Entra a la aplicación como administrador.
2. Abre **Administrar libros**.
3. Presiona **Importar catálogo inicial**.

La importación usa el código del libro como ID del documento. Los libros ya existentes se omiten y no se duplican. Los estados `OCUPADO` y `NO ESTA EN BIBLIOTECA` se importan sin disponibilidad; los demás registros se consideran disponibles.

## Probar localmente

Los módulos de Firebase y el service worker requieren HTTP; no abras `index.html` directamente como archivo. Desde esta carpeta puedes usar cualquier servidor estático, por ejemplo:

```powershell
npx serve .
```

## Publicar en GitHub Pages

Publica el contenido de esta carpeta como raíz del sitio, o configura GitHub Pages para servir la carpeta correspondiente. Todos los recursos usan rutas relativas y funcionan dentro de un subdirectorio del repositorio.

En Firebase Console agrega el dominio de GitHub Pages (`usuario.github.io`) en **Authentication > Settings > Authorized domains**.

## Manejo de versiones

La versión se define una sola vez en `js/version.js`:

```js
scope.APP_VERSION = '1.2.2';
```

Al publicar cambios incrementa ese valor. El badge de Inicio, **Ayuda > Acerca de** y el nombre de caché del service worker tomarán automáticamente la nueva versión. Al activarse, el service worker elimina las cachés anteriores.

## Consideraciones del plan Spark

La solución utiliza Authentication y Firestore dentro de sus cuotas gratuitas. No depende de Firebase Storage ni de Firebase Hosting. Revisa en Firebase Console el consumo y los límites vigentes del proyecto.
