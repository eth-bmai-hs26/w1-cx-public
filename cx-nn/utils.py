# ============================================================
# utils.py — Helper functions for the Neural Network notebooks
#
# This file contains all the "boilerplate" code so the
# notebooks can focus on the parts that matter most.
#
# You can open this file any time to see exactly what each
# helper function does under the hood.
# ============================================================

# --- Deep learning ---
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader

# --- Data handling ---
import numpy as np
import pandas as pd
import os
import random

# kagglehub is imported lazily inside load_dataset(): if the install failed
# or the package is missing, the notebook still works via the offline dataset.

# --- Machine learning utilities ---
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

# --- Visualization ---
import matplotlib.pyplot as plt
import seaborn as sns

# ============================================================
# 0. SHARED CONSTANTS & HOUSE PLOT STYLE
# ============================================================

# One seed for the whole exercise: data splits, weight initialisation and
# every sampling step below use it, so two students running the same
# notebook get the same numbers.
RANDOM_STATE = 42

# Shared colour palette — reused by every chart in the notebooks so that
# "good", "bad" and "caution" always look the same.
PURPLE, PURPLE2 = '#667eea', '#764ba2'                 # primary / gradient accent
GREEN, RED, AMBER = '#39b36a', '#e0796d', '#e0a23c'    # good / bad / caution

# Apply a clean visual style for all plots
sns.set_style("whitegrid")
plt.rcParams['figure.figsize'] = (10, 6)
plt.rcParams['figure.dpi'] = 110
plt.rcParams['axes.spines.top'] = False
plt.rcParams['axes.spines.right'] = False


def set_seed(seed=RANDOM_STATE):
    """
    Make a notebook run reproducible.

    Neural networks start from randomly initialised weights, so two runs of
    the same notebook normally give slightly different numbers. Fixing the
    seed of every random number generator we use removes that variation.

    Args:
        seed (int): The seed to use. Defaults to RANDOM_STATE.

    Returns:
        int: The seed that was applied (handy for printing it).
    """
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    return seed


# ============================================================
# 1. DATA LOADING
# ============================================================

def _build_house_dataset(n=10000, seed=RANDOM_STATE):
    """
    Offline stand-in for the Kaggle house price dataset.

    Used only when the Kaggle download fails (no internet in the lecture
    room, Kaggle rate limit, ...) so that the notebook always runs
    end-to-end. It has the same four columns and the same broad structure
    as the real file, and it is deliberately built so that every teaching
    moment in the notebook still lands:

      * `square_feet` dominates the price → Part 1's correlation chart has
        one obviously strongest predictor to point at.
      * `age` and `distance_to_city(km)` push the price *down*, so the
        correlation chart shows both signs and the "which features matter"
        discussion has something to compare.
      * `num_rooms` is largely a consequence of size → a feature that looks
        informative on its own but adds little once size is known.
      * The price/size relationship is mildly non-linear (a square-root
        term) and noise grows with price, so a linear model leaves visible
        structure on the table and the network has a reason to exist.

    Args:
        n (int): Number of houses to generate.
        seed (int): Seed for the random number generator.

    Returns:
        pandas.DataFrame: One row per house, same columns as the Kaggle file.
    """
    rng = np.random.default_rng(seed)

    square_feet = np.clip(rng.normal(2000, 650, n), 500, 6000)
    num_rooms = np.clip(np.round(square_feet / 450 + rng.normal(0, 0.8, n)), 1, 12)
    age = np.clip(rng.gamma(2.2, 9.0, n), 0, 100)
    distance = np.clip(rng.gamma(2.0, 5.0, n), 0.2, 45)

    price = (
        60_000
        + 145 * square_feet
        + 900 * np.sqrt(square_feet) * 10        # mild non-linearity in size
        + 6_500 * num_rooms
        - 3_400 * age
        - 6_000 * distance
    )
    # Noise proportional to price: expensive houses are harder to price.
    price = price * rng.normal(1.0, 0.11, n)
    price = np.clip(price, 40_000, None)

    return pd.DataFrame({
        'square_feet': np.round(square_feet, 1),
        'num_rooms': num_rooms.astype(int),
        'age': np.round(age, 1),
        'distance_to_city(km)': np.round(distance, 2),
        'price': np.round(price, 2),
    })


def load_dataset(force_offline=False):
    """
    Load the house price dataset and remove extreme outlier prices.

    Kaggle is the real source. If the download fails for any reason (no
    internet, no Kaggle credentials, rate limit) we fall back to an
    equivalent synthetic dataset built locally from a fixed seed, so the
    notebook never hard-fails in front of a room.

    The fallback is a stand-in, not a copy: it has the same columns and the
    same broad structure, but the individual houses are different, so the
    dollar figures printed later in the notebook will not match the ones a
    student who reached Kaggle sees. The printout says so explicitly when
    that happens.

    Args:
        force_offline (bool): Skip Kaggle and build the dataset locally.
            Use it to check that the fallback path still works before a
            lecture — it is the only way that path ever gets exercised.

    Returns:
        pandas.DataFrame: One row per house.
    """
    df = None

    if not force_offline:
        try:
            import kagglehub

            print("Downloading dataset from Kaggle...")
            dataset_path = kagglehub.dataset_download(
                'muhamedumarjamil/house-price-prediction-dataset'
            )
            csv_file = os.path.join(dataset_path, 'house_prices_dataset.csv')
            df = pd.read_csv(csv_file)
            print(f"Dataset loaded: {len(df)} houses, {len(df.columns)} columns")
        except Exception as error:
            print(f"⚠️  Kaggle download unavailable ({type(error).__name__}).")

    if df is None:
        print("→ Using the offline stand-in dataset instead. Everything in this "
              "notebook still runs and every lesson still holds, but these are "
              "different houses: your dollar figures will differ from those of "
              "classmates who reached Kaggle.")
        df = _build_house_dataset()
        print(f"Dataset built offline: {len(df)} houses, {len(df.columns)} columns")

    # Remove extreme outliers (prices more than 3 std from the mean in log space)
    log_prices = np.log(df['price'])
    outlier_mask = np.abs(log_prices - log_prices.mean()) <= 3 * log_prices.std()
    df = df[outlier_mask].copy()

    print(f"After removing extreme outliers: {len(df)} houses remaining")
    print("Dataset ready!")
    return df


def generate_car_dataset(n=3000):
    """
    Generate a synthetic car fuel efficiency dataset with n cars.

    Each row represents a car described by 8 features:
      cylinders, displacement_L, horsepower, weight_kg,
      acceleration, model_year, is_hybrid, drag_coeff

    The target column 'mpg' (miles per gallon) is generated with a
    realistic formula: fewer cylinders, lighter weight, newer model,
    hybrid engine, and better aerodynamics all increase fuel efficiency.
    Gaussian noise is added to make it a genuine learning problem.

    Returns a pandas DataFrame ready for the next preprocessing steps.
    """
    np.random.seed(42)

    cylinders      = np.random.choice([4, 6, 8], n, p=[0.50, 0.30, 0.20]).astype(float)
    displacement_L = cylinders * np.random.uniform(0.25, 0.75, n)
    horsepower     = displacement_L * np.random.uniform(40, 80, n) + np.random.normal(0, 10, n)
    horsepower     = np.maximum(horsepower, 50)
    weight_kg      = np.random.uniform(800, 2500, n)
    acceleration   = np.random.uniform(6, 22, n)            # seconds to 100 km/h
    model_year     = np.random.randint(1970, 2024, n).astype(float)
    is_hybrid      = np.random.choice([0, 1], n, p=[0.75, 0.25]).astype(float)
    drag_coeff     = np.random.uniform(0.25, 0.55, n)

    mpg = (
        50.0
        - 2.0  * cylinders
        - 1.5  * displacement_L
        - 0.03 * horsepower
        - 0.006 * weight_kg
        + 0.15 * acceleration
        + 0.15 * (model_year - 1970)
        + 6.0  * is_hybrid
        - 12.0 * drag_coeff
        + np.random.normal(0, 2, n)
    )
    mpg = np.maximum(mpg, 10)

    df = pd.DataFrame({
        'cylinders':      cylinders,
        'displacement_L': displacement_L,
        'horsepower':     horsepower,
        'weight_kg':      weight_kg,
        'acceleration':   acceleration,
        'model_year':     model_year,
        'is_hybrid':      is_hybrid,
        'drag_coeff':     drag_coeff,
        'mpg':            mpg,
    })

    print(f"Dataset generated: {len(df)} cars, {len(df.columns)} columns")
    print(f"MPG range: {mpg.min():.1f} – {mpg.max():.1f}  |  Mean: {mpg.mean():.1f}")
    return df


# ============================================================
# 2. DATA VISUALIZATION
# ============================================================

def plot_dataset(df):
    """
    Show 4 charts to explore the house price dataset:
      1. Distribution of house prices
      2. Which features are most correlated with price
      3. House size vs price
      4. House age vs price
    """
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))

    # 1. Distribution of house prices
    axes[0, 0].hist(df['price'], bins=50, color=PURPLE,
                    edgecolor='white', alpha=0.75)
    axes[0, 0].set_xlabel('House Price ($)')
    axes[0, 0].set_ylabel('Frequency')
    axes[0, 0].set_title('Distribution of House Prices')
    axes[0, 0].axvline(df['price'].mean(), color=RED, linestyle='--',
                       label=f'Mean: ${df["price"].mean():,.0f}')
    axes[0, 0].legend()

    # 2. Feature correlations with price
    feature_cols = [c for c in df.columns if c != 'price']
    correlations = [df[c].corr(df['price']) for c in feature_cols]
    colors = [GREEN if c > 0 else RED for c in correlations]
    axes[0, 1].barh(feature_cols, correlations, color=colors, alpha=0.85)
    axes[0, 1].set_xlabel('Correlation with Price')
    axes[0, 1].set_title('Feature Correlation with House Price')
    axes[0, 1].axvline(0, color='black', linewidth=0.5)

    # 3. House size vs price
    axes[1, 0].scatter(df['square_feet'], df['price'], alpha=0.3, s=5,
                       c=PURPLE)
    axes[1, 0].set_xlabel('Square Feet')
    axes[1, 0].set_ylabel('Price ($)')
    axes[1, 0].set_title('House Size vs Price')

    # 4. House age vs price
    axes[1, 1].scatter(df['age'], df['price'], alpha=0.3, s=5, c=PURPLE2)
    axes[1, 1].set_xlabel('Age (years)')
    axes[1, 1].set_ylabel('Price ($)')
    axes[1, 1].set_title('House Age vs Price')

    plt.tight_layout()
    plt.show()


def plot_car_dataset(df):
    """
    Show 4 charts to explore the car fuel efficiency dataset:
      1. Distribution of MPG
      2. Which features are most correlated with MPG
      3. Car weight vs MPG
      4. Horsepower vs MPG
    """
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))

    # 1. Distribution of MPG
    axes[0, 0].hist(df['mpg'], bins=50, color='steelblue', edgecolor='white', alpha=0.8)
    axes[0, 0].axvline(df['mpg'].mean(), color='red', linestyle='--',
                       label=f'Mean: {df["mpg"].mean():.1f} MPG')
    axes[0, 0].set_xlabel('Fuel Efficiency (MPG)')
    axes[0, 0].set_ylabel('Frequency')
    axes[0, 0].set_title('Distribution of Fuel Efficiency')
    axes[0, 0].legend()

    # 2. Feature correlations with MPG
    feature_cols = [c for c in df.columns if c != 'mpg']
    correlations = [df[c].corr(df['mpg']) for c in feature_cols]
    colors = ['seagreen' if c > 0 else 'tomato' for c in correlations]
    axes[0, 1].barh(feature_cols, correlations, color=colors, alpha=0.8)
    axes[0, 1].axvline(0, color='black', linewidth=0.8)
    axes[0, 1].set_xlabel('Correlation with MPG')
    axes[0, 1].set_title('Feature Correlation with Fuel Efficiency')

    # 3. Weight vs MPG
    axes[1, 0].scatter(df['weight_kg'], df['mpg'], alpha=0.3, s=8, c='steelblue')
    axes[1, 0].set_xlabel('Weight (kg)')
    axes[1, 0].set_ylabel('Fuel Efficiency (MPG)')
    axes[1, 0].set_title('Car Weight vs Fuel Efficiency')

    # 4. Horsepower vs MPG
    axes[1, 1].scatter(df['horsepower'], df['mpg'], alpha=0.3, s=8, c='darkorange')
    axes[1, 1].set_xlabel('Horsepower (HP)')
    axes[1, 1].set_ylabel('Fuel Efficiency (MPG)')
    axes[1, 1].set_title('Horsepower vs Fuel Efficiency')

    plt.tight_layout()
    plt.show()


# ============================================================
# 3. DATA PREPARATION — BASE NOTEBOOK
# ============================================================

def prepare_data(df):
    """
    Get the dataset ready for training (base notebook version).

    Steps done inside this function:
      1. Separate features (inputs) from the target (price)
      2. Split into train / validation / test sets (80% / 10% / 10%)
      3. Standardize all values so the model trains efficiently
      4. Convert everything to PyTorch tensors

    Returns (in order):
      train_features_t, val_features_t, test_features_t   — input tensors
      train_prices_t, val_prices_t, test_prices_t          — scaled price tensors
      test_prices_original                                  — real dollar prices for the test set
      price_scaler                                          — needed to convert predictions back to $
    """
    # Step 1: Separate features and target
    feature_columns = [c for c in df.columns if c != 'price']
    features = df[feature_columns].values          # shape: (N, num_features)
    prices   = df['price'].values.reshape(-1, 1)   # shape: (N, 1)

    # Step 2: Split 80% train / 10% validation / 10% test
    train_feat, temp_feat, train_price, temp_price = train_test_split(
        features, prices, test_size=0.2, random_state=RANDOM_STATE
    )
    val_feat, test_feat, val_price, test_price = train_test_split(
        temp_feat, temp_price, test_size=0.5, random_state=RANDOM_STATE
    )

    # Step 3: Scale features (mean=0, std=1) — fit only on training data
    feat_scaler = StandardScaler()
    train_feat = feat_scaler.fit_transform(train_feat)
    val_feat   = feat_scaler.transform(val_feat)
    test_feat  = feat_scaler.transform(test_feat)

    # Scale prices too (needed because we predict raw dollars)
    price_scaler = StandardScaler()
    train_price_scaled = price_scaler.fit_transform(train_price)
    val_price_scaled   = price_scaler.transform(val_price)
    test_price_scaled  = price_scaler.transform(test_price)

    # Step 4: Convert to PyTorch tensors
    train_features_t = torch.tensor(train_feat,          dtype=torch.float32)
    val_features_t   = torch.tensor(val_feat,            dtype=torch.float32)
    test_features_t  = torch.tensor(test_feat,           dtype=torch.float32)
    train_prices_t   = torch.tensor(train_price_scaled,  dtype=torch.float32)
    val_prices_t     = torch.tensor(val_price_scaled,    dtype=torch.float32)
    test_prices_t    = torch.tensor(test_price_scaled,   dtype=torch.float32)

    print(f"Training samples:   {len(train_prices_t)}")
    print(f"Validation samples: {len(val_prices_t)}")
    print(f"Test samples:       {len(test_prices_t)}")
    print(f"Number of features: {train_features_t.shape[1]}")

    return (train_features_t, val_features_t, test_features_t,
            train_prices_t, val_prices_t, test_prices_t,
            test_price, price_scaler)


# ============================================================
# 4. DATA PREPARATION — TRICKS NOTEBOOK
# ============================================================

def split_and_scale_data_tricks(features, log_prices, original_prices):
    """
    Split data into train/val/test sets and scale the features.
    Used in the 'tricks' notebook where the target is log-transformed.

    Note: we only scale the features — log prices are already in a
    good numerical range and don't need scaling.

    Returns (in order):
      train_features, val_features, test_features   — scaled numpy arrays
      train_log_prices, val_log_prices, test_log_prices  — log price arrays
      val_orig_prices, test_orig_prices              — original dollar prices
    """
    # Split 80% train / 10% validation / 10% test
    (train_feat, temp_feat,
     train_log, temp_log,
     train_orig, temp_orig) = train_test_split(
        features, log_prices, original_prices,
        test_size=0.2, random_state=42
    )
    (val_feat, test_feat,
     val_log, test_log,
     val_orig, test_orig) = train_test_split(
        temp_feat, temp_log, temp_orig,
        test_size=0.5, random_state=42
    )

    # Scale features only — fit only on training data to avoid data leakage
    feat_scaler = StandardScaler()
    train_feat = feat_scaler.fit_transform(train_feat)
    val_feat   = feat_scaler.transform(val_feat)
    test_feat  = feat_scaler.transform(test_feat)

    print(f"Training samples:   {len(train_log)}")
    print(f"Validation samples: {len(val_log)}")
    print(f"Test samples:       {len(test_log)}")

    return (train_feat, val_feat, test_feat,
            train_log, val_log, test_log,
            val_orig, test_orig)


def convert_to_tensors(train_feat, val_feat, test_feat,
                       train_prices, val_prices, test_prices):
    """
    Convert six NumPy arrays to PyTorch tensors so they can be
    fed into the neural network.

    Returns (in order):
      train_features_t, val_features_t, test_features_t
      train_prices_t,   val_prices_t,   test_prices_t
    """
    return (
        torch.tensor(train_feat,   dtype=torch.float32),
        torch.tensor(val_feat,     dtype=torch.float32),
        torch.tensor(test_feat,    dtype=torch.float32),
        torch.tensor(train_prices, dtype=torch.float32),
        torch.tensor(val_prices,   dtype=torch.float32),
        torch.tensor(test_prices,  dtype=torch.float32),
    )


# ============================================================
# 5. TRAINING HELPERS
# ============================================================

def run_epoch(model, optimizer, loss_fn, train_X, train_y, val_X, val_y):
    """
    Run one full training epoch on the entire training set,
    then evaluate on the validation set.

    Used in the base notebook (full-batch training).

    Returns:
        train_loss (float): MSE loss on the training set
        val_loss   (float): MSE loss on the validation set
    """
    # Training phase
    model.train()
    predictions = model(train_X)
    train_loss = loss_fn(predictions, train_y)

    optimizer.zero_grad()
    train_loss.backward()
    optimizer.step()

    # Validation phase
    model.eval()
    with torch.no_grad():
        val_predictions = model(val_X)
        val_loss = loss_fn(val_predictions, val_y)

    return train_loss.item(), val_loss.item()


def run_epoch_minibatch(model, optimizer, loss_fn, train_loader, val_X, val_y):
    """
    Run one full training epoch using mini-batches from a DataLoader,
    then evaluate on the full validation set.

    Used in the tricks notebook (mini-batch training).

    Returns:
        train_loss (float): average MSE loss across all training samples
        val_loss   (float): MSE loss on the validation set
    """
    # Training phase (mini-batch)
    model.train()
    epoch_train_loss = 0.0

    for batch_X, batch_y in train_loader:
        predictions = model(batch_X)
        batch_loss = loss_fn(predictions, batch_y)

        optimizer.zero_grad()
        batch_loss.backward()
        optimizer.step()

        epoch_train_loss += batch_loss.item() * len(batch_X)

    epoch_train_loss /= len(train_loader.dataset)

    # Validation phase (full set)
    model.eval()
    with torch.no_grad():
        val_predictions = model(val_X)
        val_loss = loss_fn(val_predictions, val_y)

    return epoch_train_loss, val_loss.item()


# ============================================================
# 6. TRAINING VISUALIZATION
# ============================================================

def plot_training_history(train_losses, val_losses):
    """
    Plot how the training and validation loss changed over time.

    Left panel:  full history on a log scale (shows the big picture)
    Right panel: zoomed into the last 200 epochs (shows fine details)
    """
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    # Left: full loss curves on log scale
    axes[0].plot(train_losses, label='Training Loss',   color=PURPLE, alpha=0.9)
    axes[0].plot(val_losses,   label='Validation Loss', color=AMBER,  alpha=0.9)
    axes[0].set_xlabel('Epoch')
    axes[0].set_ylabel('MSE Loss (log scale)')
    axes[0].set_title('Training & Validation Loss Over Time')
    axes[0].legend()
    axes[0].set_yscale('log')

    # Right: zoomed into the last portion
    zoom_epochs = min(200, len(train_losses))
    axes[1].plot(range(len(train_losses) - zoom_epochs, len(train_losses)),
                 train_losses[-zoom_epochs:], label='Training Loss',
                 color=PURPLE, alpha=0.9)
    axes[1].plot(range(len(val_losses) - zoom_epochs, len(val_losses)),
                 val_losses[-zoom_epochs:], label='Validation Loss',
                 color=AMBER, alpha=0.9)
    axes[1].set_xlabel('Epoch')
    axes[1].set_ylabel('MSE Loss')
    axes[1].set_title(f'Loss Convergence (Last {zoom_epochs} Epochs)')
    axes[1].legend()

    plt.tight_layout()
    plt.show()

    print(f"Final Training Loss:   {train_losses[-1]:.4f}")
    print(f"Final Validation Loss: {val_losses[-1]:.4f}")


# ============================================================
# 7. GETTING PREDICTIONS
# ============================================================

def get_predictions(model, test_features_t, price_scaler):
    """
    Run the model on the test set and convert the scaled predictions
    back into real dollar values.

    Used in the base notebook (where prices were scaled with StandardScaler).
    """
    model.eval()
    with torch.no_grad():
        test_pred_scaled = model(test_features_t).numpy()
    return price_scaler.inverse_transform(test_pred_scaled)


def get_predictions_log(model, test_features_t):
    """
    Run the model on the test set and convert log-price predictions
    back into real dollar values using exp().

    Used in the tricks notebook (where the target was log-transformed).
    """
    model.eval()
    with torch.no_grad():
        test_pred_log = model(test_features_t).numpy()
    return np.exp(test_pred_log)


# ============================================================
# 8. EVALUATION METRICS
# ============================================================

def print_performance_metrics(actual_prices, predicted_prices, show_r2=False, unit='$'):
    """
    Print how well the model performed on the test set.

    Shows:
      - MAE  (Mean Absolute Error): average error in the target unit
      - RMSE (Root Mean Squared Error): penalises large errors more
      - MAPE (Mean Absolute Percentage Error): error as a % of the actual value
      - R²   (Coefficient of Determination): optional, pass show_r2=True

    Also breaks down performance by value range (quartiles).

    Parameters
    ----------
    unit : str
        Unit label for printed values. Use '$' for dollar amounts (prefix)
        or a string like 'MPG' for other units (suffix). Default: '$'.
    """
    actual = actual_prices.flatten()
    pred   = predicted_prices.flatten()

    difference = pred - actual

    mae  = np.mean(np.abs(difference))
    rmse = np.sqrt(np.mean(difference ** 2))
    mape = np.mean(np.abs(difference / actual)) * 100

    # Format a scalar value with the appropriate unit notation
    def _fmt(v, decimals=2):
        if unit == '$':
            return f"${v:,.{decimals}f}"
        return f"{v:.{decimals}f} {unit}"

    print("=" * 55)
    print("           OVERALL TEST SET PERFORMANCE")
    print("=" * 55)
    print()
    print(f"   MAE  (Mean Absolute Error):      {_fmt(mae)}")
    print(f"   RMSE (Root Mean Squared Error):  {_fmt(rmse)}")
    print(f"   MAPE (Mean Absolute % Error):    {mape:.2f}%")

    if show_r2:
        ss_res   = np.sum(difference ** 2)
        ss_tot   = np.sum((actual - np.mean(actual)) ** 2)
        r2_score = 1 - (ss_res / ss_tot)
        print(f"   R²   (Coefficient of Determination): {r2_score:.4f}")

    print()
    print("=" * 55)

    # Performance by value range (quartiles)
    quartiles = np.quantile(actual, [0, 0.25, 0.5, 0.75, 1.0])

    print()
    print("           PERFORMANCE BY QUARTILE")
    print("=" * 55)

    for i in range(4):
        mask   = (actual >= quartiles[i]) & (actual < quartiles[i + 1])
        a, p   = actual[mask], pred[mask]
        mae_q  = np.mean(np.abs(p - a))
        rmse_q = np.sqrt(np.mean((p - a) ** 2))
        mape_q = np.mean(np.abs((p - a) / a)) * 100

        print()
        print(f"  Range {i + 1}: {_fmt(quartiles[i], 0)} → {_fmt(quartiles[i + 1], 0)}")
        print(f"     MAE:  {_fmt(mae_q)}   RMSE: {_fmt(rmse_q)}   MAPE: {mape_q:.2f}%")


def print_new_performance_metrics(actual_prices, predicted_prices, show_r2=False, unit='$'):
    """
    Print a compact summary of model performance on the test set.

    Shows only global metrics (no quartile breakdown):
      - MAE  (Mean Absolute Error)
      - RMSE (Root Mean Squared Error)
      - MAPE (Mean Absolute Percentage Error)
      - R²   (Coefficient of Determination): optional, pass show_r2=True
    """
    actual = actual_prices.flatten()
    pred   = predicted_prices.flatten()

    difference = pred - actual

    mae  = np.mean(np.abs(difference))
    rmse = np.sqrt(np.mean(difference ** 2))
    mape = np.mean(np.abs(difference / actual)) * 100

    def _fmt(v, decimals=2):
        if unit == '$':
            return f"${v:,.{decimals}f}"
        return f"{v:.{decimals}f} {unit}"

    print(f"  MAE:  {_fmt(mae)}   RMSE: {_fmt(rmse)}   MAPE: {mape:.2f}%", end='')

    if show_r2:
        ss_res   = np.sum(difference ** 2)
        ss_tot   = np.sum((actual - np.mean(actual)) ** 2)
        r2_score = 1 - (ss_res / ss_tot)
        print(f"   R²: {r2_score:.4f}", end='')

    print()


# ============================================================
# 9. PREDICTION VISUALIZATIONS
# ============================================================

def plot_predictions(actual_prices, predicted_prices, target_name='Price', unit='($)'):
    """
    Show 3 charts comparing what the model predicted vs the actual values:
      1. Scatter plot: predicted vs actual (perfect model = diagonal line)
      2. Histogram of errors (perfect model = narrow spike at 0)
      3. Bar chart comparing 20 random samples side-by-side

    Parameters
    ----------
    target_name : str
        Human-readable name of the target variable (e.g. 'Price', 'Fuel Efficiency').
        Used in axis labels and the chart title. Default: 'Price'.
    unit : str
        Unit label shown in parentheses on axis labels (e.g. '($)', '(MPG)').
        Default: '($)'.
    """
    actual = np.array(actual_prices).flatten()
    pred   = np.array(predicted_prices).flatten()

    fig, axes = plt.subplots(1, 3, figsize=(16, 5))

    # 1. Predicted vs Actual scatter
    axes[0].scatter(actual, pred, alpha=0.5, s=10, c=PURPLE)
    lo = min(actual.min(), pred.min())
    hi = max(actual.max(), pred.max())
    axes[0].plot([lo, hi], [lo, hi], '--', color=RED, linewidth=2,
                 label='Perfect prediction')
    axes[0].set_xlabel(f'Actual {target_name} {unit}')
    axes[0].set_ylabel(f'Predicted {target_name} {unit}')
    axes[0].set_title(f'Predicted vs Actual {target_name}')
    axes[0].legend()

    # 2. Residuals histogram
    residuals = pred - actual
    axes[1].hist(residuals, bins=50, color=PURPLE, edgecolor='white', alpha=0.75)
    axes[1].axvline(0, color=RED, linestyle='--', linewidth=2)
    axes[1].set_xlabel(f'Prediction Error {unit}')
    axes[1].set_ylabel('Frequency')
    axes[1].set_title('Distribution of Prediction Errors')

    # 3. Sample comparison bar chart (20 random samples)
    # Local generator: picking the sample must not disturb the global RNG state
    sample_idx = np.random.default_rng(RANDOM_STATE).choice(len(actual), 20, replace=False)
    x_pos, width = np.arange(20), 0.35
    axes[2].bar(x_pos - width / 2, actual[sample_idx], width, label='Actual',
                color=PURPLE2, alpha=0.85)
    axes[2].bar(x_pos + width / 2, pred[sample_idx],   width, label='Predicted',
                color=AMBER, alpha=0.85)
    axes[2].set_xlabel('Sample Index')
    axes[2].set_ylabel(f'{target_name} {unit}')
    axes[2].set_title('Sample Predictions vs Actual')
    axes[2].legend()
    axes[2].set_xticks(x_pos)

    plt.tight_layout()
    plt.show()
