# Week 4


# Hyperparameter Tuning

# Ensambling

## Validation schemes for 2-nd level models

---

There are a number of ways to validate **second level models** (**meta-models**). In this reading material you will find a description for the most popular ones. If not specified, we assume that the data does not have a time component. We also assume we already validated and fixed hyperparameters for the **first level models (models).**

***a) Simple holdout scheme***

1. Split  into three parts:  and  and .
    
    train data
    
    partA
    
    partB
    
    partC
    
2. Fit N diverse **models** on , predict for , ,  getting *meta-features* ,  and  respectively.
    
    partA
    
    partB
    
    partC
    
    test_data
    
    partB_meta
    
    partC_meta
    
    test_meta
    
3. Fit a **metamodel** to a  while validating its hyperparameters on .
    
    partB_meta
    
    partC_meta
    
4. When the **metamodel** is validated, fit it to [, ] and predict for .
    
    partB_meta
    
    partC_meta
    
    test_meta
    

***b) Meta holdout scheme with OOF meta-features***

1. Split  into K folds. Iterate though each fold: retrain N diverse **models** on all folds except current fold, predict for the current fold. After this step for each object in  we will have N *meta-features* (also known as *out-of-fold predictions, OOF*). Let's call them .
    
    train data
    
    train_data
    
    train_meta
    
2. Fit **models** to ****whole  and predict for . Let's call these features ****.
    
    train data
    
    test data
    
    test_meta
    
3. Split  into two parts:  and . Fit a **meta-model** to  while validating its hyperparameters on .
    
    train_meta
    
    train_metaA
    
    train_metaB
    
    train_metaA
    
    train_metaB
    
4. When the **meta-model** is validated, fit it to  and predict for .
    
    train_meta
    
    test_meta
    

***c) Meta KFold scheme with OOF meta-features***

1. Obtain *OOF predictions*  and test metafeatures  using **b.1** and **b.2.**
    
    train_meta
    
    test_meta
    
2. Use KFold scheme on  to validate hyperparameters for **meta-model**. A common practice to fix seed for this KFold to be the same as seed for KFold used to get *OOF predictions*.
    
    train_meta
    
3. When the **meta-model** is validated, fit it to  and predict for .
    
    train_meta
    
    test_meta
    

***d) Holdout scheme with OOF meta-features***

1. Split  into two parts:  and .
    
    train data
    
    partA
    
    partB
    
2. Split  into K folds. Iterate though each fold: retrain N diverse **models** on all folds except current fold, predict for the current fold. After this step for each object in  we will have N *meta-features* (also known as *out-of-fold predictions, OOF*). Let's call them .
    
    partA
    
    partA
    
    partA_meta
    
3. Fit **models** to ****whole  and predict for  and , etting  and  respectively.
    
    partA
    
    partB
    
    test_data
    
    g
    
    partB_meta
    
    test_meta
    
4. Fit a **meta-model** to a  using  to validate its hyperparameters.
    
    partA_meta,
    
    partB_meta
    
5. When the **meta-model** is validated basically do 2. and 3. without dividing  into parts and then train a **meta-model**. That is, first get *out-of-fold predictions*  for the  using **models.** Then train **models** on , predict for , getting . Train **meta-model** on the  and predict for .
    
    train_data
    
    train_meta
    
    train_data
    
    train_data
    
    test_data
    
    test_meta
    
    train_meta
    
    test_meta
    

**e) KFold scheme with OOF meta-features**

1. To validate the model we basically do **d.1 -- d.4** but we divide **** into parts  and  M times using KFold strategy with M folds.
    
    train data
    
    partA
    
    partB
    
2. When the meta-model is validated do **d.5.**

## Validation in presence of time component

***f) KFold scheme in time series***

In time-series task we usually have a fixed period of time we are asked to predict. Like day, week, month or arbitrary period with duration of **T**.

1. Split the train data into chunks of duration **T**. Select first **M** chunks.
2. Fit N diverse models on those **M** chunks and predict for the chunk **M+1**. Then fit those models on first **M+1** chunks and predict for chunk **M+2** and so on, until you hit the end. After that use all train data to fit models and get predictions for test. Now we will have *meta-features* for the chunks starting from number **M+1** as well as *meta-features* for the test.
3. Now we can use *meta-features* from first **K** chunks [**M+1**,**M+2**,..,**M+K**] to fit level 2 models and validate them on chunk **M+K+1**. Essentially we are back to step 1. with the lesser amount of chunks and *meta-features* instead of features.

***g) KFold scheme in time series with limited amount of data***

We may often encounter a situation, where scheme **f)** is not applicable, especially with limited amount of data. For example, when we have only years 2014, 2015, 2016 in train and we need to predict for a whole year 2017 in test. In such cases scheme **c)** could be of help, but with one constraint: KFold split should be done with the respect to the time component. For example, in case of data with several years we would treat each year as a fold.

# Example Notebooks

[Hyperparameters_tuning_video2_RF_n_estimators.ipynb](Week%204/Hyperparameters_tuning_video2_RF_n_estimators.ipynb)

[Macros.ipynb](Week%204/Macros.ipynb)

[compute_KNN_features.ipynb](Week%204/compute_KNN_features.ipynb)

# Additional Material

- [Tuning the hyper-parameters of an estimator (sklearn)](http://scikit-learn.org/stable/modules/grid_search.html)
- [Optimizing hyperparameters with hyperopt](http://fastml.com/optimizing-hyperparams-with-hyperopt/)
- [Complete Guide to Parameter Tuning in Gradient Boosting (GBM) in Python](https://www.analyticsvidhya.com/blog/2016/02/complete-guide-parameter-tuning-gradient-boosting-gbm-python/)

[Far0n's framework for Kaggle competitions "kaggletils"](https://github.com/Far0n/kaggletils)

[28 Jupyter Notebook tips, tricks and shortcuts](https://www.dataquest.io/blog/jupyter-notebook-tips-tricks-shortcuts/)

## Matrix Factorization:

- [Overview of Matrix Decomposition methods (sklearn)](http://scikit-learn.org/stable/modules/decomposition.html)

## t-SNE:

- [Multicore t-SNE implementation](https://github.com/DmitryUlyanov/Multicore-TSNE)
- [Comparison of Manifold Learning methods (sklearn)](http://scikit-learn.org/stable/auto_examples/manifold/plot_compare_methods.html)
- [How to Use t-SNE Effectively (distill.pub blog)](https://distill.pub/2016/misread-tsne/)
- [tSNE homepage (Laurens van der Maaten)](https://lvdmaaten.github.io/tsne/)
- [Example: tSNE with different perplexities (sklearn)](http://scikit-learn.org/stable/auto_examples/manifold/plot_t_sne_perplexity.html#sphx-glr-auto-examples-manifold-plot-t-sne-perplexity-py)

## Interactions:

- [Facebook Research's paper about extracting categorical features from trees](https://research.fb.com/publications/practical-lessons-from-predicting-clicks-on-ads-at-facebook/)
- [Example: Feature transformations with ensembles of trees (sklearn)](http://scikit-learn.org/stable/auto_examples/ensemble/plot_feature_transformation.html)

- [Kaggle ensembling guide at MLWave.com (overview of approaches)](https://mlwave.com/kaggle-ensembling-guide/)
- [StackNet — a computational, scalable and analytical meta modelling framework (by KazAnova)](https://github.com/kaz-Anova/StackNet)
- [Heamy — a set of useful tools for competitive data science (including ensembling)](https://github.com/rushter/heamy)