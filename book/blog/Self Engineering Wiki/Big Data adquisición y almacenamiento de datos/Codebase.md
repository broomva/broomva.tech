# Codebase


# HDFS

While on the terminal shell, use hadoop commands to navigate and execute functions

```bash
hadoop version #returns the installed hadoop version
hdfs dfsadmin -report #returns a list of the current hadoop/hdfs status and functioning nodes
hdfs dfs -mkdir -p /user/hadoop #creates a folder with hadoop
hdfs dfs -ls /user #shows folder contents
hdfs dfs -put /from/file.txt /user/hadoop #copies the file to the hadoop folder
hdfs dfs -cat /user/hadoop/file.txt #shows file's contents
hdfs dfs -rm /user/hadoop/file.txt #removes the file
```

Creating a workload using the samples included in the hadoop folder. Teragen commands creates "n" registers in the target folder. Terasort, sorts the registers in the target folder, and stores them sorted in the output one

```bash
hadoop jar /usr/lib/hadoop-mapreduce/hadoop-mapreduce-examples.jar teragen 1000 /user/hadoop/terainput
hadoop jar /usr/lib/hadoop-mapreduce/hadoop-mapreduce-examples.jar terasort /user/hadoop/terainput /user/hadoop/teraoutputhadoop jar /usr/lib/hadoop-mapreduce/hadoop-mapreduce-examples.jar terasort /user/hadoop/terainput /user/hadoop/teraoutput
```

```bash
hadoop jar /usr/lib/hadoop-mapreduce/hadoop-mapreduce-examples.jar wordcount /user/hadoop/input_file.txt /user/hadoop/output_folder
```

# SQOOP

From RDBS to HDFS, select * from table:

```bash
sqoop import --connect jdbc:mysql://localhost/retail_db --username root --P cloudera --table categories --target-dir sqoop
hdfs dfs -ls sqoop
hdfs dfs -cat sqoop/part-m-00000
```

With specific query:

```bash
sqoop import --connect jdbc:mysql://localhost/retail_db --username root --P cloudera --table customers --m 1 --target-dir austin --where "customer_city='Austin'"
```

From HDFS to MySQL

```bash
mysql> CREATE TABLE temp (id INT NOT NULL PRIMARY KEY, cat INT, name VARCHAR(30));
sqoop export --connect jdbc:mysql://localhost/retail_db --username root --P cloudera --table temp --export-dir sqoop
mysql> SELECT * FROM temp
```

# Spark

```bash
spark-shell
val texto = sc.textfile("file:///home/cloudera/data/compras.txt")
texto.collect() # Returns the contents of the val
val contador = texto.count
val buenos = texto.filter(linea => linea.startsWith("E")) #Fat arrow, every register must comply with whatever comes after the arrow
val positivos = buenos.filter(l => l.split(",")(2).toDouble > 0) #This line deletes registers on column 2, splitting by commas, and the double value must be greater than 0. Basically, deletes the columns in which the column 2 value is less or equal than 0
# Concat filters. Below line is the same as the two above
val buenos2 = texto.filter(l => l.startsWith("E")).filter(l => l.split(",")(2).toDouble > 0)
val grandes = positivos.filter(l => l.split(",")(2).toDouble > 1000)
val enero = positivos.filter(l => l.contains("enero"))
val suma = positivos.map(linea => linea.split(",")(2).toDouble).reduce( _ + _)
val max = positivos.map(linea => linea.split(",")(2).toDouble).reduce((x.y) => if(x > y) x else y)
```

# HIVE

```bash
hive # open hive shell
hive> CREATE TABLE test (num INT);
hive> SELECT * FROM test;
hive> DROP TABLE test;
hive> exit;
hdfs dfs -put /data/nombres.txt /user/hadoop
hive> CREATE EXTERNAL TABLE IF NOT EXISTS nombres (ID INT, nombres STRING, dept STRING) 
		> COMMENT 'nombres de empleados' 
		> ROW FORMAT DELIMITED
		> FIELDS TERMINATED BY ','
		> STORED AS TEXTFILE
		> LOCATION '/user/hadoop';
hive> SELECT * FROM nombres;
hive> SELECT nombre FROM nombres WHERE ID>23;
hive> SELECT dept FROM nombres WHERE nombre='name';
hive> SELECT nombre, ID FROM nombres ORDER BY ID DESC;
```