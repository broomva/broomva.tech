# Módulo 2: Tecnologías SQL y NoSQL


# Tipos de Datos

Los datos se pueden clasificar según diversos criterios:

- Según sus estructura
- Según su contenido
- Según su procedencia

## Clasificación Según Estructura

### Datos No Estructurados

Los datos no estructurados suponen de forma mayoritaria el numero de datos que hay en internet. Alguna características son:

- La información no tiene un modelo predefinido
- Gran volumen de información, generalmente en texto plano
- El contenido agrega diferentes tipos de datos en un mismo registro

Algunos ejemplos de datos no estructurados son:

- Imágenes satelitales
- Datos científicos
- Imágenes y videos
- Volcados de documentación empresarial
- Datos de redes sociales
- Contenido de paginas web
- Archivos de Log

### Datos Semi Estructurados

Utilizan cierta información que se establece a partir de categorías y etiquetas. Los archivos de datos basados en algún lenguaje de tipo mark-up como XML o JSON son ejemplos de datos semi estructurados. Están almacenados en registros y son fácilmente identificables, sin embargo, los repositorios de datos semi-estructurados pueden contener ambigüedades e inconsistencias

### Datos Estructurados

Los datos pertenecen a un modelo de datos abstracto:

- Organiza los elementos principales en entidades
- Define las relaciones entré las entidades

Cada elemento del conjunto de datos tiene asignado un contenido semántico en función de su relación con el resto de entidad y suelen formar parte de bases de datos relaciones; su gestión se realiza mediante motores de bases de datos como MySQL o MariaDB.

# Anonimización

Este proceso consiste en la eliminación de las referencias de cualquier identificador personal de un conjunto de datos. Esto se aplica sobre un conjunto de datos para conservar la privacidad de los individuos a los que se hace referencia. Es necesario aplicar este proceso cuando se quieren hacer públicos datos con identificadores como nombres, direcciones o códigos postales. En general, se debe intentar eliminar cualquier información que pueda identificar al individuo.

## Tipos de Anonimización

- Eliminación de datos
- Cifrado de datos sensibles: Depende del uso de una clave para el cifrado y el coste del proceso
- Enmascaramiento u ofuscación: Se pretende mantener la estructura de la fuente de datos original. Los tipos se conservan, sus valores no.

La anonimización no asegura la protección absoluta. Cualquier conjunto de datos lo suficientemente extenso puede ser desanonimizado usando información del contexto. Con datos sensibles, como la salud, hay que limitar los campos sensibles respecto a la privacidad y aplicar técnicas mas complejas.

# Técnicas SQL y NoSQL

Usar una cola de peticiones entre el servicio web y la base de datos, para liberar la carga de múltiples y simultáneas consultas a la base de datos, haciendo que se vayan agregando elementos individuales de forma paulatina. Sin embargo, si el numero de consultas sigue aumentado, una solución es usar múltiples servidores de base datos y distribuir las tablas entre todas. A esto se le llama particionado horizontal o sharding, donde cada servidor queda con un subconjunto de la tabla, distribuyendo la carga de operaciones de escritura entre múltiples maquinas. El sharding incluye algunas implicaciones como que se necesita tener un método para particionar la tabla de forma adecuada de tal forma que los segmentos queden distribuidos de forma que se balancee bien la carga. Se necesita también un método para distribuir los valores a su partición correspondiente (se usa generalmente una función hash).

Dentro de las limitación de la tecnología SQL se encuentra que es difícil gestionar la tolerancia a fallos; si un segmento falla, no se pueden escribir resultados. Ademas, la complejidad de la gestión se deriva a la aplicación, que necesita calcular el segmento correspondiente a cada valor. Por otro lado, cualquier error que inserte valores en el segmento equivocado será difícil de gestionar haciendo entonces que las tareas de mantenimiento se vuelvan complejas.

## Propiedades Deseadas de NoSQL

Gestion de datos automatica de:

- La naturaleza distribuida de los repositorios de datos
- La gestion de las particiones de los datos
- La insercion escalable de grandes cantidades de datos
- La realizacion de consultas de forma escalable con baja latencia
- La gestion de tolerancia a errores y robustez del sistemas
- De proposito general para difrentes tipos de aplicaciones

### HBase

Es una base de datos no relacional que tiene caracteristicas como:

- Persistencia
- Distribuida
- Datos Ordenados por la clave
- Multidimencional
- Baja Densidad (sparse)
- Esta constituida sobre sistemas de archivos distribuidos
    - Los datos estan en diferentes servidores
    - Se pueden replicar los datos en diferentes nodos
- Los datos estan almacenados en orden alfabetico de un valor (clave)
- Es multidimencional
    - Los datos se organizan en familias
    - Cada familia puede almacenar cualquier numero de columnas

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-17_at_22.52.29.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-17_at_22.52.29.png)

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-17_at_22.52.52.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-17_at_22.52.52.png)

Mediante estos sistemas, se logra Auto-sharding, escalabilidad automática:

- Región: Un rango de filas de datos contiguas que se almacenan juntas
- Una región forma una unidad mínima de  balanceo de carga
- Cuando una región crece demasiado, se divide en dos partes iguales
- Cada servidor almacena un cierto numero de regiones y se mantiene balanceado de forma automática

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-17_at_22.56.59.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-17_at_22.56.59.png)

# Consistencia, Fiabilidad y Escalabilidad

## Consistencia de Datos

El objetivo es garantizar que los datos almacenados en la db son veraces siempre. Cada vez que realiza una operación en la base de datos, el resultado no invalida el estado previo. La consistencia se puede mantener cuando se realizan nuevas operaciones asegurando un nuevo estado consistente o volviendo al anterior estado consistente.

### Modelos de Consistencia

- **Estricta:** Los cambios en los datos son atómicos y tienen un efecto de forma instantáneo. No se considera una operación por acabada hasta que no se completen los cambios en todos los nodos o servidores. En sistemas muy grandes esto tiene un coste muy alto
- **Secuencia:** Cada cliente ve los cambios en el orden en que se produjeron
- **Causal:** Los cambios aparecen siguiendo su orden causal
- **Eventual:** Los cambios se propagan por todo el sistema cuando no haya cambios pendientes por realizarse
- Débil: ****No hay garantías de que los cambios se propaguen de forma causal

### Gestionar Errores en Datos Remotos

Puede haber un momento en nuestro sistemas de datos distribuido que tenemos dos versiones, dos documentos, dos variables tienen diferentes valores en dos servidores. ¿Qué hacemos en ese momento?

- Orientarse a mantener la consistencia, es decir, no dejamos que se propague ningún cambio en las variables o documentos hasta que se haya propagado a todas las instancias la ultima versión
- Orientarse a mantener la disponibidad, es decir, retomar la ultima version disponible de los datos, aunque no sea en realidad la última
- Mientras no se produzcan errores se puede mantener la disponibilidad y consistencia

## Teorema CAP

Abarca propiedades de los sistemas compartidos y distribuidos de datos. En caso de fallo solo podemos tener sistemas que cumplan dos de estas tres propiedades:

- Consistencia de Datos: **C**onsistency
- Disponibilidad del Sistema: **A**vailability
- Tolerancia al Particionado de la Red de Interconexión: **P**artitioning

## Consistencia Eventual

Modelo de consistencia débil que permite a los clientes actualizar cualquier replica en cualquier momento, mientras que garantiza que todas las actualizaciones se realizan en todas las replicas en un orden que preserva la consistencia. 

## Herramientas y Requerimientos

- Para Disponibilidad y Tolerancia a particionado:
    - Cassandra DB
- Para Consistencia y Disponibilidad:
    - HBASE, MongoDB

# Tecnologias de DB NoSQL

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-29_at_21.05.24.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-29_at_21.05.24.png)

## Tecnologias Representativas

### HBASE

Se le conoce como la "base de datos de Hadoop", por lo tanto, es muy conveniente, si lo que se desea es realizar una integración rápida con el resto de herramientas de Hadoop, también se entiende perfectamente con el sistema de ficheros HDFS. Es de tipo "wide column store" y es un proyecto "open source" escrito en Java, que parte de la implementación de BigTable. Consideraríamos este sistema como un "sistema CP", es decir que permite consistencia de datos y tiene tolerancia a la fragmentación o a la partición.

### Cassandra

Cassandra está pensado como un sistema orientado al rendimiento operativo, y con clara vocación a ofrecer una alta escalabilidad y disponibilidad. Es de tipo "wide column store", al igual que HBase, y también está escrita en Java. Pese a que no se le conoce como la "base de datos de Hadoop", presenta muy buena integración con Hadoop, es muy fácil integrarlo así como con otras herramientas de Big Data. Respecto al teorema CAP, consideramos que es un sistema AP, es decir que proporciona una alta disponibilidad de los datos, y también tiene tolerancia a la partición.

### MongoDB

Está muy orientada a la simplicidad en el desarrollo. Así como Cassandra tiene una clara vocación de simplicidad operativa, en MongoDB la simplicidad es en el desarrollo, y es por eso que está adquiriendo altas cuotas de popularidad. Es de tipo "document store", está escrita en C++, también presenta muy buena integración con el resto de herramientas Big Data, y es un sistema CP como HBase, es decir, permite consistencia de datos y tolerancia a particiones.

## Modelos de Datos

### HBASE

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-29_at_21.15.30.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-29_at_21.15.30.png)

En primer lugar, tenemos la clave de fila, tenemos un time stamp, y luego vemos que los datos vienen referenciados de la siguiente manera, que es, nombre de familia de columna, dos puntos, nombre de calificador de columna, lo cual nos indica más concretamente qué tipo de datos tenemos en cada uno de los registros.

Como podemos ver en este ejemplo, existirían varias celdas vacías de datos. Esto en la realidad no es así. Y una representación más aproximada de la realidad vendría a ser como ésta, tipo JSON:

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-29_at_21.16.55.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-29_at_21.16.55.png)

Las celdas que parecen vacía no ocupan espacio en memoria, no existen. La existencia de datos para cada columna no es requerida.

Fisicamente, los datos están almacenados por familias de columnas (row key, ts, col family).

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-29_at_21.19.13.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-29_at_21.19.13.png)

Teniendo en cuenta esto, se puede observar que HBASE hace particionamiento horizontal, de modo que cada fragmento viene identificado por una clave de fila inicial y una clave de fila final.

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-29_at_21.20.42.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-29_at_21.20.42.png)

Una vez tenemos particionados los datos, estos datos se distribuyen en distintas regiones. Esto corresponde a una distribución en distintas ubicaciones lógicas. Cada una de esta región está gobernada por un servidor de región, y cada conjunto de regiones que están gobernadas por un servidor de región pueden estar distribuidas geográficamente.

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-29_at_21.21.58.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-29_at_21.21.58.png)

En este esquema, hay dos componentes esenciales para el funcionamiento de HBASE. Por un lado, tenemos HMaster, que como su nombre indica, será el demonio principal del sistema, y tenemos Apache Zookeeper, este será el elemento de coordinación distribuida esencial también para el funcionamiento de toda la arquitectura. En este esquema, existen dos componentes esenciales para que la arquitectura de HBASE funcione. Estos son, Zookeeper y HMaster. HMaster, como su nombre lo indica, es el proceso principal que se encarga de la asignación y reasignación de las distintas regiones efectúa las tareas DDL, de la base de datos, estos son las tareas de, de data definition, pues como son la creación y eliminación de tablas, y mantenimiento de la coherencia de los datos y también se ocupa de todo lo relacionado con el balanceo de carga. 

El componente Zookeeper es esencial en el sentido de que es el coordinador principal de todo el sistema. Si os fijáis, en este esquema de interacciones, un cliente cuando realiza cualquier petición lo primero que ha de hacer es ponerse en contacto con Zookeeper para obtener la dirección del servidor de región asociado a los datos a los que desea acceder. Luego, una vez obtenida estas direcciones, el cliente podrá realizar todas las operaciones de tipo data management, es decir, lectura de registros, actualización, etcétera, directamente hablando con los servidores de región. A su vez, Zookeeper mantiene la configuración global del sistema y monitoriza las caídas de todos los componentes de ellos. La relación entre Zookeeper y HMaster a su vez es muy estrecha, de manera que HMaster y Zookeeper se intercambian continuamente hard bits, y HMaster informa en todo momento del estado de cada uno de los region servers a Zookeeper.

### Cassandra

Muchos expertos lo consideran una suma de características de Google Big Table y de Amazon Dinamo. Cassandra responde a un modelo de datos de familias de columnas. Lo que sí que hace especialmente particular al sistema Cassandra es su arquitectura. Como vemos en este esquema, podemos ver cómo todos los nodos que contienen datos se distribuyen topológicamente en forma de anillo.

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_20.09.31.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_20.09.31.png)

De manera simplificada, podemos decir que un cliente cuando tiene una petición se puede dirigir a cualquiera de estos nodos, y en el momento en el que se dirige a cualquiera de estos nodos, este nodo asume la responsabilidad de coordinador para esta petición exclusiva. Cada nodo dentro del anillo de Cassandra, conoce el estado y los datos que contienen el resto de nodos. Por lo tanto, el nodo coordinador de la petición lo que hará es redirigir la consulta a los nodos que contienen esta información. Y una vez obtenida la respuesta, redirigirá esta al propio cliente.

¿Cómo gestiona todo esto el sistema Cassandra? Bueno, en primer lugar, tenemos que tener en cuenta que Cassandra realiza un particionamiento de los datos basado también en clave, de manera análoga a como lo hacía HBASE, pero con una sutil diferencia que es que cada clave de fila, a cada clave de fila le aplica una función Hash mediante la cual obtenemos un valor Hash, que le vamos a llamar número de token. Y por lo tanto, cada porción de datos lo vamos a denominar token. De este modo, Cassandra maneja un rango de valores de token que va de menos dos a la 63, a dos a la 63 menos uno.

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_20.10.33.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_20.10.33.png)

Vamos a imaginar, para poder comprenderlo de manera más rápida, que este rango va de cero a 999. Bien, pues este rango completo se distribuiría uniformemente entre todos los nodos del anillo. De modo, que tenemos que hay nodos que tienen un rango de cero a 199, de 200 a 399, así hasta llegar hasta 999. Una vez realizamos la función Hash a la porción de datos, a una porción de datos indeterminada, si obtenemos por ejemplo un valor 700, pues este, este dato o esta porción de datos, iría a parar al nodo que tiene asignado ese rango de valores, el rango de valores donde cae este valor obtenido por la función Hash. Además de esto, Cassandra permite o aumenta la disponibilidad de los datos vía un sistema de réplicas. Así que, además del nodo que contiene la información original, esta información es replicada en n nodos del mismo anillo. 

Cassandra tiene un sistema particular de coordinación entre nodos. Como podemos ver, esta arquitectura de anillo se aleja completamente del esquema tradicional Master-Slave, aquí no hay master ni slave. Y de hecho, hemos visto que cada petición puede ser atendida por cualquiera de los nodos. ¿Cómo sabe, por lo tanto, cada nodo qué información tiene el restos de nodos? Bien. Cassandra implementa lo que se denomina el protocolo gossip, que consiste en una comunicación constante nodo a nodo. Es decir, cada nodo tiene comunicación constante y frecuente con cada uno de los nodos restantes del anillo. En esta comunicación, y mediante este protocolo, pues se intercambia la información de estado, de número de tokens, de tamaño disponible, etcétera. 

Esta arquitectura es escalable y la podemos repetir entre distintas ubicaciones. De modo que podemos tener lo que se conoce como distintos data centers que, por ejemplo, podrían estar compuestos, en este caso cada uno por un solo anillo. Y los data centers los agruparemos conceptualmente en clusters. Los clusters, obviamente, pueden estar distribuidos también geográficamente.

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_20.55.14.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_20.55.14.png)

De este modo, el esquema se repite, pero con la peculiaridad de que la réplica de datos puede estar distribuida entre todos o varios data centers. De manera que el cliente, cuando hace una petición y se es asignado un nodo coordinador de esta petición, este nodo, además de preguntar a los nodos que figuran en su mismo anillo, preguntará a un nodo de otro data center que a su vez se convertirá en coordinador de esa petición para ese data center. De este modo, obtendremos una respuesta de un determinado nodo y satisfaremos la petición. Esta arquitectura que ofrece Cassandra está claramente orientada a disponer de una gran disponibilidad de los datos y en realidad es mucho más compleja.

Algo importante que podemos observar dentro de los distintos detalles de configuración es que a pesar de que Cassandra siempre lo hemos categorizado como un sistema AP dentro del teorema CAP, nosotros podemos llegar a ofrecer una serie de consistencia más o menos elevada. Es decir, esta consistencia es ajustable y Cassandra implementa distintos métodos para aumentar la consistencia, básicamente basados en lo que denominamos quórum. De modo que, por ejemplo, nosotros para poder dar una petición por satisfecha, dependiendo del número de réplicas que existan en cada uno de los anillos de los data centers, será necesario que la respuesta, será necesario obtener una respuesta coherente de n nodos. Y esa n es lo que constituirá el quórum que podemos configurar de antemano. De este modo, como vemos, a más quórum, pues una mayor consistencia. A menor quórum, menor latencia, pero posibilidad de conflictos de consistencia.

### MongoDB

MongoDB es una base de datos, como you comentamos, orientada a documentos, es decir, el modelo de datos responde al concepto de documento, donde los datos son mucho más vastos que los que venimos analizando en los paradigmas de familias de columnas. Los documentos en MongoDB se codifican mediante un tipo de datos llamado BSON, que es como un JSON pero en binario. Esto se hace porque de este modo podemos, MongoDB puede ofrecer el tipado de los datos que contiene cada documento. De manera que podemos tener campos con valores enteros, campos con valores string, campos dobles, podemos tener arrays de distintos tipos de datos, etcétera.

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_21.03.44.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_21.03.44.png)

Estos documentos, a su vez, se pueden apilar en lo que se denominan colecciones. Y como veremos, las bases de datos contienen colecciones de documentos y estas colecciones además podrán ser subdividas en chunks o fragmentos. 

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_21.08.34.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_21.08.34.png)

Algo interesante también a considerar respecto a este modelo de datos es la relación que se establece entre los distintos documentos. De manera que Mongo proporciona una manera de relacionar los datos que bien puede ser mediante enlaces, es decir, utilizando los propios identificadores internos que se generan para cada documento, o bien con documentos incrustados. Esto es incrustar directamente un subdocumento como valor de un determinado campo. 

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_21.49.16.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_21.49.16.png)

MongoDB ofrece un sistema de réplica de datos muy consistente. El sistema que ofrece en cuanto a réplica de datos es denominado replica set y consiste en que varias instancias corren en distintos nodos y contienen los mismos datos, siguiendo un esquema master/slave

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_21.52.47.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_21.52.47.png)

Solamente el nodo primario atenderá las peticiones de lectura y escritura, y cuando se atienda una operación de lectura, se responderá e inmediatamente después se realizará una replicación en los componentes secundarios. El sistema master/slave se mantiene gracias a que entre todos los componentes, tanto secundarios como el componente master, se envían frecuentemente señales de heartbeat. De manera que si tenemos que un nodo primario cae, automáticamente los nodos secundarios organizan una votación en la que una cierta cantidad de nodos se postulan como candidatos, se lleva a cabo una votación de manera automática para ver quién es el nuevo master y una vez se ha decidido este master, pues adquiere el rol y, por lo tanto, atenderá a las peticiones de lectura y escritura y realizará las réplicas correspondientes en los nodos secundarios

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_21.56.47.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_21.56.47.png)

Un concepto muy importante en el que los desarrolladores de Mongo han puesto mucha atención es en el concepto de sharding o particionamiento. Sharding, you hemos visto en videos anteriores que es una técnica que permite escalar horizontalmente, dividiendo los datos en varios servidores y, en el caso de Mongo, esta división se realiza utilizando lo que denominan una shard key, que vendría a ser análogo a las claves de fila que utilizábamos en el esquema de HBase. De esta manera, podemos ver que una simple colección de datos la podemos dividir entre varios shards, dividiendo de esta manera lo que son los distintos documentos contenidos en una misma colección.

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_22.23.16.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_22.23.16.png)

En un esquema de sharding de MongoDB existen tres componentes principales, que son el enrutador, los servers de configuración y los shards en sí. Los shards en sí serán las particiones lógicas o físicas que contendrán los datos. El router, que estará dirigido por el proceso llamado mongos, se encargará de atender las peticiones y, como su nombre indica, pues de enrutarlas al shard correspondiente. Y todos los datos relativos a la configuración de este sistema se mantendrán en un conjunto de servidores de configuración.

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_22.44.52.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_22.44.52.png)

Una configuración típica en los sistemas de MongoDB, pues vendría a ser como esta, en la que vemos que podemos disponer de varios enrutadores, varios servidores de configuración y varios shards.

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_22.45.50.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_22.45.50.png)

Aquí podemos ver que tanto los shards como los servidores de configuración están contenidos dentro de un replica set, lo cual aumenta la consistencia y la disponibilidad. Y la división entre varios enrutadores lo que nos permite es tener distintos servidores de aplicación y de este modo balancear la carga de peticiones que vienen desde el exterior. 

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_22.49.59.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_22.49.59.png)

Otro aspecto interesante a tener en cuenta es que, aparte de este esquema de particionado o de sharding que Mongo puede realizar automáticamente, además Mongo cada subconjunto que provenía de una colección y que está ubicado en un determinado shard, lo puede dividir a su vez en lo que conocemos como distintos chunks.

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_22.50.38.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_22.50.38.png)

A partir de esta manera de fragmentar los datos, lo que nos permite Mongo es aumentar las prestaciones en cuanto a latencia de cada una de las operaciones, permite aumentar la escalabilidad del sistema global y también nos permite balancear la carga en cuanto a los datos que contiene cada uno de los shards. De manera que Mongo puede decidir automáticamente migrar determinados conjuntos de chunks de un shard a otro. De este modo, tenemos bien equilibrada la carga de datos que existe en cada una de las particiones.

### ¿Cual Escoger?

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_22.51.48.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_22.51.48.png)

Es importante a la hora de tener en cuenta es, primero os centréis dentro del teorema CAP, ¿qué necesita vuestro sistema? Como hemos visto, tanto HBase como MongoDB los clasificaríamos dentro de un sistema CP, mientras que Cassandra sería un sistema AP.

Podemos ver pues que HBase y Cassandra comparten las ventajas de que tienen una capacidad de responder a búsquedas de manera muy rápida. Además, sabemos que HBase está plenamente integrado con el ecosistema Hadoop y con el sistema de ficheros HDFS. Cassandra tiene o proporciona una alta disponibilidad y además, según los expertos, es muy fácil de administrar.

Por su lado, MongoDB, es un sistema que está muy orientado a los desarrolladores, de manera que es muy fácil de aprender y es muy fácil de aplicar en el desarrollo. Y tiene, a diferencia de HBase y Cassandra, una API de alto nivel para tratar los datos. Además, proporciona unas estrategias bastante completas de balanceo particionado de la carga y también de alta escalabilidad. Podemos ver que la complejidad en cuanto a la administración en MongoDB es más alta.

## Intro a DB Analiticas y Orientadas a Grafos

Hasta hace poco más de una década, las bases de datos relacionales, tradicionales, eran utilizadas para resolver los problemas de las empresas en su día a día, lo que podemos denominar como soluciones operativas, es decir, mantenimiento de registros, mantenimiento del stock de productos, mantenimiento de cuentas de usuario, para dar acceso o no a usuarios registrados, etcétera. ¿Qué ocurre? Que, como venimos viendo durante este curso, el aumento de los datos está siendo masivo. Y, claro, a raíz de esto se nos plantea la posibilidad de que, además de todas estas soluciones operativas, podemos realizar muchas más acciones con estos datos que nos pueden llegar a dar un conocimiento muy valioso. De esta manera, surge una necesidad que es, a partir de este ingente cantidad de datos, cómo vamos a poder analizarlos de manera que obtengamos información valiosa. Está claro que necesitamos un proceso en el que se nos depure y se nos transformen estos datos de manera que, finalmente, obtengamos un conjunto de datos elaborado que nos permita tomar decisiones realmente importantes y que van mucho más allá de lo que es el mantenimiento del día a día de nuestro negocio. En esto es en lo que se basa el concepto de "business intelligence", este es un concepto que se entiende muy bien teniendo en cuenta estas dos frases que pongo como ejemplo:

- Disponer de un sistema de bases de datos relacionales no significa disponer de un sistema de soporte a la toma de decisiones
- Hace diez años les pude decir cuántos Doritos vendimos en el oeste en Mississippi". "Hoy no sólo les puedo decir eso mismo, sino cuántos vendimos en California, en el Condado de Orange, en la ciudad de Irvine, en el supermercado local Von's, durante una promoción especial, al final del pasillo 4, los jueves"

Como podéis ver, aquí ha habido una evolución muy clara en cuanto a lo que es el concepto de dato y el concepto de la información que podemos extraer de los datos que hemos ido almacenando. De esta manera, la información actualmente está fragmentada y es escudriñada hasta obtener datos de increíble valor para los negocios. ¿Cómo atendemos a la necesidad de convertir estos datos en información valiosa?Mediante un análisis efectivo y eficiente de esta gran y masiva cantidad de datos. ¿Cuáles son los inconvenientes a los que nos enfrentamos para realizar este análisis, teniendo en cuenta que los sistemas operacionales normales están en continuo funcionamiento y es difícil interaccionar con ellos? Tenemos que tener en cuenta que los inconvenientes importantes que nos podemos encontrar son que esta interferencia con el sistema operacional nos lleva a la ralentización, tanto en lo que son las acciones del día a día, como en nuestro proceso de adquisición de este conocimiento.

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_23.01.26.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_23.01.26.png)

Teniendo en cuenta todos estos inconvenientes y en aras de intentar resolverlos, se desarrolló el concepto de "Data Warehouse". El "Data Warehouse" lo podemos ver como un gran almacén de datos donde prima la estructura de la información, es decir, la clave del "Data Warehouse" que nos va a permitir obtener y extraer un conocimiento valioso es que la información está bien estructurada y es muy fiable. Para resolver estos inconvenientes, un "Data Warehouse" presenta las siguientes características.

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_23.03.14.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_23.03.14.png)

En primer lugar, es un sistema integrado, como he dicho, tiene una estructura consistente y los datos bien homogeneizados. Por otro lado, además, los datos están caracterizados temáticamente, es decir, tenemos una categorización que nos permite acceder a distintos tipos de datos de manera efectiva con tal de poder realizar estudios bien orientados hacia nuestros intereses. Otra característica muy importante es que un "Data Warehouse" contiene los datos de manera histórica, es decir, los datos que contiene un "Data Warehouse" registran la tendencia y evolución de ellos mismos. Esto está relacionado con la no volatilidad de estos datos, es decir, la información en este "Data Warehouse" simplemente es introducida y leída, pero jamás se modifica. Esto es lo que permitirá que podamos analizar toda la tendencia y evolución existente en los datos y de manera, como ya he dicho, categorizada.

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_23.04.53.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_23.04.53.png)

Aquí tenemos un esquema simplificado de los componentes que interactuarían con este "Data Warehouse". En este esquema podemos observar que el "Data Warehouse" recibe una determinada entrada y tiene varias salidas. Esta determinada entrada viene de la metodología conocida como "ETL", que son las siglas de "extract, transform and load". El proceso de "extract" consiste en la obtención de datos de las distintas y heterogéneas fuentes existentes, es decir, podemos tener en cuenta la base de datos de facturación de la empresa, el ERP de la empresa, incluso podemos contar con ficheros en texto plano. Esta extracción de datos es lo que se realizaría en una primera fase para, luego, transformarlos, transformarlos consistirá en homogeneizarlos, filtrarlos, depurarlos y categorizarlos. De esta manera, tendremos los datos bien preparados para hacer el volcado de éstos en lo que será nuestro almacén de datos. A su vez, este volcado de datos vendrá acompañado de distintos metadatos que acompañarán a cada registro.

Finalmente, la salida del "Data Warehouse" será la explotación de estos datos, y esta explotación puede venir en forma de realización de informes, analítica de resultados o de los propios datos y técnicas de "data mining" sobre éstos. Con la evolución de los sistemas Big Data veremos que este esquema que os acabo de presentar es muy simple y que actualmente pasa a formar parte de otro más complejo, que es el denominado "Corporate Information Factory" que como veis, está constituido por algunos componentes más y distintos diagramas de flujo de información.

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_23.08.37.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_23.08.37.png)

### Bases de Datos Orientadas a Grafos

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_23.09.32.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_23.09.32.png)

En esencia, las bases de datos orientadas a grafos representan entidades individuales y sus relaciones. Las entidades, como puede ser una persona, un objeto, una cuenta bancaria, están representadas mediante nodos o vértices, y las relaciones entre estas entidades están representadas por arcos o conexiones. Como podemos ver, tanto los vértices como los arcos, contienen a su vez propiedades que nos permitirán recorrer el grafo y las relaciones existentes entre los datos que contiene. De este modo, tenemos que las bases de datos orientadas a grafos centran su potencial en las relaciones entre entidades, permitiendo explorar caminos que las unen o analizar las relaciones existentes entre las entidades más próximas. Obviamente, una de las grandes ventajas de este tipo de bases de datos es que están respaldadas por todos los métodos propios de la teoría de grafos que tanto ha evolucionado durante el siglo XX. Como he dicho, existen varios cálculos típicos y varios algoritmos que se utilizan actualmente, de entre los que destacaríamos, por ejemplo, el algoritmo de "PageRank" de Google, también algoritmos basados en la determinación de los caminos o las rutas más cortas, que son muy útiles para empresas o negocios de transporte, y también tenemos, por ejemplo, los algoritmos de componentes conectados o de "clustering" que nos permiten por ejemplo, en LinkedIn, saber cuál es nuestra red profesional más cercana, o en aplicaciones de "dating online", saber con qué entidades, en este caso, con qué personas compartimos mayor cantidad de intereses.

![Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_23.11.52.png](Mo%CC%81dulo%202%20Tecnologi%CC%81as%20SQL%20y%20NoSQL/Screen_Shot_2020-10-30_at_23.11.52.png)

Mas adelante se profundizara en todo este tipo de características y sobre todo en las herramientas denominadas "Graph processing" que están centradas en este tipo de bases de datos, como son "Apache Giraph" o "Titan", que también están integradas dentro del ecosistema de "Hadoop".