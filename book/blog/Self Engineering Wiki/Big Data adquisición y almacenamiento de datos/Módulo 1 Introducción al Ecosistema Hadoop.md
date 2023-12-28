# Módulo 1: Introducción al Ecosistema Hadoop


### Las Cinco V's del Big Data

- Volumen: Grandes cantidades de datos (Gigas, Teras, Petas)
- Velocidad: Los datos se generan y transmiten en grandes volúmenes y grandes velocidades
- Variedad: Los datos son de distintos tipos (fotos, videos, series de tiempo, texto, etc..)
- Veracidad: El grado de confianza que se tiene de los datos generados, que se están recibiendo y procesando
- Valor: La utilidad que se puede extraer y que está intrínseco en los datos, que tendrá algún impacto del cual obtener un beneficio

A raíz de estos desafíos, nace el ecosistema hadoop

# El Ecosistema Hadoop

Surge a partir de un desafío publicado por Google en el que se presenta un modelo de programación llamado mapreduce y un gestor de ficheros (GFS). A raíz de esto Yahoo pública el año siguiente un sistema basado en el modelo de procesamiento mapreduce y que denomina hadoop. Actualmente este sistema es mantenido y desarrollado por The Apache Software Foundation.

Los objetivos del ecosistema Hadoop son:

- Escalabilidad: Capacidad de almacenar grandes volúmenes de datos y ser flexible para crecer de forma dinámica. Fácil manejo de número de nodos y de datos crecientes
- Robustes: El sistema debe ser resistente a fallos, con la capacidad de detectar y recuperarse frente a eventualidades, sin interrumpir la aplicación ni perder los datos que se han procesado.
- Flexibilidad: Debe tener la capacidad de procesar y almacenar datos de distintos tipos.
- Entorno Compartido: Debe poder soportar múltiples usuarios y gestionar multiples ejecuciones de tareas de forma simultanea.
- Aportar Valor: Debe tener la capacidad de extraer valor de los datos procesados, de generar información valiosa para el usuario

En base a esto se diseña un ecosistema basado en capas. Desde las capas más bajas de almacenamiento hasta las más altas de abstracción para procesamiento to y análisis de datos

## Arquitectura de Hadoop

1. Hardware: El ecosistema está diseñado para ejecutarse en sistemas de bajo costo (commodity hardware), de tal forma que no se necesiten computadores potentes para ejecutarse
2. Sistema de Ficheros Distribuidos: Sobre los nodos de almacenamiento y cómputo (hardware) se pone un sistema de gestión de archivos y almacenamiento. HDFS (Hadoop Distributed File System)
3. Gestor de Recursos: YARN (Yet Another Resource Negotiator) Distribuye los trabajos de procesamiento entre los nodos.
4. Modelo de Cómputo: MapReduce, framework de programacion que permite procesar datos de forma eficiente.

Sobre estas capas básicas de Hadoop, se introducen otras aplicaciones y herramientas que facilitan el acceso y procesamiento de datos:

- Base de Datos No Relacional (NoSQL): Cassandra, para almacenamiento de datos de diversos tipos sin restricciones a solo datos relacionados.
- Otra Base de Datos NoSQL: MongoDB, orientada a la gestión y almacenamiento de documentos.

Estas dos bases de datos se incorporan directamente sobre el hardware y no requerirían trabajar sobre HDFS.

- Base de Datos NoSQL sobre HDFS: HBase, ofrecida por el entorno Hadoop
- Storm: Sistema de Cómputo distribuido en tiempo real sobre YARN
- Spark: Framework para desarrollo de aplicaciones distribuidas

Sobre MapReduce se tienen frameworks como:

- Hive: Infraestructura de almacenamiento, que permite realizar consultas y acceso a datos de un modo más sencillo que directamente con MapReduce. Usando hive se generan consultas que serán traducidas por MapReduce
- Pig: Plataforma para desarrollo de aplicaciones distribuidas sobre el entorno MapReduce

También existen aplicaciones externas que se pueden usar para extender las capacidades del entorno Hadoop vanilla.

- Flume: Servicio distribuido para compilar y mover grandes cantidades de datos ente los distintos nodos del sistema
- Sqoop: Aplicación para transferir datos entre bases de datos relacionales y Hadoop

![Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screenshot_20200913_173857_org.coursera.android.jpg](Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screenshot_20200913_173857_org.coursera.android.jpg)

# Modelo MapReduce

El problema típico en Big Data se puede ver así:

1. Ordenar sobre un gran número de registros
2. Extraer información relevante de cada uno de ellos
3. Combinar y ordenar resultados intermedios
4. Agregar resultados intermedios
5. Generar resultados de salida finales

Un modelo adecuado para ejecutar este algoritmo es:

## Master Worker

En este modelo, se empieza con una gran cantidad de datos y se particionan en un proceso denominado "splitting". A cada fragmento de bloques de datos se asigna un worker, los cuales van a ir procesando los datos y generando resultados parciales; los resultados de cada worker se agrupan para formar el resultado final.

![Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screenshot_20200913_175202_org.coursera.android.jpg](Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screenshot_20200913_175202_org.coursera.android.jpg)

Un modelo que responde a esta estructura general es pues, MapReduce. Bajo este paradigma se logra procesar grandes cantidades de datos en forma paralela y explota las características de los sistemas de cómputo distribuidos. Este framework altamente escalable permite ahorrar tiempo al permitir el uso de varios nodos de procesamiento de forma paralela sin degradar el rendimiento del sistema.

A raíz del nombre, el modelo realiza una fase de mapeo "map" y otra donde recolecta los datos y reduce a la solución "reduce". La fase de mapeo va a ser realizada por los nodos donde se encuentran los datos denominados "mappers". El numero de mappers está determinado por el framework y no por el desarrollador. Este proceso de mapeo realiza operaciones sobre los datos y retorna pares "clave - valor (key - value)" que se envían a la siguiente fase de ordenación (Sort and shuffle). En la fase de ordenación se reciben los pares de clave valor desde los distintos mappers y los irán organizando para enviar a los reducers que agregan los resultados y producen la solución final

![Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screenshot_2020-10-07_200127.png](Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screenshot_2020-10-07_200127.png)

![Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screenshot_2020-10-07_200748.png](Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screenshot_2020-10-07_200748.png)

El código para este ejemplo podría tener una forma así:

```go
Map(String docid, String text):
	for each word w in text:
		Emit(w,1)

Reduce(String term, Iterator <Int> values):
	int sum = 0;
	for each v in values:
		sum += v;
	Emit(term, sum)
```

Un ejemplo para multiplicación de matriz por vector estaría dado por:

```go
Map(Matriz a, Vector b):
	for each position i in b:
		Emit(i, a_ij*b_j)

Reduce(String term, Iterator <Int> values):
	int sum = 0;
	for each v in values:
		sum += v;
	Emit(term, sum);
```

En resumen, el modelo MapReduce es un paradigma de programación sencillo y altamente escalable ya que permite explorar las capacidades de paralelismo. Es adecuado para el análisis y procesamiento de datos y permite realizar distintos tipos de operaciones. Ha sido adoptado de forma general pro los entorno de procesamiento en Big Data y es el núcleo del sistema Hadoop.

# HDFS

El sistema de ficheros esta diseñado con dos características fundamentales:

- Funcionamiento sobre commodity hardware (sistemas de bajo coste)
- Alta toleración a fallos con deteccion, recuperacion automatica

HDFS es adecuado para aplicaciones que utilizan grandes volúmenes de datos y una instancia de HDFS puede consistir de cientos o miles nodos que comparten este sistema de ficheros y la gran cantidad de datos estará entonces distribuida a lo largo de este numero de nodos que se están utilizando. HDFS proporciona un acceso de alto rendimiento a este sistema de datos de miles de nodos mientras integra tolerancia a fallos, detección y recuperación automática de los nodos. Las aplicaciones que se ejecutan sobre HDFS requieren acceso en "streaming" a los datos, sin embargo, HDFS ha sido diseñado mas para procesamiento en "batch" que para uso interactivo de los datos por parte de los usuarios. El objetivo es entonces lograr un alto rendimiento "throughtput" mas que una baja latencia. El modelo de coherencia es simple, usando un modelo "write-once, read-many", haciendo que una vez ha sido creado, escrito y cerrado, el archivo no podrá ser cambiado. La estructura esta diseñada para hacer el movimiento de las aplicaciones/computo hacia los datos, reduciendo así la latencia, mas en escenarios donde los datos son enormes; se intenta entonces, mover los datos lo menor posible, reduciendo la congestión en la red y aumentando el rendimiento. HDFS proporciona interfaces para que las aplicaciones se muevan mas cerca de donde los datos están almacenados. HDFS es portable entre plataformas de hardware y software. Estas son características deseables en un sistema escalable y son pues, características implementadas por parte del conjunto HDFS.

## Arquitectura HDFS

La arquitectura esta definida por un numero de nodos/ordenadores formando un cluster distribuidos entre uno o varios racks y donde uno de ellos, el "NameNode" va a estar dedicado a ser el gestor de espacio de nombres "NameSpace", y en definitiva, el gestor del sistema de archivos. Este nodo va a almacenar todos los metadatos referentes al sistema de archivos y tendrá un repositorio de los datos referentes al sistema de archivos. Por otro lado, los nodos restantes se denominan "DataNode" los cuales gestionan el almacenamiento local en cada uno de los nodos, es decir, de los discos locales de cada uno de los sistemas en que se compone el cluster. Tanto el NameNode como el DataNode estan programados en Java y se ejecutan generalmente sobre sistemas GNU/Linux, por que se pueden portar fácilmente entre distintos sistemas.

![Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_18.56.22.png](Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_18.56.22.png)

Un fichero de datos se divide en un conjunto de bloques, generalmente de 65MB, auqneu es configurable. El NameNode realiza una asignacion en la que atribuye cada bloque de datos a un DataNode, asi pues, el fichero queda fisicamente distribuido entre los distintos nodos del cluster, de tal forma que cuando se necesite aplicar el modelo MapReduce para procesar los distintos nodos, los datos estaran divididos ya y se podra aprovechar el paralelismo sin necesidad de hacer mayores movimientos.

![Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_18.56.22%201.png](Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_18.56.22%201.png)

Los datos de usuario nunca pasan por el NameNode. Las peticiones de lectura o escritura de datos por parte de clientes se dirigen a los DataNodes. En ese sentido, el NameNode se encarga únicamente de la gestión del sistema de ficheros desde un punto de vista organizativo

![Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_19.02.55.png](Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_19.02.55.png)

![Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_19.03.01.png](Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_19.03.01.png)

Los clientes pueden realizar peticiones de replicacion para que se realice un backup de los datos, lo que otorga robustez a la disponibilidad de los datos en caso que ocurran fallos o se caigan nodos del sistema.

![Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_19.05.42.png](Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_19.05.42.png)

![Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_19.06.23.png](Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_19.06.23.png)

HDFS permite monitorear el estado de los nodos para determinar su estado de funcionamiento mediante señales "Heartbeat" que le indican al NameNode que estan activos y añadiendo un listado con los bloques de datos que ese DataNode esta gestionando.

![Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_19.10.40.png](Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_19.10.40.png)

Si por algún motivo, en algún momento falla el nodo, el NameNode dejara de recibir la señal Heartbeat y pasado un Deadline determinara que el DataNode se cayo y tendrá entonces que recuperar la información que se encontraba en ese DataNode según anuncia la lista de bloques que envío. Entonces buscara en los otros nodos donde se encuentren los bloques y va a mandar peticiones de replica apara que se asignen los bloques del DataNode caído a nuevos DataNodes funcionales del sistema, asegurando que existan como mínimo dos copias activas de los ficheros/bloques.

HDFS puede ser accedido mediante un API Java que nos permite acceder a los archivos que quieren gestionar nuestras aplicaciones y también tenemos un wrapper para acceder a este API Java desde "C" y así, poder gestionar, acceder, leer, escribir los ficheros desde nuestras aplicaciones. Asimismo, HDFS también nos ofrece un sistema de Shell denominado "FS Shell" que nos va a permitir ejecutar unos comandos habituales, como sería el de un sistema de archivos tradicional en Linux.

# YARN

Es un gestor de recursos y aplicaciones que pretende extender el procesamiento en los clusters Hadoop mas allá del modelo MapReduce. Dos aspectos fundamentales de YARN son:

- Gestión de Recursos
- Planificaciones y Monitorización de Tareas

Se tienen entonces diversos nodos bajo una estructura Master/Worker donde existe un Resource Manager en uno de los nodos, el cual va a controlar la gestion de recursos del sistema y luego unos Node Manager, el cual va a gestionar los recursos locales de cada uno de los nodos. Dentro de cada uno de los nodos, se ejecutan una serie de Contenedores. Uno de estos Contenedores se encargara de ejecutar el Application Master, el cual controla la ejecución de la aplicación. Así pues, en este sistema gestor de recursos se tienen cuatro componentes.

![Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_19.27.30.png](Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_19.27.30.png)

- El Resource Manager gestiona todo el sistema de archivos e incluye un planificador (Scheduler) el cual se encarga de asignar las tareas entre los distintos nodos del sistema. Este sistema de planificación se puede programar introduciendo diferentes plugins que permite añadir diversas políticas de planificación. El Resource Manager ejecuta el gestor de aplicaciones Application Manager, el cual acepta envíos de tareas y gestiona la ejecución. Entonces, el resource manager recibe peticiones de los usuarios y realiza la asignación.
- El Node Manager controla los recursos locales del nodo y recibe las peticiones, envíos o asignaciones de tareas que le va asignando el Resource Manager. Un agente por nodo. El Node Manager gestiona un nodo de computo individual y se comunica con el Resource Manager para enviar información sobre el estado del nodo
- El Application Master controla la ejecución de una aplicación y pide recursos para ejecutarla.
- El Container son los recursos que se van a utilizar para ejecutar una tarea. Incluye la especificación de recursos como numero de núcleos, cantidad de memoria, etc.

Entonces, cuando un cliente quiere ejecutar una aplicación, la petición de ejecución le va a llegar al Resource Manager que lo que va a hacer va a ser, en función del estado de ocupación de los distintos recursos, va a ejecutar, va a abrir un "Container" para ejecutar el Application Master correspondiente a esa aplicación.

![Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_22.33.12.png](Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_22.33.12.png)

A partir de ahí, este Application Master le va a pedir al Resource Manager los recursos para poder ejecutarse, y el Resource Manager va a ver el estado de los distintos nodos con la información que le van mandando los Node Managers, y va a decidir mandar unas peticiones de Containers para que se habiliten estos Containers para ponerlos a disposición de esta aplicación en particular, y van a empezar estos Containers a estar disponibles para la ejecución de esta aplicación. 

![Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_22.33.28.png](Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_22.33.28.png)

De modo que el Application Master, que es el que controla la ejecución de la aplicación, va a comunicarse con los Containers asignados y se va a empezar a realizar la ejecución de la aplicación. A partir de ese momento, el Resource Manager ya no va a participar en la gestión de la aplicación y va a ser, directamente, el Application Master el que va a estar controlando los distintos Containers que le han sido asignados. El Application Master va a comunicarse con el cliente mandándole resultados, recibiendo instrucciones del usuario para poder ir ejecutando la aplicación de la forma correcta.

![Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_22.36.17.png](Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_22.36.17.png)

Si ahora llega otro cliente y pide ejecutar otra aplicación, se va a abrir otro Application Master en otro Container, y este Application Master nuevo va a volver a pedir al Resource Manager los recursos necesarios para poder ejecutar la aplicación, y el Resource Manager va a activar los distintos Containers necesarios para poder ejecutar la aplicación. De modo que, simultáneamente, vamos a tener distintas aplicaciones ejecutándose en nuestros nodos con un Application Master por aplicación y distintos Containers distribuidos entre los distintos nodos de nuestra aplicación. La asignación de los recursos de los Containers se va realizando en función del estado de ocupación de los distintos nodos, según la información que le van mandando los Node Managers al Resource Manager.

![Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_22.37.48.png](Mo%CC%81dulo%201%20Introduccio%CC%81n%20al%20Ecosistema%20Hadoop/Screen_Shot_2020-10-15_at_22.37.48.png)