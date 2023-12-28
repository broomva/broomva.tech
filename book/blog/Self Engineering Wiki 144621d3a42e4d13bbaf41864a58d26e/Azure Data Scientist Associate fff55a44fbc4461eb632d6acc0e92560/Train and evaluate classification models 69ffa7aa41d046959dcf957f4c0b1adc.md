# Train and evaluate classification models


*Classification* is a form of machine learning in which you train a model to predict which category an item belongs to. For example, a health clinic might use diagnostic data such as a patient's height, weight, blood pressure, blood-glucose level to predict whether or not the patient is diabetic.

*Categorical* data has distinct 'classes', rather than numeric values. Some kinds of data can be either numeric or categorical: the time to run a race could be a time in seconds, or we could split times into classes of ‘fast’, ‘medium’ and ‘slow’ - categorical. While other kinds of data can only be categorical, such as a type of shape - ‘circle’, ‘triangle’, or ‘square’.

# **What is classification?**

*Binary* classification is classification with two categories. For example, we could label patients as non-diabetic or diabetic.

The class prediction is made by determining the *probability* for each possible class as a value between 0 -impossible - and 1 - certain. The total probability for all classes is 1, as the patient is definitely either diabetic or non-diabetic. So, if the predicted probability of a patient being diabetic is 0.3, then there is a corresponding probability of 0.7 that the patient is non-diabetic.

A threshold value, usually 0.5, is used to determine the predicted class - so if the *positive* class (in this case, diabetic) has a predicted probability greater than the threshold, then a classification of diabetic is predicted.

Classification is an example of a *supervised* machine learning technique, which means it relies on data that includes known *feature* values (for example, diagnostic measurements for patients) as well as known *label* values (for example, a classification of non-diabetic or diabetic). A classification algorithm is used to fit a subset of the data to a function that can calculate the probability for each class label from the feature values. The remaining data is used to evaluate the model by comparing the predictions it generates from the features to the known class labels.