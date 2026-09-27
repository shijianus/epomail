---
title: Términos del servicio (Terms of Service)
description: Términos del servicio de EpoCanvas Mail — reglas de cuenta, límites de uso aceptable, derechos sobre el contenido, exenciones de responsabilidad y notas sobre la licencia de código abierto que conviene conocer antes de usar el servicio de correo.
---

**Fecha de entrada en vigor: 27 de septiembre de 2026　|　Versión: 1.0**

Bienvenido a EpoCanvas Mail (el «Servicio»). Estos términos constituyen el acuerdo entre tú y el operador del Servicio en relación con su uso. Dedica unos minutos a leerlos: hemos procurado un lenguaje lo más claro posible y cubrimos, en un solo lugar, qué puedes hacer, qué no está permitido y qué ocurre cuando algo falla.

:::note[Resumen de 30 segundos]
- **Qué es el Servicio**: un servicio de correo de código abierto (licencia MIT), autoalojable, construido íntegramente sobre Cloudflare; puedes usarlo para enviar y recibir correos, gestionar varios buzones e intercambiar adjuntos.
- **Tu cuenta, tu responsabilidad**: cuida tu contraseña y activa la verificación en dos pasos; 5 intentos fallidos consecutivos bloquean el acceso 12 horas.
- **La línea roja**: nada de spam, nada de contenido ilegal, nada de ataques contra el servicio o terceros. Las infracciones pueden acabar en suspensión y eliminación de la cuenta.
- **Tu correo es tuyo**: solo lo tratamos para entregarlo y almacenarlo. La papelera se depura físicamente 7 días después de la eliminación: exporta antes de despedirte.
- **El Servicio se ofrece «tal cual»**: software de código abierto, disponibilidad con el máximo esfuerzo, sin acuerdo de nivel de servicio (SLA).
- **¿Alguna palabra no te suena?** Salta al [Apéndice: glosario rápido](#apéndice-glosario-rápido) al final de la página para explicaciones en lenguaje llano.
:::

## En esta página

1. [Alcance y definiciones](#1-alcance-y-definiciones)
2. [Descripción del Servicio](#2-descripción-del-servicio)
3. [Cuentas y seguridad](#3-cuentas-y-seguridad)
4. [Política de uso aceptable](#4-política-de-uso-aceptable)
5. [Tu contenido y licencia](#5-tu-contenido-y-licencia)
6. [Entrega saliente y servicios de terceros](#6-entrega-saliente-y-servicios-de-terceros)
7. [Disponibilidad y cambios](#7-disponibilidad-y-cambios)
8. [Conservación y fin de la cuenta](#8-conservación-y-fin-de-la-cuenta)
9. [Fuerza mayor](#9-fuerza-mayor)
10. [Exención de garantías (TAL CUAL)](#10-exención-de-garantías-tal-cual)
11. [Limitación de responsabilidad](#11-limitación-de-responsabilidad)
12. [Indemnización](#12-indemnización)
13. [Propiedad intelectual y licencia de código abierto](#13-propiedad-intelectual-y-licencia-de-código-abierto)
14. [Términos para operadores autoalojados](#14-términos-para-operadores-autoalojados)
15. [Cambios en estos términos](#15-cambios-en-estos-términos)
16. [Contáctanos](#16-contáctanos)

- [Apéndice: glosario rápido](#apéndice-glosario-rápido)

## 1. Alcance y definiciones

- **«El Servicio»**: toda la funcionalidad que se ejecuta en una instancia de EpoCanvas Mail, incluida la aplicación web, la API abierta y los componentes relacionados.
- **«El operador / nosotros»**: la persona o el equipo que ha desplegado y opera la instancia que utilizas. Para la instancia alojada `mail.epocanvas.com`, es el equipo de operaciones de EpoCanvas; para una instancia autoalojada, quien la haya desplegado.
- **«Tú»**: toda persona física u organización que se registre, inicie sesión o use de otro modo el Servicio.
- **Aplicación de doble vía**: EpoCanvas Mail es software de código abierto y cualquiera puede desplegar su propia instancia. Estos términos son una **plantilla general**: las instancias alojadas los aplican directamente, y los operadores autoalojados pueden adaptarlos como términos de su sitio. Donde te registres, formalizas el acuerdo con el operador de ese sitio.
- **Términos adicionales**: al usar funciones de terceros (entrega saliente, traducción con IA, Telegram, inicio de sesión con Linux DO, etc.), también aceptas los términos del tercero correspondiente (ver la [sección 6](#6-entrega-saliente-y-servicios-de-terceros)); los asuntos de privacidad se rigen por la [Política de privacidad](/es/mail/privacy-policy/).

## 2. Descripción del Servicio

![Diagrama de límites de responsabilidad de EpoCanvas Mail: el proyecto de código abierto ascendente (licencia MIT) aporta el código fuente; la instancia que utilizas es operada de forma independiente y su operador asume la responsabilidad; tu cuenta y tus datos de correo residen en los recursos de Cloudflare de esa instancia](/images/mail/self-host-responsibilities.svg)

*Leyenda: los autores ascendentes del software de código abierto no operan ningún servicio de correo ni responden de la conducta de ninguna instancia; no existe contrato de servicio entre tú y el proyecto ascendente.*

El Servicio incluye: gestión multi-buzón, correo interno y externo, adjuntos, etiquetas y estrellas, cuarentena antispam, aplazamientos, búsqueda, traducción con IA (opcional), reconocimiento de códigos de verificación (opcional), notificaciones de Telegram (opcional), verificación en dos pasos (TOTP/Passkey), plataforma OAuth y exportación de datos. Las funciones reales dependen de lo que tu instancia tenga activado.

**La identidad de código abierto**: el Servicio se construye sobre un proyecto de código abierto publicado bajo la licencia MIT y continúa siendo de código abierto. Eso significa: el código fuente es público y auditable; puedes desplegarlo tú mismo para obtener las mismas capacidades; y el software se ofrece «tal cual» (véase la sección 10).

## 3. Cuentas y seguridad

1. **Registro veraz**: registrarse solo requiere una dirección de correo de recepción válida y una contraseña. No suplantes a otras personas ni uses dominios que no tienes derecho a usar.
2. **Custodia de credenciales**: eres responsable de tu contraseña, de tus credenciales de verificación en dos pasos y de tus tokens de API. Las acciones realizadas con tus credenciales se consideran tuyas.
3. **Verificación en dos pasos**: se recomienda encarecidamente activar TOTP o claves de acceso. En las instancias con «modo de correo cifrado», el operador puede exigir la verificación en dos pasos conforme a su política de seguridad.
4. **Protección del inicio de sesión**: 5 fallos de contraseña consecutivos bloquean el acceso 12 horas; una cuenta mantiene como máximo 10 sesiones activas, y puedes cerrar sesión en cualquier dispositivo para revocar su token de inmediato.
5. **Nombres reservados**: identificadores como `admin` están reservados por el sistema y no pueden registrarse por usuarios ordinarios.
6. **Claves de registro**: los operadores pueden configurar la instancia para exigir una clave de registro o cerrar el registro: es una facultad de gestión propia de la instancia.
7. **Requisitos de elegibilidad**: debes tener la edad mínima indicada en la sección 11 de la [Política de privacidad](/es/mail/privacy-policy/) y asegurarte de que tu registro y uso cumplen las leyes que te afectan.

## 4. Política de uso aceptable

### 4.1 Te comprometes a no usar el Servicio para

**Conductas ilícitas y dañinas**

- Enviar, almacenar o distribuir contenido que infrinja las leyes de tu jurisdicción o la del operador, incluido, sin limitación: material de explotación sexual infantil (tolerancia cero: lo detectado se elimina y se colabora con la ley), extremismo violento, tráfico de drogas y armas, fraudes y páginas de phishing;
- Distribuir malware, virus o ransomware, o enviar correos diseñados para robar credenciales.

**Spam y abuso**

- Enviar correos comerciales masivos no solicitados (spam / UBE / UCE), marketing a destinatarios que no han consentido, o usar el Servicio para calentamiento de buzones o bombardeo masivo de verificación de direcciones;
- Registrar cuentas en masa de forma programada, eludir la verificación humana (Turnstile), las claves de registro o los límites de cuota;
- Usar el Servicio como trampolín de reenvío anónimo o piscina de envíos desechables, o volver a registrarte repetidamente para eludir sanciones.

**Ataques e interferencias**

- Escanear, sondear o forzar por fuerza bruta este Servicio o sistemas de terceros; intentar acceder sin autorización a buzones ajenos, interfaces de administración o datos de otros usuarios;
- Consumir la traducción con IA, los adjuntos, la API u otros recursos compartidos hasta degradar el uso normal de los demás usuarios;
- Acosar, difamar o ejercer acoso legal contra Cloudflare o la comunidad de código abierto ascendente.

**Lesión de derechos**

- Infringir la propiedad intelectual, la privacidad o la imagen de terceros; falsificar la identidad del remitente para hacerse pasar por personas u organizaciones;
- Infringir los términos de servicio de terceros (Cloudflare, Resend, Mailjet, Telegram, etc.).

### 4.2 Consecuencias

Según la naturaleza y gravedad de la infracción, el operador puede: advertir → limitar funciones → poner en cuarentena antispam → suspender la cuenta → eliminar físicamente la cuenta y todos sus datos. Si hay conductas ilícitas, el operador puede conservar las pruebas necesarias y cooperar con las autoridades competentes. Si tu conducta acarrea al operador una sanción de Cloudflare o de un proveedor ascendente, el operador se reserva el derecho de reclamarte (véase la sección 12).

### 4.3 Reclamaciones y reportes

Si crees que la medida es errónea, contacta con el operador por los canales de la [sección 16](#16-contáctanos); el operador lo revisará y responderá en un plazo razonable. También te animamos a reportar infracciones de otros o problemas de seguridad (fuentes de spam, páginas de phishing, intentos de acceso no autorizado): los reportes de buena fe se tratan todos con seriedad; el contenido sospechoso de ser ilícito (sobre todo material de explotación sexual infantil) se reportará a las autoridades competentes conforme a la ley.

## 5. Tu contenido y licencia

1. **La propiedad es tuya**: los correos que envías y recibes, y sus adjuntos, te pertenecen, y la responsabilidad también. El operador no usará tu contenido con fines publicitarios, de entrenamiento de modelos ni de cesión a nadie.
2. **Una licencia de tratamiento limitada**: para proporcionarte almacenamiento, entrega, búsqueda, notificaciones y (opcional) traducción, otorgas al operador una licencia de tratamiento técnico **estrictamente limitada a la operación del Servicio**. Cuando dejes de usar el Servicio y tus datos se eliminen, la licencia termina.
3. **Respondes de lo que envías**: cada correo que envías habla en tu nombre. Los litigios y responsabilidades derivados de tu contenido enviado son tuyos.
4. **El límite de la revisión de contenido**: el operador en principio no revisa tu correo normal; pero en las instancias en «modo de todo el correo» los administradores pueden técnicamente leer todo el correo (en modo de privacidad, solo el spam/eliminado/sin destinatario) y actuarán ante denuncias o requerimientos legales. Entiende el modo de una instancia antes de elegirla.

## 6. Entrega saliente y servicios de terceros

1. **La entrega saliente depende de terceros**: el correo dirigido fuera de la instancia se entrega por el canal configurado por el operador (Cloudflare Email Workers, Resend o Mailjet). La entrega de terceros puede retrasarse, rebotar o ser bloqueada por el proveedor receptor; el operador no garantiza el resultado de la entrega saliente.
2. **Las funciones opcionales arrastran términos de terceros**: las notificaciones de Telegram, la traducción con IA, el inicio de sesión con Linux DO, el almacenamiento S3 externo y funciones similares se rigen, al usarlas, además por los términos de los respectivos terceros.
3. **La plataforma OAuth**: si autorizas a una aplicación de terceros mediante OAuth, los alcances (openid / profile / email) y los controles de revocación se describen en la sección 9 de la Política de privacidad; el uso que la aplicación haga de tus datos se rige por sus propios términos.

## 7. Disponibilidad y cambios

- **Con el máximo esfuerzo, sin SLA**: el Servicio funciona sobre la infraestructura perimetral gratuita o de pago por uso de Cloudflare. El operador realiza esfuerzos razonables por la disponibilidad, pero no promete un 100 % de tiempo en línea, plazos de entrega ni plazos de recuperación.
- **Funciones en evolución**: el proyecto de código abierto itera rápido; las funciones pueden añadirse, cambiar o retirarse. Los cambios materiales que afecten a la eliminación de datos se anunciarán con antelación.
- **Mantenimiento e interrupciones**: el operador puede suspender parte o todo el Servicio por actualizaciones, correcciones o gestión de abusos; las indisponibilidades causadas por Cloudflare o por proveedores ascendentes de IA/entrega no constituyen incumplimiento del operador.
- **Funciones experimentales**: las funciones marcadas como «experimentales» o en fase de prueba (como la traducción OCR de imágenes) se ofrecen «tal cual», pueden ser inestables y pueden cambiar o retirarse en cualquier momento: el riesgo de depender de ellas para trabajo crítico es tuyo.

## 8. Conservación y fin de la cuenta

1. **Tú la terminas**: puedes desactivar tu cuenta en los ajustes en cualquier momento o pedir su eliminación al operador. La desactivación invalida tus sesiones de inmediato; el correo pasa a un estado de eliminación lógica recuperable hasta que un administrador realice la eliminación física.
2. **Limpieza de rutina**: el spam en cuarentena 7 días pasa a la papelera; el correo de la papelera se elimina físicamente (adjuntos incluidos) 7 días después de su recepción mediante la rutina diaria. **La eliminación es irrecuperable: exporta antes una copia JSON mediante «Exportación de datos».**
3. **Lo termina el operador**: si incumples la [sección 4](#4-política-de-uso-aceptable), el operador puede suspender o terminar tu acceso y actuar conforme a la sección 4.2. La política para cuentas largamente inactivas la publica el operador.

## 9. Fuerza mayor

Las interrupciones del servicio y las pérdidas de datos causadas por fuerza mayor —desastres naturales, guerra, actos gubernamentales, fallos de la red troncal, ciberataques masivos o el cese o cambio de política de proveedores de terceros (Cloudflare, Resend, Mailjet, Telegram, servicios de IA, etc.)— no son responsabilidad del operador cuando se hayan realizado los esfuerzos razonables.

## 10. Exención de garantías (TAL CUAL)

El Servicio (incluido su software) se proporciona **«tal cual» y «según disponibilidad»**, sin garantías de ningún tipo, expresas o implícitas, incluidas las de comerciabilidad, idoneidad para un fin concreto y no infracción. Esto refleja el alcance de exención de la **licencia MIT** del software: **en ningún caso el operador ni los autores de código abierto ascendentes serán responsables de reclamación, daño u otra responsabilidad alguna derivada del Servicio o de su uso, o relacionada con ellos.**

## 11. Limitación de responsabilidad

En la máxima medida permitida por la ley, la responsabilidad acumulada del operador contigo no excederá el mayor de: (a) lo que hayas pagado efectivamente al operador en los últimos 12 meses (normalmente cero en instancias gratuitas); (b) 100 USD. El operador no responde de daños indirectos, pérdida de datos, lucro cesante ni pérdida de reputación. **Haz tú copias de seguridad de los correos importantes en otro lugar.**

## 12. Indemnización

Si tu incumplimiento de estos términos, tu lesión de derechos de terceros o tu conducta ilícita exponen al operador, a los autores ascendentes o a sus filiales a reclamaciones de terceros (incluidas las sanciones y los costes de gestión de quejas de Cloudflare u otros proveedores), aceptas indemnizarlos y mantenerlos indemnes en la medida permitida por la ley.

## 13. Propiedad intelectual y licencia de código abierto

1. **Licencia del código**: el código fuente del software se concede bajo **licencia MIT**, Copyright (c) 2025 eoao (ascendente) y los colaboradores de este proyecto. La licencia MIT rige el código en sí; estos términos rigen el uso como Servicio; ninguno sustituye al otro.
2. **Agradecimiento**: el Servicio se construye sobre el proyecto de código abierto ascendente (autor eoao); gracias al proyecto ascendente y a la comunidad de código abierto.
3. **Tu contenido**: los derechos sobre los avatares, nombres y demás elementos que subas siguen siendo tuyos o de sus titulares originales.
4. **Cortesía de marca**: si conservas el nombre y el logotipo «EpoCanvas Mail» en tu instancia autoalojada, indícalo claramente como una instancia comunitaria desplegada de forma independiente para evitar confusiones.

## 14. Términos para operadores autoalojados

Si eres el operador de una instancia autoalojada:

- Asumes la plena responsabilidad del operador de tu instancia: hacer cumplir el uso aceptable, responder a las reclamaciones de los usuarios, adaptar la política de privacidad y estos términos, y cumplir los deberes legales de conservación y colaboración;
- Debes copiar, adaptar y publicar este documento en tu sitio, sustituyendo los datos de contacto y el responsable;
- Los autores ascendentes y los mantenedores de este proyecto **no asumen ninguna responsabilidad solidaria por cómo operas tu instancia**;
- Si cobras a tus usuarios, asegúrate tú mismo de cumplir los requisitos locales de actividad, fiscales y de protección al consumidor.

## 15. Cambios en estos términos

Estos términos pueden revisarse a medida que evoluciona el Servicio. Los cambios materiales se anunciarán mediante anuncio en el sitio o correo del sistema, actualizando la fecha de entrada en vigor y la versión en la parte superior de esta página. Seguir usando el Servicio tras la entrada en vigor de un cambio implica su aceptación; si no estás de acuerdo, deja de usarlo y exporta o elimina tus datos. Las revisiones importantes anteriores quedan archivadas en el historial de versiones del repositorio de código abierto y pueden consultarse en cualquier momento.

## 16. Contáctanos

- **Instancia alojada (`mail.epocanvas.com`)**: correo del producto o correo electrónico a `admin@epocanvas.com`;
- **El proyecto de código abierto**: incidencias en el repositorio de GitHub;
- **Sitios autoalojados**: el contacto del operador publicado en ese sitio.

---

## Apéndice: glosario rápido

| Término | Explicación en una frase |
| --- | --- |
| **El Servicio / instancia** | Toda la funcionalidad que se ejecuta en un despliegue de EpoCanvas Mail (aplicación web, API y componentes) |
| **Operador** | Quien despliega y opera esa instancia: el «nosotros» de estos términos y la contraparte responsable de tus datos y tu uso |
| **Alojado / autoalojado** | Alojado = `mail.epocanvas.com`, operado por el equipo de EpoCanvas; autoalojado = una instancia desplegada por ti o por un tercero |
| **Tu contenido** | El correo, los adjuntos y el perfil que envías, recibes y subes; la propiedad y la responsabilidad son tuyas |
| **Licencia de tratamiento** | El permiso técnico limitado que otorgas al operador para que el almacenamiento, la entrega, la búsqueda, las notificaciones y funciones similares funcionen (sección 5) |
| **Política de uso aceptable** | Los límites de lo permitido y prohibido en la sección 4, con las consecuencias graduales de la sección 4.2 |
| **Eliminación lógica / física** | Lógica = marcada como eliminada, recuperable por los administradores; física = retirada del almacenamiento junto con adjuntos e índice, irrecuperable |
| **SLA** | Acuerdo de nivel de servicio (compromisos de disponibilidad y respuesta); este Servicio se ofrece con el máximo esfuerzo, sin SLA |

---

*Estos términos, junto con la [Política de privacidad](/es/mail/privacy-policy/), forman el acuerdo completo entre tú y el operador. Este documento es una plantilla general redactada por la comunidad de código abierto y no constituye asesoramiento jurídico; los operadores deberían consultar a un abogado colegiado antes de un uso comercial.*
