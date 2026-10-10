# Clase en directo

Web para dar clase al estilo Nearpod: subes tu presentación en PDF, intercalas actividades, el alumnado entra con su cuenta del colegio y un código, y solo ve lo que tú proyectas. Al terminar tienes un informe por alumno.

## Qué hace

- **Lecciones:** subes un PDF (cada página es una diapositiva), las reordenas y añades actividades entre ellas: test, encuesta, respuesta abierta, respuesta numérica con unidad y tolerancia, y dibujo en blanco o sobre una diapositiva.
- **Clase en directo:** el alumnado entra con su cuenta @nervion.salesianas.org y el código (o escaneando el QR). Solo se admiten cuentas de ese dominio. Tú avanzas con los botones, las flechas del teclado o un pasador de diapositivas; ellos no pueden ir por su cuenta.
- **Control de actividades:** se abren solas al llegar a ellas. Puedes cerrarlas y mostrar los resultados a la clase, de forma anónima en el proyector.
- **Seguimiento:** ves quién está conectado, quién ha respondido y cuántas veces ha salido cada alumno de la pestaña.
- **Informe:** tabla por alumno con respuestas, aciertos, hora de entrada y salidas de la pestaña. Se descarga en CSV (se abre en Excel) o se imprime.

## Puesta en marcha (unos 20 minutos, una sola vez)

### 1. Crea el proyecto de Firebase

1. Entra en https://console.firebase.google.com con tu cuenta de Google y pulsa **Crear un proyecto**. Puedes desactivar Google Analytics.
2. En **Authentication → Comenzar → Método de inicio de sesión**, activa **Google**. (El acceso **Anónimo** ya no hace falta: déjalo desactivado.)
3. En **Realtime Database → Crear base de datos**, elige la ubicación **Bélgica (europe-west1)** para que los datos queden en la UE, y empieza en **modo bloqueado**.
4. En la pestaña **Reglas** de Realtime Database, borra lo que haya, pega el contenido de `database.rules.json` y pulsa **Publicar**.
5. En el engranaje **Configuración del proyecto → Tus apps**, pulsa el icono web `</>`, ponle un nombre y regístrala (no hace falta Firebase Hosting). Copia los valores de `firebaseConfig` en el archivo `config.js`. Si no aparece `databaseURL`, cópiala de la parte superior de la pestaña **Datos** de Realtime Database.

### 2. Publica la web en GitHub Pages

1. Crea una cuenta en https://github.com si no la tienes, y un repositorio nuevo **público** (por ejemplo, `clase`).
2. Pulsa **Add file → Upload files** y sube todos los archivos de esta carpeta, con `config.js` ya rellenado.
3. En **Settings → Pages**, elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`. En un par de minutos tendrás la dirección, del tipo `https://tuusuario.github.io/clase/`.
4. Vuelve a Firebase: **Authentication → Configuración → Dominios autorizados → Agregar dominio** y añade `tuusuario.github.io`.

### 3. Pide al coordinador TIC que autorice la app en Google Workspace

Google bloquea por defecto que el alumnado menor de 18 años inicie sesión en aplicaciones externas. La persona que administra Google Workspace del colegio tiene que permitirla una vez:

1. En la consola de Google Firebase, ve a **Authentication → Método de inicio de sesión → Google** y copia el **ID de cliente web** (acaba en `.apps.googleusercontent.com`).
2. Pásaselo al administrador. En la consola de administración de Google (admin.google.com) debe ir a **Seguridad → Acceso y control de datos → Controles de API → Gestionar el acceso a aplicaciones de terceros**, añadir la aplicación por ese ID de cliente y marcarla como **De confianza** para las unidades organizativas del alumnado.
3. La app solo pide nombre y correo (los permisos básicos de inicio de sesión), sin acceso a Drive, Gmail ni Classroom.

Sin este paso, el alumnado verá un aviso de Google de "Acceso bloqueado". Tú, si entras con una cuenta personal o de profesorado, no lo notarás.

Si el dominio del alumnado no fuera exactamente `nervion.salesianas.org`, cámbialo en `config.js` y en `database.rules.json` (aparece cuatro veces).

### 4. Autorízate como docente

1. Abre `https://tuusuario.github.io/clase/profesor.html` y entra con Google.
2. La web te mostrará tu identificador. Cópialo.
3. En Firebase, **Realtime Database → Datos**, pasa el ratón por la raíz y pulsa **+**. Crea la clave `teachers`, y dentro de ella otra clave con tu identificador y el valor `true` (booleano).
4. Recarga la página. Si algún compañero quiere usarla, repite el paso con su identificador.

## Uso en clase

1. En `profesor.html`, crea una lección, sube el PDF (desde PowerPoint o Google Slides: Archivo → Descargar como PDF) y añade actividades.
2. Pulsa **Empezar clase**. Se genera un código de 6 caracteres.
3. Pulsa **Abrir vista para proyectar** y lleva esa ventana al proyector. El código y el QR aparecen abajo; ocúltalos cuando todos hayan entrado.
4. Dirige la clase desde la ventana de control. Las flechas del teclado y los pasadores de diapositivas funcionan en las dos ventanas.
5. Al acabar, pulsa **Finalizar clase** y revisa el informe.

El alumnado solo necesita abrir `https://tuusuario.github.io/clase/` en el navegador.

## Cómo corrige sola

- **Test:** compara con la opción marcada. Las encuestas no se corrigen.
- **Respuesta numérica:** acepta coma decimal y potencias como `3,2·10^4` o `3,2e4`. Da por buena cualquier respuesta dentro de la tolerancia en porcentaje. Si pides la unidad, la compara respetando mayúsculas (`kg` no es `Kg`, igual que `mS` no es `ms`) y admite `m/s^2` o `m/s²`.
- **Respuesta abierta:** solo se corrige si indicas respuestas válidas, sin tener en cuenta mayúsculas, tildes ni el punto final.
- **Dibujo:** no se corrige; lo ves en la galería y en el informe.

## Privacidad

Al tratarse de menores, conviene comentarlo con la persona responsable de protección de datos del centro antes de usarla.

- El alumnado entra con su cuenta del colegio: se guardan su nombre y su correo corporativo, que ya gestiona el centro. No se pide ningún otro dato ni se accede a su Drive, Gmail o Classroom.
- Nadie de fuera del dominio puede entrar en una clase, ver las diapositivas ni enviar respuestas: lo impiden las reglas de la base de datos, no solo la web.
- Los datos se guardan en tu proyecto de Firebase, en la UE si elegiste Bélgica, y solo tú puedes leer respuestas e informes.
- En cada informe tienes **Eliminar datos de esta clase** para borrarlos cuando ya los hayas pasado a tu cuaderno.
- La clave `apiKey` de `config.js` no es secreta: la seguridad está en las reglas de la base de datos.

## Límites del plan gratuito de Firebase

- 100 conexiones simultáneas: sobra para una clase, o para varias a la vez.
- 1 GB de datos guardados y 10 GB de descarga al mes. Una presentación de 20 páginas ocupa unos 2–4 MB, y cada alumno la descarga una vez por clase.

## Si algo falla

- **La página se queda en "Cargando…":** ábrela desde la dirección de GitHub Pages, no con doble clic en el archivo.
- **Error al entrar con Google:** revisa que el dominio de GitHub Pages esté en los dominios autorizados.
- **El alumnado ve "Acceso bloqueado" o "Esta app está bloqueada":** falta el paso 3 (autorizar la app en la consola de administración de Google).
- **No se abre la ventana de Google en el móvil o la tablet:** hay que permitir las ventanas emergentes para la web.
- **"Permission denied" al guardar:** comprueba que publicaste las reglas y que tu identificador está en `teachers` con valor `true` (booleano, no texto).
