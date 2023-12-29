# Módulo 4: Herramientas para el Análisis de Datos Industrial


# Bases de Datos Analíticas

## Analitica de Datos

La analítica de datos lo que pretende es, primero, adquirir fuentes de datos de diferentes lugares. Son, nuevamente, datos no estructurados, con diferentes formatos, que van a integrar nuestra visión de los datos de una compañía. Esa visión, nuevamente, es muy voluminosa, tenemos varios terabytes de datos agregados. Necesitamos analizarlos, responder preguntas relacionadas con el negocio de la compañía en un tiempo cercano al tiempo real. Y es importante, a veces, poder escalar esa infraestructura donde están los datos en algún proveedor en la nube.

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.09.04.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.09.04.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.09.41.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.09.41.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.10.31.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.10.31.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.11.03.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.11.03.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.11.59.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.11.59.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.12.54.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.12.54.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.14.12.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.14.12.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.14.46.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.14.46.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.15.58.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.15.58.png)

# Business Intelligence

## Data Warehouse

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.42.29.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.42.29.png)

## Corporate Information Factory

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.46.09.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.46.09.png)

ETL son las siglas de Extract, Transform y Load. Por Extract entendemos todos los procesos relacionados con la obtención de los datos, a partir de las distintas y heterogéneas fuentes. Por Transform entendemos la homogeneización, el filtrado, la categorización, etcétera. Y por Load entendemos el volcado final de los datos en el propio Data Warehouse. Como cada negocio tiene sus particularidades, no existe una única manera concreta de proceder que sea estándar para todos los casos. Lo que sí que generalmente comparten todos los procesos de ETL, es que cada una de estas etapas se ejecutan en modo de pipeline, de manera que cada etapa acostumbra procesar la información que ya había procesado su etapa predecesora en un periodo anterior. De esta manera, aprovechamos al máximo la capacidad de paralización de estas tareas y, también, podemos identificar cuándo es el mejor momento de ejecutarlas, que normalmente viene a ser los periodos de baja actividad de la empresa, si existen. En algunos casos, el orden de este procedimiento es alterado, realizando primero una carga bruta de los datos que han sido extraídos. En este caso, lo que denominábamos Data Warehouse ahora se denomina Data Lake. Esto viene habilitado, principalmente, por las mejoras en los motores de los sistemas gestores de bases de datos. Dado que, actualmente, estos motores nos permiten hacer varias operaciones complejas In Data Base. Estas operaciones involucran transformaciones complejas, podemos hacer minería de datos antes incluso de extraerlos, limpieza automática e, incluso, la aplicación algorítmica de distintas funciones. Esto, lo que nos permite, es no tener que esperar a todo el proceso de transformación que, generalmente, es muy costoso para volcar y disponer de los datos y, de este modo, la transformación se divide en procesos más ligeros y mucho más adaptados a las necesidades de nuestra empresa. Por ejemplo, cada uno de estos procesos podría dar lugar a un diferente Data Mart. Además, el hecho de aplicar la transformación a un solo sistema gestor de base de datos, como sería el que está gestionando el Data Lake, acelera y permite realizar estas funciones de manera óptima. Estos esquemas, obviamente, son dinámicos, no existe un estándar como vengo diciendo y, de hecho, actualmente se están empezando a aplicar metodologías híbridas que combinan ETL con ELT. Esto formaría parte de arquitecturas más complejas denominadas ETLT.

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.56.37.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.56.37.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.58.56.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_10.58.56.png)

### OLAP

El concepto de OLAP que responde a On Line Analytical Processing, está fundamentado en la multidimensionalidad inherente que tienen los datos. Muchos de los inconvenientes a la hora de extraer y analizar la información a partir de bases de datos relacionales, era que los datos en sí presentan una multidimensionalidad muy grande, y la estructura, y la manera en cómo están implementadas las bases de datos relacionales no encaja, precisamente, en esta gran dimensionalidad que nos podemos encontrar, sobre todo cuando hablamos de Big Data. De este modo, el procedimiento de análisis multidimensional de los datos es lo que se conoce como OLAP y una manera de representarlo, gráfica, es lo que se conoce como el El Cubo OLAP. Obviamente, por cuestiones prácticas tan solo a nivel visual, tan sólo podemos representar tres dimensiones. Así que, en realidad, lo que se conoce como cubo OLAP, en realidad es un hipercubo OLAP.

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.02.37.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.02.37.png)

En cada dimensión, nosotros podemos definir distintas métricas de interés para nuestro negocio. Podemos tener, por ejemplo, en uno de los ejes podemos definir los clientes, el beneficio, unidades vendidas de un producto. En otro eje podemos representar los componentes de este producto, el coste de cada uno de ellos. En otro eje podemos utilizar una métrica por excelencia, que sería el tiempo para darnos ideas sobre las tendencias en nuestro negocio, el precio de venta al público, las zonas geográficas, etcétera. Con el paso de los últimos años, es evidente que el desarrollo de los distintos motores de bases de datos que han tenido en cuenta esta multidimensionalidad y, por lo tanto, la gran mayoría de bases de datos están optimizadas para tratar con nuestros datos. La idea del análisis multidimensional es que a partir de este cubo o hipercubo, nosotros podamos jugar como si se tratase de un cubo de Rubik, de manera que podamos encontrar la combinación de dimensiones, que esto es jugar con los planos o hiperplanos, hasta que demos con la combinación adecuada que nos dé un conjunto de datos que, específicamente nos interesa para un fin concreto. Esto, finalmente, deriva en lo que serían los procesos de planificación, de análisis y de presentación de resultados.

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.05.51.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.05.51.png)

### Analisis y Presentacion

Existen tres tipos de analíticas que son la analítica descriptiva, la predictiva y la prescriptiva, que vienen a responder a las preguntas de ¿qué ha sucedido hasta ahora?, ¿qué sucederá? y ¿qué debería hacer?, respectivamente.

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.08.30.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.08.30.png)

# Apache Impala

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.09.39.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.09.39.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.10.49.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.10.49.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.12.55.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.12.55.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.13.10.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.13.10.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.14.13.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.14.13.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.14.44.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.14.44.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.15.35.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.15.35.png)

# Apache Hive

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.21.10.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.21.10.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.22.09.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.22.09.png)

La arquitectura en Apache Hive está compuesta, básicamente, de cinco bloques, cuatro bloques que son el "driver", donde se reciben las consultas, ya sea desde la consola o desde un entorno de programación de alto nivel. Estas consultas son traducidas por el compilador en varios trabajos a realizar, que son orquestados por un repositorio de metadatos, donde se acaban de decidir qué código se va a ejecutar sobre cada servidor. Ese, al final, será lanzado por un motor de ejecución, que realizará peticiones a un "cluster" de Hadoop.

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.23.36.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.23.36.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.24.20.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.24.20.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.26.02.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.26.02.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.26.33.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.26.33.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.27.52.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.27.52.png)

Un ejemplo, puede ser una "query" sencilla, una consulta sencilla, donde estoy contando el número de facturas que tiene mi tabla. Simplemente, utilizo un "SQL" que selecciono, cuento todas las líneas de facturas. Y el resultado, Hive va a traducir esta consulta tan sencilla en una serie de trabajos "MapReduce", que va a acceder a "HDFS" y me va a devolver el resultado. Por lo tanto, he liberado la necesidad de programar en lenguaje Java, por ejemplo, una serie de clases "MapReduce", de pensar en fases "map" y "reduce", aquí, simplemente, estoy orientandome a una consulta de datos. No quiero decir con eso que los trabajos no existan, sino simplemente, existe un traductor de esas consultas de alto nivel en "HiveSQL" a trabajos "MapReduce".

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.28.58.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.28.58.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.53.27.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.53.27.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.54.50.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.54.50.png)

# Apache Spark

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.59.35.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_11.59.35.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.01.05.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.01.05.png)

Cuando nuestro procesamiento de datos tiene la forma de un grafo dirigido a cíclico, es decir, tenemos varias fases donde la fase posterior depende de los datos de la anterior, Spark perite crear esa cadena de pasos de una forma bastante simplificada. Por lo tanto, todos aquellos algoritmos, pipelines de trabajo, workflows, que definan etapas donde hay una dependencia clara entre ellas, va a ser fácil de trabajar en Spark con ellas.

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.05.03.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.05.03.png)

La arquitectura de Spark está dividida en grandes bloques. Existe un gran entorno que es el Spark Core, donde se van a trabajar de forma interna los procesamientos de los datos, que veremos posteriormente, y tenemos una serie de bloques, que es el Spark tradicional, donde vamos a utilizar un lenguaje de programación o una consola, y luego existen esos entornos nuevos que añade Spark, como Mlib o GraphX, que tienen su conexión directa con el Core de Spark, con lo cual no necesitan llamar a un programa, sino ellos mismos pueden llamar directamente al motor de análisis de datos. Por debajo, también se añaden una serie de entornos más flexibles, you que podemos usar un cluster de Spark, hecho a medida, o bien podemos usar otros entornos, otros gestores de recursos, como YARN de Hadoop o Mesos de Apache, donde podemos definir diferentes tipos de clusters utilizando Spark en cada uno de ellos.

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.05.22.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.05.22.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.06.45.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.06.45.png)

La gran optimización que realiza Spark es la reducción de volumen de trabajo entrada/salida. Es el objetivo de Spark realizar, mejorar esa cantidad de datos que se mueven. Para ello presenta el concepto de RDDs, Resilient Distributed Datasets, que es una, bloques de datos, que se van a procesar a partir de los datos de entrada, se van a gestionar RDDs, colecciones de datos, que son serializables y que pueden ser particionados y distribuidos entre varios servidores de una manera muy sencilla. Todas las aplicaciones en Spark se van a traducir en un conjunto de RDDs que se van a leer, se va a aplicar un cierto procesamiento, se va a obtener un RDD como resultado y se va a poder aplicar, de nuevo, otra función de ese estilo, hasta que al final tengamos un resultado final interesante para la aplicación, que será almacenado de nuevo en el sistema de ficheros distribuidor que estemos usando.

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.48.06.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.48.06.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.49.23.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.49.23.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.50.09.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.50.09.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.51.42.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.51.42.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.53.15.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_12.53.15.png)

# Graph Processing

Las entidades de un grafo se conocen como nodos o vértices, y las relaciones entre entidades dentro de un grafo se conocen como arcos o conexiones. Tanto los nodos como los arcos presentan sus propias propiedades y, en general, el punto de vista que debemos tener a la hora de tratar con bases de datos orientadas a grafos, es que nuestras consultas han de estar orientadas a procesar la información de nodos que están interrelacionados entre sí, extrayendo todos los datos que podamos obtener a partir de sus relaciones, y normalmente partiendo de un nodo o subconjunto de nodos, y explorando las conexiones o arcos que tiene.

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_13.23.31.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_13.23.31.png)

Dicho de otra manera, las bases de datos orientadas a grafos elevan el protagonismo de las relaciones por encima de las propias entidades. Los grafos, en este caso, tradicionalmente se representan de tres maneras muy concretas.

En primer lugar, tenemos lo que sería las listas de adyacencia donde cada vértice de un grafo corresponde con una lista del resto de vértices adyacentes a él, es decir, los vértices que tienen conexiones directas con este nodo. De este modo, vemos en este ejemplo que tenemos un grafo completamente conectado, donde "A" conecta con "B" y "C", "B" conecta con "A" y "C", y "C" conecta con "A" y "B". Otra manera de representar los grafos es con la denominada matriz de adyacencia donde vemos, como en este caso, que tanto las filas como las columnas corresponden al mismo conjunto de vértices que componen el grafo, de manera que cada celda "I J", denota la conexión o la relación del nodo "I" con el nodo "J". Si no existe conexión, esta celda estará vacía y si existe conexión, esta celda, o bien contendrá un valor binario verdadero, o bien, incluso puede contener las propiedades que tiene esa conexión, ese arco dentro del grafo

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_13.25.18.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_13.25.18.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_13.27.43.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_13.27.43.png)

La tercera manera de representar los grafos es mediante la denominada matriz de incidencia donde, en esta ocasión, las filas representan cada uno de los nodos del grafo, pero las columnas, ahora, representan las conexiones de manera que, generalmente, esta matriz es binaria y donde un valor de cero o falso indicará que ese determinado nodo no tiene esa determinada conexión con ningún otro nodo, y un valor verdadero, lo contrario, que ese nodo contiene, o es origen, o destino de esa conexión.

Toda la gran cantidad de datos que se generan son valiosísimos y, desde luego, es muy importante y necesario saber extraer eficientemente la información de ellos. Los grafos nos permiten la posibilidad de recorrer estos datos de una manera muy provechosa en determinados problemas, para atender a determinadas necesidades. Entonces, hay que saber bien qué preguntar y cómo preguntar, para explorar eficazmente las relaciones existentes e, incluso, descubrir nuevas relaciones entre entidades.

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_13.59.08.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_13.59.08.png)

Vemos que la forma de recorrer los grafos nos permite descubrir aspectos de nuestros datos muy importantes y de manera muy diferente. Por ejemplo, en este caso vemos que aparte de encontrar distintas agrupaciones, lo cual de por sí ya es muy importante, vemos que además podemos identificar ciertos puntos donde la información ha de pasar obligatoriamente para fluir entre una agrupación y otra. Es decir, a de pasar sí o sí y actúan como lo que se denominan "vértices puente". Esto, como os podéis imaginar, es algo importantísimo dependiendo del negocio, dado que, imaginaos que este grafo corresponde a nuestra red de clientes, es evidente que estos vértices puente son importantísimos para mantener los distintos conjuntos de clientes.

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_14.03.56.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_14.03.56.png)

## Etapas y Componentes

Casi la totalidad de motores de "graph processing" basan su funcionamiento en el paradigma BSP, que es "Bulk Synchronous Parallel", que consiste en la repetición iterativa de un procedimiento que consta de tres fases. Una primera en la que una determinada cantidad de unidades de cómputo realizan un procesamiento de unos datos, realizan lo que se denomina una tarea. La segunda fase viene a ser una etapa en la que todas las unidades de cómputo intercambian mensajes entre ellas. Finalmente, tenemos una tercera fase en la que se realiza una sincronización global, de manera que esta sería la fase que daría paso a un nuevo procedimiento, un nuevo paso de este procedimiento.

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_16.02.53.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_16.02.53.png)

Los nodos serían las unidades de procesamiento y la idea consiste en que este procedimiento se repite hasta que todos los nodos se quedan sin nada por procesar. De manera que, para llevar a cabo este algoritmo, generalmente, los nodos comparten o tienen disponible un estado que puede ser, o bien, activo, es decir, que tiene tarea por procesar, o bien, parado o inactivo, que es decir que ya no ha recibido mensajes, no tiene tarea por procesar.

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_16.08.01.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_16.08.01.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_16.09.52.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_16.09.52.png)

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_16.12.39.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_16.12.39.png)

Apache Giraph, que corresponde a una herramienta de procesamiento de grafos, pero más orientada a un contexto analítico, es decir, de OLAP, lo que vimos hace algunas sesiones. Y, de esta manera, Giraph se utiliza para analizar datos de grafos de una manera orientada a algoritmos tipo "Page Rank", por ejemplo. Titán, por su parte, es una base de datos orientada a grafos, pero destinada más a un análisis OLTP, que es "OnLine Transactional Processing". En otras palabras, Titán se usa como una base de datos para consultas en tiempo real y actualizaciones, también, en tiempo real o casi real. De Titán, tenemos un sucesor, por así decirlo, que se denomina Janus Graph, que también está cobrando mucho protagonismo, dentro de distintas organizaciones. Janus Graph es un "fork" del proyecto Titan y se caracteriza, también, por estar muy, muy bien integrado con las distintas herramientas del ecosistema de Hadoop, de manera que se pueden realizar operaciones muy complementarias con Apache Spark, con Giraph mismo y con otras herramientas. Finalmente, otra herramienta muy utilizada en la industria es Neo4j que dispone de una licencia abierta, tipo GPL, y también viene ofrecido bajo una licencia de uso comercial que, evidentemente, proporciona funcionalidades más potentes. Tiene una API de Java muy apropiada, muy fácil de manejar, dispone de herramientas para procesos DTL, tiene almacenamiento de grafos nativo, procesamiento también nativo, evidentemente, está orientado a una alta disponibilidad y dispone de su propio lenguaje de consultas, que es un lenguaje mucho menos verboso, mucho menos denso, que el propio SQL.

![Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_16.14.43.png](Mo%CC%81dulo%204%20Herramientas%20para%20el%20Ana%CC%81lisis%20de%20Datos%20/Screen_Shot_2020-10-31_at_16.14.43.png)