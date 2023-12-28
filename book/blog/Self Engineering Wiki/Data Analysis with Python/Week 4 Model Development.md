# Week 4: Model Development


## Colab Link

[Google Colaboratory](https://colab.research.google.com/drive/16rUCqzE4nE8sNKLg0UnTiZUf8kojdZE3)

A model or estimator can be thought of as a mathematical equation used to predict the value given one or more other values, relating one or more independent variables to dependent variables. Usually, the more relevant data is at hand, the more accurate the model is.

# Simple Linear Regression (SLR)

Is a method that helps understanding the relationship between two variables using a linear equation:

- The Predictor (Independent) variable - $x$
- The Target (Dependent) variable - $y$

$$
y = b_0 + b_1x
$$

- $b_0$: the intercept
- $b_1$: the slope

When fitting or training the model, we will come up with these two ($b_0, b_1$) parameters. In order to determine the regression line, we take data points from our data set. We then use these training points to fit/train our model and the parameters. We usually store the data points into data frames or numpy arrays:

$$
x = \begin{bmatrix} x_1 \\ x_2 \\ x_n \end{bmatrix}, \;  \; y = \begin{bmatrix} y_1 \\ y_2 \\ y_n \end{bmatrix}
$$

Noise can be added to the input data via a distribution and random assignation. Using this input and output information, the linear fitting process takes place which returns the parameters for the regression line, which can be then used to make a prediction to a given input value.

$$
\hat y = b_0 + b_1 x
$$

$\hat y$ indicates that the output target is an estimate.

```python
from sklearn.lnear_model import LinearRegression

# Create a Linear Regression Object using the constructor
lm = LinearRegression()

# Define a predictor variable and target variable
X = df[["predictor"]]
Y = df[["target"]]

# Train the model
lm.fit(X,Y)

# Obtain a prediction
Yhat = lm.predict(x)

# Intercept and slope values
lm.intercept_
lm.coef_
```

# Multiple Linear Regression (MLR)

This method is used to explain the relationship between one continuous target (Y) variable and multiple predictor variables (X):

$$
\hat Y = b_0 + b_1x_1 + b_2x_2 + b_3x_3 + ... + b_nx_n
$$

```python
Z = df[["predictor_1","predictor_2","predictor_n"]]
lm.fit(Z, df["target"])
Yhat = lm.predict(Z)
```

The output for any given prediction input array, is another array with the same number of samples. The intercept is an attribute of the object and coefficients are also attributes.

# Model Evaluation Using Visualization

## Regression Plot

A regression plot gives a good estimate of the relationship between two variables, the strength and direction of the correlation. One thing to keep in mind when looking at a regression plot is to pay attention to how scattered the data points are around the regression line. This will give you a good indication of the variance of the data, and whether a linear model would be the best fit or not. If the data is too far off from the line, this linear model might not be the best model for this data.

![Week%204%20Model%20Development/Screen_Shot_2020-09-22_at_21.32.52.png](Week%204%20Model%20Development/Screen_Shot_2020-09-22_at_21.32.52.png)

The parameter x is the name of the column that contains the independent variable or feature, the parameter y contains the name of the column with the dependent variable or target. The regression plot can be then created by: 

```python
import seaborns as sns
sns.regplot(x="predictor", y="target", data=df)
plt.ylim(0,)
```

## Residual Plot

The residual plot represents the error between the actual value. Examining the predicted value and actual value we see a difference. We obtain that value by subtracting the predicted value, and the actual target value. We then plot that value on the vertical axis with the independent variable as the horizontal axis.

$$
Y_0 = b_0 + b_1X_0+e_0 \\ \hat{Y}_0 = b_0+b_1X_0 \\ \hat{Y}_0-Y_0=R_0
$$

Where, $Y_0, \hat{Y}_0$ are the real and predicted output value in index 0 of the data, $X_0$ is the input data at that step, $e_0$ is the added/measured noise in the real input data and $R_0$ is the residual value in that step. The Residual plot is then a $R  \: vs \: X$ 2D plot with the residuals in the vertical axis. 

It is then expected (for a good prediction) that the results have zero mean, distributed evenly around the horizontal axis with similar variance and no curvature; this suggests a linear prediction model is appropriate for the data, 

![Week%204%20Model%20Development/Screen_Shot_2020-09-22_at_21.53.51.png](Week%204%20Model%20Development/Screen_Shot_2020-09-22_at_21.53.51.png)

When the residual plot return a curved plot, with the results not randomly spread out around the horizontal axis it might be a suggestion that a non linear model may be more appropriate:

![Week%204%20Model%20Development/Screen_Shot_2020-09-22_at_21.56.27.png](Week%204%20Model%20Development/Screen_Shot_2020-09-22_at_21.56.27.png)

In the next example, the variance of the residuals value change in proportion with the horizontal axis, indicating that the prediction model $\hat{Y}$ is incorrect:

![Week%204%20Model%20Development/Screen_Shot_2020-09-22_at_21.59.00.png](Week%204%20Model%20Development/Screen_Shot_2020-09-22_at_21.59.00.png)

Using seaborn, the residual plot can be created by: The first parameter is a series of dependent variable or feature. The second parameter is a series of dependent variable or target.

```python
sns.residplot(df["feature"],df["target"])
```

## Distribution Plot

A distribution plot counts the predicted value versus the actual value. These are useful for visualizing models with more than one independent variable or feature. In the horizontal axis are plotted the values of $Y, \hat{Y}$, and on the vertical axis, the counted points for that value; the process is repeated for each value. A histogram is for discrete values, therefore, for continuous values, a distribution plot is obtained

![Week%204%20Model%20Development/Screen_Shot_2020-09-22_at_22.15.04.png](Week%204%20Model%20Development/Screen_Shot_2020-09-22_at_22.15.04.png)

```python
ax1 = sns.distplot(df["target"], hist=False, color "r", label="Actual Value")
sns.distplot(Yhat, hist=False, color="b", label="Fitted Value", ax=ax1)
```

# Polynomial Regression

Polynomial regression is a special case of the general linear regression. It's useful for describing curvilinear relationships.

- Quadratic - 2nd Order

$$
\hat{Y} = b_0 + b_1x_1 + b_2(x_1)^2
$$

![Week%204%20Model%20Development/Screen_Shot_2020-09-23_at_22.27.30.png](Week%204%20Model%20Development/Screen_Shot_2020-09-23_at_22.27.30.png)

- Cubic - 3rd Order

$$
\hat{Y} = b_0 +b_1x_1+b_2(x_1)^2+b_3(x_1)^3
$$

![Week%204%20Model%20Development/Screen_Shot_2020-09-23_at_22.27.43.png](Week%204%20Model%20Development/Screen_Shot_2020-09-23_at_22.27.43.png)

- High Order

$$
\hat{Y} = b_0 + b_1x_1+b_2(x_1)^2 + ... + b_n(x_1)^n
$$

![Week%204%20Model%20Development/Screen_Shot_2020-09-23_at_22.28.08.png](Week%204%20Model%20Development/Screen_Shot_2020-09-23_at_22.28.08.png)

The degree of the regression makes a big difference and can result in a better fit by picking the right value.

A third order polynomial regression can be created in python as:

```python
f = np.polyfit(x,y,3)
p = np.poly1d(f)
print(p)
```

which returns then something like:

$$
-1.557(x_1)^3+204.8(x_1)^2+8965x_1+1.37e10^5
$$

## Polynomial Regression with More than One Dimension

An example:

$\hat{Y} = b_0+b_1X_1+b_2X_2+b_3X_1X_2+b_4(X_1)^2+b_5(X_2)^2+...$

Multi dimensional polynomial linear regression can get complicated and cannot be computed used numpy polyfit, instead, use scikit-learn preprocessing package:

```python
from sklearn.preprocessing import PolynomialFeatures
pr = PolynomialFeatures(degree=2, include_bias=False)
pr.fit_transform([x1,x2], inclide_bias=False)
```

## Pre-processing

As the dimension of the data gets larger, normalization of multiple features is needed:

```python
from sklearn.preprocessing import StandardScaler
SCALE = StandardScaler()
SCALE.fit(x_data[["feature_1","feature_2"]])
x_scale = SCALE.transform(x_data[["feature_1","feature_3"]])
```

# Pipelines

The code can be simplified using a pipeline library. There are many steps to getting a prediction. For example: normalization, polynomial transform, and linear regression. Using a pipeline this process can be simplified. Pipelines sequentially perform a series of transformations and the last step carries out the prediction:

Import all the required modules included the pipeline package

```python
from sklearn.preprocessing import PolynomialFeatures
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
```

Then, create a list of tuples. the first element in the tuple contains the name of the estimator model, the second contains the model constructor. The list is inputed in the pipeline constructor, creating then a pipeline object. The pipeline can then be trained and obtained a prediction from, using the train method onto the pipeline object:

```python
Input = [("scale",StandardScaler()),("polynomial",PolynomialFeatures(degree=2),("mode",LinearRegression())]
pipe = Pipeline(Input)
pipe.fit(df[["feature_1","feature_2","feature_n"]],y)
yhat = pipe.predict(df[["feature_1","feature_2","feature_n"]])
# pipe.predict(np.array(10.0).reshape(-1,1))
```

The method normalizes the data, performs a polynomial transform and outputs a prediction.

# Measures for In-Sample Evaluation

A way to numerically evaluate how good the model fits on the dataset. Two important measures are Mean Squared Error (MSE) and R-squared ($R^2)$.

## Mean Squared Error (MSE)

Calculate de difference between the actual value $Y$ and the predicted value $\hat{Y}$, then square the result. After, take the average or mean of all the squared errors by adding them together and dividing by the number of samples.

$$
MSE = \sum\limits_{i=1}^{n}\frac{(\hat{Y}-Y)^2}{n}
$$

```python
from sklearn.metrics import mean_squared_error
mean_squared_error(df["target"],df["predicted_target"])
```

## R-squared ($R^2)$

Know also as the Coefficient of Determination. It's a measure to determine how close the data is to the fitted regression line. It shows the percentage of variation of the target variable that is explained by the linear model

$$
R^2 = (1-\frac{MSE \;of \; regression \; line}{MSE \; of \: the \; average \; of \; the \; data})
$$

A value of $R^2$ close to 1 represents a good fit of the regression line to the data. Conversely, a value close to 0 represents a bad fit.

After fitting the linear regression model to the data, the coefficient of determination can be obtained via:

```python
# model_object.fit(X,Y)
model_object.score(X,Y)
```

As an example, this method can return a value i.e., of 0.4965. This can be understood as 49.65% of the variation of the target can be explained by the model. The $R^2$ value is usually between 0 and 1; if it's negative, it can be due to over fitting. Acceptable values are above 0.10

# Prediction and Decision Making

How can we determine if our model is correct? To determine the final best fit, we look at a combination of:

- Make sure the model results make sense
- Visualization
- Numerical measures
- Compare different models

Make sure the predicted values are, for example, not negative (if it's the case), not extremely high nor low. Sometimes the result prediction shows that the linear assumption is incorrect, or there is not enough data for the range in question. 

To create a new input sequence for prediction:

```python
new_input = np.arange(1,101,1).reshape(-1,1)
# Creates an array from 1 to 101 (non inclusive) in steps of 1
yhat = lm.predict(new_input)
# The output is an array
```

Thereafter, use visualization in order to see how the predicted values fit (or not) the real data.

A lower MSE does not necessarily implies a better fit. MSE for an MLR model will be smaller that the MSE for an SLR model, since errors of the data will decrease when more variables are included in the model. Polynomial regression will also have a smaller MSE than regular regression. A similar inverse relationship holds for $R^2$.

- What is a good R-squared value?

When comparing models, **the model with the higher R-squared value is a better fit** for the data.

- What is a good MSE?

When comparing models, **the model with the smallest MSE value is a better fit** for the data

# Code Snipplets

### Visualize Regression Plot

```python
width = 12
height = 10
plt.figure(figsize=(width, height))
sns.regplot(x="highway-mpg", y="price", data=df)
plt.ylim(0,)
```

### Visualize Multiple Linear Regression Plot

```python
Z = df[['horsepower', 'curb-weight', 'engine-size', 'highway-mpg']]
Y_hat = lm.predict(Z)

plt.figure(figsize=(width, height))

ax1 = sns.distplot(df['price'], hist=False, color="r", label="Actual Value")
sns.distplot(Y_hat, hist=False, color="b", label="Fitted Values" , ax=ax1)

plt.title('Actual vs Fitted Values for Price')
plt.xlabel('Price (in dollars)')
plt.ylabel('Proportion of Cars')

plt.show()
plt.close()
```

### Visualize Polynomial Regression

```python
def PlotPolly(model, independent_variable, dependent_variabble, Name):
    x_new = np.linspace(15, 55, 100)
    y_new = model(x_new)

    plt.plot(independent_variable, dependent_variabble, '.', x_new, y_new, '-')
    plt.title('Polynomial Fit with Matplotlib for Price ~ Length')
    ax = plt.gca()
    ax.set_facecolor((0.898, 0.898, 0.898))
    fig = plt.gcf()
    plt.xlabel(Name)
    plt.ylabel('Price of Cars')

    plt.show()
    plt.close()

x = df['highway-mpg']
y = df['price']

f = np.polyfit(x, y, 3)
p = np.poly1d(f)
print(p)

PlotPolly(p, x, y, 'highway-mpg')
```

### Multivariate Polynomial Function

```python
from sklearn.preprocessing import PolynomialFeatures

pr=PolynomialFeatures(degree=2)
Z_pr=pr.fit_transform(Z)
Z.shape
Z_pr.shape
```

### Pipeline

```python
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

Input=[('scale',StandardScaler()), ('polynomial', PolynomialFeatures(include_bias=False)), ('model',LinearRegression())]
pipe=Pipeline(Input)
pipe.fit(Z,y)
ypipe=pipe.predict(Z)
ypipe[0:4]
```

### $R^2$ in Polynomial Fit

```python
from sklearn.metrics import r2_score
r_squared = r2_score(y, p(x))
```