---
title: Política de privacidad (Privacy Policy)
description: Política de privacidad de EpoCanvas Mail — qué información recopilamos, cómo la usamos y protegemos, cuándo y con qué terceros se comparte, y qué controles tienes sobre tus datos.
---

**Fecha de entrada en vigor: 27 de septiembre de 2026　|　Versión: 1.0**

EpoCanvas Mail (el «Servicio» o el «Software») es un **servicio de correo electrónico de código abierto** construido sobre la pila de Cloudflare (Workers, D1, KV, R2) y publicado bajo la licencia MIT. Puede funcionar como un sitio de buzón alojado público (por ejemplo, `mail.epocanvas.com`) o ser autoalojado por cualquier persona como un servicio de correo privado.

El propósito de esta política es simple: **explicar en lenguaje claro a dónde van tus datos, quién puede verlos y qué puedes hacer con ellos.** No mostramos publicidad, no rastreamos a los usuarios y no vendemos datos; cada sección de este documento concreta exactamente lo que significa esa frase.

:::note[Resumen de 30 segundos]
- **Lo que recopilamos**: tu dirección de correo, tu contraseña (guardada únicamente como hash con sal — nadie, incluido el operador, puede recuperar tu contraseña original), el contenido y los adjuntos de los correos que envías y recibes, y tu IP de inicio de sesión junto con la información de tu dispositivo.
- **Lo que nunca hacemos con ello**: ningún perfilado publicitario, ninguna venta a terceros, ningún SDK de estadísticas o rastreo.
- **Quién es el responsable**: el operador de la instancia que utilizas es el «responsable del tratamiento» de tus datos. EpoCanvas Mail, como software de código abierto, no recopila ni sube nada por sí mismo.
- **Siempre puedes**: exportar todos tus correos (JSON), eliminar mensajes y tu cuenta, activar la verificación en dos pasos y revocar las autorizaciones de aplicaciones de terceros.
- **Terceros que debes conocer**: cuando pulsas «Traducir», el texto del correo se envía al servicio de traducción con IA configurado en tu instancia; cuando el operador activa la entrega saliente, el correo externo se envía mediante Resend o Mailjet. Consulta la [sección 6](#6-servicios-de-terceros-y-compartición-de-datos).
- **¿Alguna palabra no te suena?** Salta al [Apéndice B: Glosario de términos clave](#apéndice-b-glosario-de-términos-clave) al final de la página: cada término viene con una explicación en una frase.
:::

## En esta página

1. [¿A quién aplica esta política?](#1-a-quién-aplica-esta-política)
2. [Información que recopilamos](#2-información-que-recopilamos)
3. [A dónde van tus datos: un diagrama](#3-a-dónde-van-tus-datos-un-diagrama)
4. [Cómo usamos la información](#4-cómo-usamos-la-información)
5. [Almacenamiento, cifrado y seguridad](#5-almacenamiento-cifrado-y-seguridad)
6. [Servicios de terceros y compartición de datos](#6-servicios-de-terceros-y-compartición-de-datos)
7. [Funciones de IA](#7-funciones-de-ia)
8. [Conservación y eliminación](#8-conservación-y-eliminación)
9. [Tus controles y derechos](#9-tus-controles-y-derechos)
10. [Comunicaciones y notificaciones](#10-comunicaciones-y-notificaciones)
11. [Niños y menores](#11-niños-y-menores)
12. [Transferencias internacionales de datos](#12-transferencias-internacionales-de-datos)
13. [Guía para el operador autoalojado](#13-guía-para-el-operador-autoalojado)
14. [Cambios en esta política](#14-cambios-en-esta-política)
15. [Contáctanos](#15-contáctanos)

- [Apéndice A: relación con el proyecto de código abierto](#apéndice-a-relación-con-el-proyecto-de-código-abierto)
- [Apéndice B: Glosario de términos clave](#apéndice-b-glosario-de-términos-clave)
- [Apéndice C: Recursos relacionados](#apéndice-c-recursos-relacionados)

## 1. ¿A quién aplica esta política?

«EpoCanvas Mail» tiene dos identidades: primero determina con cuál estás tratando.

| Identidad | Quién | Rol en privacidad |
| --- | --- | --- |
| **El software de código abierto** | El repositorio de código fuente publicado bajo licencia MIT en GitHub | El software en sí **no recopila ni informa de nada** — cero telemetría, cero estadísticas, cero SDK publicitarios integrados |
| **La instancia que utilizas** | La persona o el equipo que opera un sitio EpoCanvas Mail concreto (por ejemplo, el operador del sitio alojado `mail.epocanvas.com`, o un sitio autoalojado por tu empresa o comunidad) | El **responsable del tratamiento** de tus datos, legalmente responsable de las finalidades de recogida, la conservación y la respuesta a las solicitudes de eliminación |

:::tip[En una frase]
El software es una herramienta; el operador es «nosotros». En el sitio donde te registres, el operador de ese sitio es responsable de tus datos conforme a esta política (o su versión adaptada).
:::

Los autoalojadores pueden adoptar esta política directamente como declaración de privacidad de su sitio, sustituyendo los datos de contacto y los detalles operativos según la [sección 13](#13-guía-para-el-operador-autoalojado).

## 2. Información que recopilamos

A diferencia de la mayoría de los servicios de internet, queremos que tengas la visión general antes de los detalles: este servicio **solo recopila lo estrictamente necesario para entregarte el correo**, y se mantiene deliberadamente al margen de todo lo de lo que depende el ecosistema publicitario. Agrupada según cómo entra en el sistema.

### 2.1 Información que tú aportas

- **Dirección de correo**: tu identificador de cuenta (p. ej., `tu@ejemplo.com`). El nombre de usuario toma por defecto la parte local de la dirección y, si ya está ocupado en el sitio, recurre a la dirección completa.
- **Contraseña**: se guarda únicamente como **hash PBKDF2-HMAC-SHA256 (100 000 iteraciones + una sal aleatoria única por usuario)**. Es una transformación unidireccional: ni siquiera el operador puede recuperar tu contraseña original desde la base de datos.
- **Credenciales de verificación en dos pasos (opcional)**: si activas TOTP, el secreto se almacena cifrado con AES-256-GCM; los códigos de respaldo se guardan solo como hashes SHA-256; si registras una clave de acceso (passkey), solo se guarda la clave pública.
- **Detalles del perfil (opcional)**: nombre para mostrar, avatar, biografía, etc. Las imágenes de avatar se suben al servicio de almacenamiento de imágenes configurado por el operador.

### 2.2 El contenido de tus correos

Los mensajes que envías y recibes a través del Servicio —remitente, destinatarios, asunto, cuerpo, marcas de tiempo y otros metadatos, junto con las etiquetas, estrellas, estados de lectura y aplazamientos que apliques— se guardan en la base de datos y el almacenamiento de objetos de la instancia. Los adjuntos se almacenan en Cloudflare R2, en un almacén compatible con S3 configurado por el operador (como Backblaze B2) o, como respaldo, en KV.

### 2.3 Información técnica recopilada automáticamente

- **Registros de registro e inicio de sesión**: cada registro e inicio de sesión guarda tu dirección IP y el User-Agent de tu navegador, de los cuales se deducen el sistema operativo, el navegador y el tipo de dispositivo. Se usan para auditoría de seguridad (p. ej., detectar inicios de sesión inusuales) y control de cuotas.
- **Tokens de sesión**: tras iniciar sesión, se guarda un JWT (válido 30 días) en el localStorage de tu navegador. El Servicio **no usa cookies** y no existen cookies de rastreo entre sitios.
- **Metadatos de solicitudes**: la infraestructura subyacente (Cloudflare) procesa las solicitudes en su red perimetral y puede registrar metadatos de conexión y registros de ejecución conforme a sus propias políticas.

### 2.4 Lo que deliberadamente no recopilamos

Esta lista importa tanto como la anterior:

- ❌ **Sin rastreo publicitario**: ningún SDK de publicidad, ningún perfilado conductual, ninguna cookie entre sitios.
- ❌ **Sin estadísticas de terceros**: ni Google Analytics, ni Plausible, ni ningún seguimiento de eventos.
- ❌ **Sin venta de datos**: tus datos nunca se venden, alquilan ni intercambian con fines publicitarios, bajo ninguna circunstancia.
- ❌ **Sin llamada a casa**: el software de código abierto nunca «informa» de los datos de tu instancia a los autores originales ni a nadie. Los datos de un despliegue tuyo se quedan por completo en tu propia cuenta de Cloudflare.
- ❌ **Sin recolección fuera de límites**: el sistema nunca lee los contactos de tu dispositivo, tu galería, tu ubicación ni los datos de otras aplicaciones; la «información técnica» se limita a los campos relacionados con solicitudes y sesiones listados arriba.

## 3. A dónde van tus datos: un diagrama

![Diagrama de flujo de datos de EpoCanvas Mail: tu navegador llega al Cloudflare Worker por HTTPS; el contenido del correo se guarda en la base de datos D1, en KV y en el almacenamiento de objetos R2; el correo saliente se entrega mediante Resend o Mailjet; las notificaciones de Telegram y la traducción con IA ocurren solo si están activadas o las activas tú](/images/mail/data-flow.svg)

*Leyenda: tus datos de correo descansan dentro de la cuenta de Cloudflare de ti (o de tu operador). Solo los tres canales con interruptor de la derecha —entrega saliente, notificaciones y traducción con IA— sacan datos de la instancia, cada uno con un disparador claro; véanse las secciones 6 y 7.*

## 4. Cómo usamos la información

Cada finalidad tiene un límite claro: fuera de la entrega, la seguridad y las funciones que tú mismo activas, no hay nada más.

| Finalidad | Información utilizada | Notas |
| --- | --- | --- |
| Prestar el servicio de correo | Dirección de correo, contenido de los mensajes, adjuntos | La función principal; sin ella el servicio no puede funcionar |
| Protección de la cuenta y la seguridad | Hash de la contraseña, IP/UA de inicio de sesión, TOTP/Passkey | Detección de inicios de sesión inusuales y bloqueo (5 fallos consecutivos bloquean el acceso 12 horas) |
| Extracción de códigos de verificación (opcional) | Asunto y fragmento del cuerpo de los correos nuevos | Cuando el operador la activa, Workers AI extrae los códigos de verificación para copiarlos con un toque |
| Anuncios del sistema | Dirección de correo, preferencia de idioma | El correo de bienvenida oficial y los anuncios del sitio se entregan en el idioma de tu interfaz |
| Protección antispam | Dirección del remitente, contenido de los mensajes | Los operadores pueden configurar listas negras y reglas de filtrado; la cuarentena de spam se limpia automáticamente a los 7 días |
| Gestión de cuotas de almacenamiento | Tamaño de los adjuntos, uso del buzón | Evita que un solo usuario agote los recursos compartidos |
| Estadísticas operativas agregadas | Recuentos agregados de envío/recepción | Solo un panel global de uso para el operador (volúmenes diarios, tasas de bloqueo) — jamás para perfilar a ninguna persona |

**No** usamos tu información para decisiones automatizadas, perfilado ni ningún fin comercial ajeno al Servicio.

## 5. Almacenamiento, cifrado y seguridad

### 5.1 Dónde residen los datos

Todos los datos se guardan dentro de la propia cuenta de Cloudflare del operador de la instancia: los datos estructurados (usuarios, mensajes, ajustes) en la base de datos D1 (SQLite), las cachés y sesiones en KV, y los adjuntos en R2 o un almacenamiento compatible con S3. Los autores originales de EpoCanvas Mail **no conservan ni acceden** a los datos de ninguna instancia.

### 5.2 El cifrado según los tres modos de correo

El Servicio ofrece tres modos de almacenamiento, elegidos por el operador:

| Modo | Estado de almacenamiento de los mensajes | Quién puede leer tu correo |
| --- | --- | --- |
| **Modo de todo el correo** | Almacenado en texto claro | El operador (administradores) puede leer el correo de todos los usuarios |
| **Modo de privacidad** (predeterminado) | El correo normal se cifra en reposo con AES-256-GCM | Los administradores solo tocan el spam, lo eliminado y lo sin destinatario — no pueden hojear tu bandeja de entrada normal |
| **Modo cifrado** | Todo va cifrado, incluida la papelera | Las interfaces de administración de correo no devuelven ningún correo de usuario |

:::caution[Una nota honesta sobre los límites del cifrado]
Lo anterior es **cifrado en reposo del lado del servidor**: las claves se derivan de las variables de entorno del servidor de la instancia junto con tu ID de usuario. Esto significa que **un operador que controla el servidor y las claves es técnicamente capaz de descifrar**: protege frente a escenarios como el robo directo del archivo de base de datos o la fuga de una instantánea, pero **no es** cifrado de extremo a extremo (E2EE); el operador no está absolutamente imposibilitado para leer tu correo. Si necesitas privacidad que ni siquiera el operador pueda sortear, no confíes en el modo de cifrado de ningún buzón: cifra tú mismo el cuerpo del mensaje con una herramienta E2EE dedicada (como GPG) antes de enviarlo.
:::

### 5.3 Seguridad del transporte y del acceso

- Todo el sitio se sirve por HTTPS/TLS; los puntos sensibles como el inicio de sesión cuentan con limitación de tasa y bloqueo por fallos.
- Verificación en dos pasos: se admite TOTP (RFC 6238) y claves de acceso FIDO2 (huella / rostro); se recomienda encarecidamente activarla.
- Gestión de sesiones: como máximo 10 sesiones simultáneas por cuenta; puedes cerrar sesión en cualquier dispositivo y el token se revoca de inmediato.
- Poderes de los administradores (divulgados con honestidad): según los permisos del rol, los administradores de la instancia pueden restablecer contraseñas, forzar el reinicio de la verificación en dos pasos, suspender o eliminar cuentas, ver las IP de registro y las listas de dispositivos de los usuarios y —en el «modo de todo el correo»— leer el correo de los usuarios. **Elegir una instancia es confiar en su operador**: tómalo tan en serio como elegir un proveedor de correo.

## 6. Servicios de terceros y compartición de datos

Siguiendo la práctica de los grandes proveedores, agrupamos las situaciones en las que los datos salen de la instancia en cuatro categorías, para que juzgues con rapidez la naturaleza de cada compartición:

1. **Encargados de infraestructura** (siempre, en segundo plano): Cloudflare proporciona la ejecución, el almacenamiento y la red: la base de todo;
2. **Funciones configuradas por el operador** (se activan al enviar): los proveedores de entrega saliente llevan tu correo al exterior;
3. **Funciones que activas tú** (solo con tu clic): traducción, subida de imágenes, vinculación de Telegram, inicio de sesión con Linux DO;
4. **Requerimientos legales**: únicamente conforme al procedimiento legal (ver el final de esta sección).

Nuestro principio: **los datos que no necesitan salir, nunca salen; y los que deben salir, la tabla siguiente indica exactamente por qué puerta pasan y qué llevan.**

| Tercero | Rol | Cuándo se activa | Qué se comparte |
| --- | --- | --- | --- |
| **Cloudflare** | Infraestructura (entorno de ejecución, almacenamiento D1/KV/R2, enrutamiento de correo, verificación humana, Workers AI, registros) | Siempre | Metadatos de solicitudes, contenido almacenado, solicitudes de verificación |
| **Resend / Mailjet** | Proveedores de entrega saliente | Solo cuando envías correo a destinatarios fuera de la instancia y el operador ha configurado un canal de entrega | El mensaje completo (destinatarios, asunto, cuerpo, adjuntos) |
| **Telegram** | Notificaciones instantáneas | Solo cuando tú (o el operador) habéis vinculado un bot de Telegram y activado el envío | Configurable: asunto, remitente (ocultable), cuerpo (ocultable), códigos de verificación, enlace de lectura (válido 7 días) |
| **Proveedores de traducción con IA** (endpoint de relevo configurado en la instancia, Cloudflare Workers AI, MyMemory, endpoint público de Google Translate) | Procesamiento de traducción | **Solo cuando pulsas «Traducir»** | El texto del correo a traducir (el pasaje completo cuando es posible; fragmentos recortados en el respaldo); imágenes para la traducción OCR |
| **Servicio de subida de imágenes** | Almacenamiento de avatares e imágenes | Solo cuando subes un avatar u otro elemento similar | El propio archivo de imagen |
| **Linux DO** | Identidad de inicio de sesión de terceros | Solo cuando inicias sesión con una cuenta de Linux DO | El intercambio OAuth devuelve tu identificador de usuario, nombre, avatar y nivel de confianza |
| **Google Fonts** | Carga de tipografías de la interfaz | Cuando tu navegador carga la página | Solicitudes de fuentes (tu IP aparece en los registros de solicitudes de Google) |
| **S3, Turso, etc. configurados por ti/el operador** | Almacenamiento externo | Solo cuando hay almacenamiento o base de datos externa configurados | Adjuntos o copias de datos |

:::tip[Qué significa en concreto «no vendemos datos»]
Ninguno de los terceros anteriores recibe tus datos con fines publicitarios, y con ninguno de ellos mantenemos relación alguna de venta de datos ni de reparto de ingresos publicitarios. Algunos (como Cloudflare y Resend) tratan los datos como «encargados del tratamiento» por instrucciones del operador, cada uno conforme a su propia política de privacidad (consultable en su sitio web).
:::

:::note[Requerimientos legales y cooperación con los reguladores]
Salvo obligación legal o requerimiento conforme al procedimiento legal, el operador no divulgará por iniciativa propia tus datos a terceros. Al recibir tal requerimiento, el operador verificará su legalidad, divulgará solo el mínimo exigido por la ley y te notificará en la medida en que la ley lo permita. Los operadores autoalojados deben añadir sus propios compromisos de cooperación con las autoridades según su jurisdicción.
:::

## 7. Funciones de IA

El Servicio incorpora tres capacidades de IA; sus disparadores y fronteras de datos son:

1. **Extracción de códigos de verificación** (activación opcional del operador): cuando llega un mensaje nuevo, el sistema envía el asunto y los primeros 6000 caracteres del cuerpo a Cloudflare Workers AI para extraer el código de verificación, que puedes copiar desde la lista o desde una notificación de Telegram. Es el único procesamiento de IA que ocurre **sin disparo manual**: si no lo deseas, pide al operador que lo desactive o elige una instancia sin esa función.
2. **Traducción con IA del correo** (la activas tú): al pulsar «Traducir», el texto del correo se envía por fragmentos al endpoint de modelo grande configurado en la instancia (compatible con OpenAI por defecto) con conmutación por error entre modelos; cuando los modelos no están disponibles, se usa MyMemory o el endpoint público de Google Translate como respaldo. **Sin clic, no hay transferencia.**
3. **Traducción OCR de imágenes** (la activas tú): las imágenes con texto se reconocen y traducen; la imagen se envía a los proveedores de IA anteriores. Las imágenes decorativas, los logos y los iconos se omiten automáticamente y jamás salen de la instancia.

Las funciones de IA no están conectadas al entrenamiento de modelos: el sistema no usa tu correo para entrenar ningún modelo y no envía a los proveedores de IA ninguna identidad de usuario más allá del texto necesario para la traducción.

## 8. Conservación y eliminación

| Dato | Conservación |
| --- | --- |
| Correo de la bandeja de entrada normal | Se conserva hasta que lo elimines o hasta una limpieza por cuota |
| Spam | En cuarentena **7 días**; luego pasa a la papelera |
| Correo de la papelera | **Eliminado físicamente** (incluidos los binarios de adjuntos y el índice) por la rutina diaria **7 días después de su recepción** |
| Correo de una cuenta eliminada | La desactivación por autoservicio es una **eliminación lógica**: el correo permanece en la base de datos (técnicamente recuperable) hasta que un administrador lo elimine físicamente; tras la eliminación física, perfil, buzones, mensajes, adjuntos, autorizaciones OAuth y sesiones desaparecen para siempre |
| Registros de inicio de sesión (IP/UA) | Se conservan en el perfil de usuario hasta la eliminación física de la cuenta |
| Tokens de sesión | Revocados en el servidor al cerrar sesión; caducan naturalmente tras 30 días de inactividad |
| Si la instancia cierra | El operador debe avisar con antelación y ofrecer un plazo para exportar tus datos; tras el cierre, los datos se destruyen junto con los recursos de Cloudflare de la instancia (D1/KV/R2) y no se entregan a terceros sin relación |

:::caution[Exporta antes de eliminar]
La eliminación física es irrecuperable. Para llevarte tus datos, usa primero «Ajustes → Exportación de datos» y descarga una copia JSON (tu perfil completo y el cuerpo íntegro de todos los mensajes no eliminados).
:::

## 9. Tus controles y derechos

Estés donde estés, el Servicio incorpora estas herramientas de autoservicio:

- **Portabilidad de datos**: exportación con un clic de tu perfil completo y de todos los mensajes (JSON, legible) desde la página de ajustes.
- **Supresión**: borra mensajes uno a uno (se depuran físicamente a los 7 días), desactiva tu cuenta por ti mismo o pide al operador la eliminación física inmediata.
- **Acceso y rectificación**: consulta y edita en cualquier momento tu nombre para mostrar, avatar, preferencia de idioma y preferencias de correo en los ajustes.
- **Interruptor del perfil público**: tu página de perfil público solo es visible por defecto para ti y los administradores. Al activarla, tu dirección de correo, nombre, avatar, fecha de registro y estadísticas de envío/recepción se vuelven visibles públicamente — **tú decides por completo**.
- **Gestión de autorizaciones de terceros**: revisa cada autorización OAuth en «Aplicaciones de terceros» y revoca cualquiera con un clic; el token de acceso correspondiente caduca de inmediato.
- **Gestión de sesiones**: cierra sesión en cualquier dispositivo para revocar su token.
- **Oposición y exclusión**: desactiva el envío a Telegram, evita las transferencias de IA no pulsando nunca «Traducir» o elige una instancia sin extracción de códigos de verificación.

Si tu jurisdicción (UE/EEE, Reino Unido, California, etc.) te otorga derechos legales adicionales (reclamación, limitación del tratamiento, etc.), contacta con el operador de la instancia para ejercerlos; el operador está obligado a responder en los plazos legales. Sobre los plazos de respuesta, nuestro compromiso: **las acciones de autoservicio en la interfaz (exportar, eliminar, revocar autorizaciones, cerrar sesión) surten efecto de inmediato**; las solicitudes que requieran tratamiento humano (como la eliminación física) recibirán respuesta y se completarán en un plazo de **30 días**. Si el resultado no te satisface, también puedes presentar una reclamación ante la autoridad de protección de datos de tu país.

## 10. Comunicaciones y notificaciones

El Servicio en sí no te envía correo de marketing. Los únicos mensajes oficiales que puedes ver dentro del producto son el correo de bienvenida y los anuncios del sitio del operador (entregados dentro del producto por la cuenta oficial `admin@epocanvas.com`, nunca mediante un servicio externo), además del correo ordinario que te escriban remitentes externos. El envío a Telegram y el reenvío a otros buzones están desactivados por defecto y pueden desactivarse en cualquier momento.

## 11. Niños y menores

El Servicio no está dirigido a menores de 14 años y los operadores no recopilan a sabiendas información personal de niños. Si eres tutor legal y crees que tu hijo nos ha proporcionado información personal, contacta con el operador de la instancia; tras verificarlo, los datos se eliminarán de inmediato. Los operadores autoalojados deberían fijar una edad mínima superior según su jurisdicción y audiencia.

## 12. Transferencias internacionales de datos

El Servicio está construido sobre la red perimetral global de Cloudflare. Los datos pueden almacenarse en la región de Cloudflare elegida por el operador (D1/KV/R2 permiten elegir ubicación) y transitar por cualquier nodo perimetral del mundo; esto significa que pueden tratarse fuera del país del operador. Cloudflare ofrece garantías de transferencia dentro de sus marcos de cumplimiento (como las cláusulas contractuales tipo del RGPD); consulta la documentación oficial de cumplimiento de Cloudflare. Usar una instancia alojada implica que entiendes y aceptas esta característica de la infraestructura.

## 13. Guía para el operador autoalojado

Si has desplegado EpoCanvas Mail bajo tu propio dominio, entonces, jurídica y fácticamente, **tú eres el «nosotros» de tus usuarios**. Por favor:

1. **Sustituye los marcadores de este archivo**: correo de contacto, nombre de la instancia, fecha de entrada en vigor — y revisa la tabla de terceros de la sección 6 (si no has configurado Telegram o Resend, elimina las filas correspondientes).
2. **Elige y divulga con honestidad tu modo de correo**: el modo «todo/privacidad/cifrado» que elijas determina directamente si la redacción de la sección 5.2 es cierta.
3. **Cumple las obligaciones de tu jurisdicción**: si tus usuarios están sujetos al RGPD (UE), al marco del Reino Unido, a la LGPD (Brasil), al CCPA/CPRA (California) o a normas similares, quizá necesites añadir bases legítimas, un DPA, plazos de conservación legales y canales de reclamación locales. Este archivo es un excelente punto de partida redactado por ingeniería, **no es asesoramiento jurídico**: consulta a un abogado colegiado antes de pasar a producción.
4. **Mantén la promesa de cero telemetría**: tu despliegue hereda por defecto la base «sin estadísticas, sin reportes»; si añades estadísticas de terceros por tu cuenta, divúlgalas con honestidad en tu política de privacidad.

## 14. Cambios en esta política

Esta política puede actualizarse a medida que evolucionan las funciones. Los cambios materiales (un nuevo tercero, cambios de conservación, un cambio de modo de cifrado, etc.) se anunciarán con antelación mediante anuncio en el sitio o correo del sistema, actualizando la «fecha de entrada en vigor» y el número de versión en la parte superior de esta página. El uso continuado tras una actualización implica la aceptación; si no estás de acuerdo tras un cambio material, puedes dejar de usar el Servicio y exportar o eliminar tus datos.

Siguiendo la práctica del sector, **el historial no desaparece**: cada revisión importante de esta política queda archivada en el historial de versiones del repositorio de código abierto, donde puedes recuperar y comparar cualquier texto anterior en cualquier momento; se recomienda a los operadores autoalojados mantener el mismo hábito de archivo en su propia documentación.

## 15. Contáctanos

- **Instancia alojada (`mail.epocanvas.com`)**: contacta con el operador por el correo del producto o por correo electrónico: `admin@epocanvas.com`.
- **El software de código abierto en sí**: abre una incidencia en el repositorio de GitHub del proyecto.
- **Sitios autoalojados**: contacta con el operador del sitio que utilizas (sus datos de contacto deberían estar publicados en ese sitio).

## Apéndice A: relación con el proyecto de código abierto

EpoCanvas Mail se construye sobre un proyecto de código abierto bajo licencia MIT y continúa siendo de código abierto. El proyecto original ascendente fue creado por **eoao** (Copyright (c) 2025 eoao); gracias al proyecto original y a todos los colaboradores. Esta política fue redactada por la comunidad EpoCanvas y se publica con el mismo espíritu abierto: **cualquier operador de una instancia de EpoCanvas Mail puede adoptar y adaptar libremente este texto** (espíritu MIT, sin exigencia de atribución), aunque te recomendamos conservar la declaración de autoalojamiento de la sección 13 para mantener la misma transparencia con tus usuarios.

## Apéndice B: Glosario de términos clave

Evitamos la jerga siempre que es posible; cuando un término técnico es inevitable, léelo con las definiciones en lenguaje llano de abajo.

| Término | Explicación en una frase |
| --- | --- |
| **Cuenta** | Tu identidad en una instancia, identificada por tu dirección de correo; la contraseña se guarda solo como hash unidireccional que nadie puede invertir |
| **Instancia (sitio)** | Un despliegue de EpoCanvas Mail que se ejecuta dentro de la cuenta de Cloudflare de una persona o equipo: por ejemplo `mail.epocanvas.com` o un sitio alojado por tu empresa |
| **Operador** | La persona o el equipo que despliega y opera la instancia; el «responsable del tratamiento» de tus datos, es decir, el «nosotros» de esta política |
| **Responsable / encargado del tratamiento** | La parte que decide «por qué recopilar y cómo usar» es el responsable (el operador); la que trata los datos por sus instrucciones es el encargado (p. ej., Cloudflare, Resend) |
| **Datos de contenido** | Los cuerpos, asuntos y adjuntos del correo que envías y recibes, junto con las etiquetas, estrellas y estados de lectura que aplicas |
| **Datos técnicos** | Dirección IP, User-Agent del navegador, tipo de dispositivo, horas de inicio de sesión y campos similares registrados automáticamente para operar y proteger el servicio |
| **localStorage (almacenamiento web)** | Un mecanismo del navegador que conserva datos web en tu dispositivo entre sesiones; el token de inicio de sesión de este servicio vive ahí, no en cookies |
| **Token de sesión (JWT)** | El «pase» emitido tras iniciar sesión: válido 30 días, como máximo 10 sesiones simultáneas por cuenta, revocado al cerrar sesión |
| **PBKDF2** | Un algoritmo de hash de contraseñas; este servicio aplica 100 000 iteraciones con sal para que la contraseña original no pueda deducirse de la base de datos |
| **Cifrado en reposo** | Cifrado aplicado al escribir los datos en disco; las claves de este servicio se derivan de variables de entorno del servidor, así que un operador que controle servidor y claves puede técnicamente descifrar |
| **Cifrado de extremo a extremo (E2EE)** | Un cifrado donde solo remitente y destinatario pueden descifrar; este servicio **no lo ofrece** — si necesitas esa fuerza, cifra el cuerpo tú mismo con GPG o similar antes de enviarlo |
| **Telemetría** | Un comportamiento del software que informa automáticamente de datos de uso a sus desarrolladores; EpoCanvas Mail tiene cero telemetría y no reporta ningún dato de instancia aguas arriba |

## Apéndice C: Recursos relacionados

- **Los Términos del servicio**: junto con esta política forman el acuerdo completo entre tú y el operador (ver la navegación del sitio o los [Términos del servicio](/es/mail/terms-of-service/)).
- **El repositorio de código abierto**: `github.com/shijianus/epomail` — auditoría del código fuente, comentarios por issues y el historial completo de versiones del texto de esta política.
- **El sitio del producto**: `mail.epocanvas.com` — inicia sesión, regístrate y usa el Servicio.
- **Para saber más**: la documentación oficial de Cloudflare para [D1](https://developers.cloudflare.com/d1/), [KV](https://developers.cloudflare.com/kv/), [R2](https://developers.cloudflare.com/r2/) y [Workers AI](https://developers.cloudflare.com/workers-ai/) explica cómo trata los datos la infraestructura.
