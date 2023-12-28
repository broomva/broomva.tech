# Codebase


# KNIME

Use with KNIME: 

[KNIME | Open for Innovation](https://www.knime.com)

[KNIME-workflows.zip](Codebase/KNIME-workflows.zip)

# PySpark

## Installing

Installer uses version Anaconda3-2020.07-Linux-x86_64, and spark-csv package version 2.10-1.5.0.jar. Unzip and execute setup script. Requires to be installed within a Cloudera VM or equivalent workstation configuration.

Download from VM from:

[](https://downloads.cloudera.com/demo_vm/virtualbox/cloudera-quickstart-vm-5.12.0-0-virtualbox.zip)

[Big Data Spark Install.zip](Codebase/Big_Data_Spark_Install.zip)

Unzip and run:

```bash
./setup.sh
pyspark
```

## Importing Data

```python
from pyspark import SparkConf, SparkContext
from pyspark.sql import SQLContext

conf = SparkConf().setAppName("some_name")
sc = SparkContext(conf=conf)
sqlCtx = SQLContext(sc)

df = sqlContext.read.load('file:///home/cloudera/Downloads/big-data-4/daily_weather.csv', 
                          format='com.databricks.spark.csv', 
                          header='true',inferSchema='true')
```

## Data Exploration

```python
df.columns
df.printSchema()
df.describe().toPandas().transpose()
df.describe('air_pressure_9am').show()
len(df.columns)
df.count()

df2 = df.na.drop(subset=['air_pressure_9am'])
df2.stat.corr("rain_accumulation_9am","rain_duration_9am")
```

## Handling Missing Values

```python
from pyspark.sql.functions import avg

# Delete all missing values
removeAllDF = df.na.drop()
removeAllDF.describe(['air_temp_9am']).show()

imputeDF = df
# Replace missing values with mean
for x in imputeDF.columns:
    meanValue = removeAllDF.agg(avg(x)).first()[0]
    print(x, meanValue)
    imputeDF = imputeDF.na.fill(meanValue, [x])

df.describe(['air_temp_9am']).show()
imputeDF.describe(['air_temp_9am']).show()
```

For Loop: The *agg()* function performs an aggregate calculation on the DataFrame and *avg(x)* specifies to compute the mean on column *x*. The *agg()* function returns a DataFrame, *first()* returns the first *Row*, and *[0]* gets the first value. The last line of code uses *na.fill()* to replace the missing values with the mean value (first argument) in column *x* (second argument).

## Classification

```python
from pyspark.sql import SQLContext
from pyspark.sql import DataFrameNaFunctions
from pyspark.ml import Pipeline
from pyspark.ml.classification import DecisionTreeClassifier
from pyspark.ml.feature import Binarizer
from pyspark.ml.feature import VectorAssembler, StringIndexer, VectorIndexer

sqlContext = SQLContext(sc)
df = sqlContext.read.load('file:///home/cloudera/Downloads/big-data-4/daily_weather.csv', 
                          format='com.databricks.spark.csv', 
                          header='true',inferSchema='true')
df.columns

featureColumns = ['air_pressure_9am','air_temp_9am','avg_wind_direction_9am','avg_wind_speed_9am',
        'max_wind_direction_9am','max_wind_speed_9am','rain_accumulation_9am',
        'rain_duration_9am']

df = df.drop('number')
df = df.na.drop()

df.count(), len(df.columns)

binarizer = Binarizer(threshold=24.99999, inputCol='relative_humidity_3pm', outputCol="label")
binarizedDF = binarizer.transform(df)

binarizedDF.select("relative_humidity_3pm","label").show(5)

assembler = VectorAssembler(inputCols=featureColumns, outputCol="features")
assembled = assembler.transform(binarizedDF)

(trainData, testData) = assembled.randomSplit([0.8,0.2], seed=13234)
trainData.count(),testData.count()

dt = DecisionTreeClassifier(labelCol="label",featuresCol='features',maxDepth=5,minInstancesPerNode=20, impurity='gini')
pipeline = Pipeline(stages=[dt])
model = pipeline.fit(trainData)

predictions = model.transform(testData)
predictions.select("prediction","label").show(20)

predictions.select("prediction","label").write.save(path="file:///home/cloudera/Downloads/big-data-4/predictions.csv",format = 'com.databricks.spark.csv', header='true')
```

## Model Evaluation

```python
from pyspark.sql import SQLContext
from pyspark.ml.evaluation import MulticlassClassificationEvaluator
from pyspark.mllib.evaluation import MulticlassMetrics

sqlContext = SQLContext(sc)
predictions = sqlContext.read.load('file:///home/cloudera/Downloads/big-data-4/predictions.csv', 
                          format='com.databricks.spark.csv', 
                          header='true',inferSchema='true')

evaluator = MulticlassClassificationEvaluator(labelCol="label", predictionCol="prediction", metricName="precision")
accuracy = evaluator.evaluate(predictions)
print ("Accuracy = %.2g" % (accuracy * 100))

# If we use the rdd attribute of predictions, we see this is an RDD of Rows
predictions.rdd.take(2)

# Instead, we can map the RDD to tuple to get an RDD of numbers:
predictions.rdd.map(tuple).take(2)

metrics = MulticlassMetrics(predictions.rdd.map(tuple))
metrics.confusionMatrix().toArray()
print ("Error = %g " % (1.0 - accuracy))
```

The MulticlassMetrics class can be used to generate a confusion matrix of our classifier model. However, unlike MulticlassClassificationEvaluator, MulticlassMetrics works with RDDs of numbers and not DataFrames, so we need to convert our predictions DataFrame into an RDD. RDD stands for Resilient Distributed Datasets.

## Clustering

```python
from pyspark.sql import SQLContext
from pyspark.ml.clustering import KMeans
from pyspark.ml.feature import VectorAssembler
from pyspark.ml.feature import StandardScaler
from notebooks import utils
%matplotlib inline

sqlContext = SQLContext(sc)
df = sqlContext.read.load('file:///home/cloudera/Downloads/big-data-4/minute_weather.csv', 
                          format='com.databricks.spark.csv', 
                          header='true',inferSchema='true')

# Use only 10% of the data
filteredDF = df.filter((df.rowID %10)==0)
filteredDF.count()

filteredDF.describe().toPandas().transpose()

# The weather measurements in this dataset were collected during a drought in San Diego. 
# We can count the how many values of rain accumulation and duration are 0
filteredDF.filter(filteredDF.rain_accumulation == 0.0).count()
filteredDF.filter(filteredDF.rain_duration == 0.0).count()

# Since most the values for these columns are 0, let's drop them from the DataFrame to speed up our analyses. 
# We can also drop the hpwren_timestamp column since we do not use it.
workingDF = filteredDF.drop('rain_accumulation').drop('rain_duration').drop('hpwren_timestamp')

before = workingDF.count()
workingDF = workingDF.na.drop()
after = workingDF.count()
before-after

workingDF.columns
featuresUsed = ['air_pressure',
 'air_temp',
 'avg_wind_direction',
 'avg_wind_speed',
 'max_wind_direction',
 'max_wind_speed',
 'min_wind_direction',
 'min_wind_speed',
 'relative_humidity']

assembler = VectorAssembler(inputCols=featuresUsed,outputCol='features_unscaled')
assembled = assembler.transform(workingDF)

scaler = StandardScaler(inputCol='features_unscaled',outputCol='features',withStd=True,withMean=True)
scalerModel = scaler.fit(assembled)
scaledData = scalerModel.transform(assembled)

scaledData = scaledData.select('features','rowID')
elbowset = scaledData.filter((scaledData.rowID % 3)==0).select('features')
elbowset.persist()
elbowset.count()

clusters = range(2,20)
wsseList = utils.elbow(elbowset, clusters)

utils.elbow_plot(wsseList, clusters)

scaledDataFeat = scaledData.select('features')
scaledDataFeat.persist()

kmeans = KMeans(k=12,seed=1)
model = kmeans.fit(scaledDataFeat)
transformed = model.transform(scaledDataFeat)

centers = model.clusterCenters()

P = utils.pd_centers(featuresUsed, centers)
```

The k-means algorithm requires that the value of k, the number of clusters, to be specified. To determine a good value for k, we will use the “elbow” method. This method involves applying k-means, using different values for k, and calculating the within-cluster sum-of-squared error (WSSE). Since this means applying k-means multiple times, this process can be very compute-intensive. To speed up the process, we will use only a subset of the dataset. We will take every third sample from the dataset to create this subset. The persist() method to tell Spark to keep the data in memory (if possible), which will speed up the computations.

```python
scaledData = scaledData.select('features','rowID')
elbowset = scaledData.filter((scaledData.rowID % 3)==0).select('features')
elbowset.persist()
elbowset.count()

clusters = range(2,20)
wsseList = utils.elbow(elbowset, clusters)

utils.elbow_plot(wsseList, clusters)

scaledDataFeat = scaledData.select('features')
scaledDataFeat.persist()

kmeans = KMeans(k=12,seed=1)
model = kmeans.fit(scaledDataFeat)
transformed = model.transform(scaledDataFeat)

centers = model.clusterCenters()

P = utils.pd_centers(featuresUsed, centers)
```

A parallel coordinates plot is a great way to visualize multi-dimensional data. Each line plots the centroid of a cluster, and all of the features are plotted together. Recall that the feature values were scaled to have mean = 0 and standard deviation = 1. So the values on the y-axis of these parallel coordinates plots show the number of standard deviations from the mean. For example, +1 means one standard deviation higher than the mean of all samples, and -1 means one standard deviation lower than the mean of all samples.

We'll create the plots with matplotlib using a Pandas DataFrame each row contains the cluster center coordinates and cluster label. (Matplotlib can plot Pandas DataFrames, but not Spark DataFrames.) Let's use the pd_centers() function in the [utils.py](http://utils.py/) library to create the Pandas DataFrame:

```python
P = utils.pd_centers(featuresUsed, centers)

utils.parallel_plot(P[P['relative_humidity'] < -0.5],P)
```

The first argument to parallel_plot selects the clusters whose relative humidities are centered less than 0.5 from the mean value. All clusters in this plot have relative_humidity < -0.5, but they differ in values for other features, meaning that there are several weather patterns that include low humidity.

```python
utils.parallel_plot(P[P['air_temp'] > 0.5],P)
utils.parallel_plot(P[(P['relative_humidity'] > 0.5) & (P['air_temp'] < 0.5 )],P)
utils.parallel_plot(P.iloc[[7,8,11]],P)
```