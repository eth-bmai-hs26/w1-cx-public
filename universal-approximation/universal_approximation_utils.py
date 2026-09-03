"""Engine and helpers for the VeloZüri universal-approximation exercise.

Three things live here so the notebook cells can stay about the *idea*:

1. The VeloZüri data: the ground-truth demand functions, the seeded builders, and a
   loader that pulls the CSVs from the private course repo and silently falls back to
   rebuilding them offline. `generate_velozueri_dataset.py` imports these builders rather
   than owning a second copy, so the notebook's offline data can never drift from the
   committed CSVs. That script holds the *design rationale* for why the data is shaped
   the way it is. Read it first if you are wondering why a peak sits where it sits.
2. `TinyMLP`, a small feed-forward neural network written in plain NumPy: forward pass,
   backpropagation and the Adam optimiser, about a hundred lines and no deep-learning
   framework anywhere.
3. Plotting helpers in the notebook's house style.

Nothing here is the exercise. The students fill in the decision-relevant part in the
notebook; this module is the engine they run it against.
"""

from __future__ import annotations

import os
import subprocess
import sys

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# ── House palette (kept identical to the notebook Setup cell) ────────────────
PURPLE, PURPLE2 = '#667eea', '#764ba2'
GREEN, RED, AMBER = '#39b36a', '#e0796d', '#e0a23c'
INK, MUTED = '#2b2b3a', '#8b8ba7'

RANDOM_STATE = 42

# ═══════════════════════════════════════════════════════════════════════════════
# 1. The VeloZüri world
# ═══════════════════════════════════════════════════════════════════════════════
# Dataset A: hourly demand at the Zürich Hauptbahnhof dock
OPENING_HOUR, CLOSING_HOUR = 5.0, 23.0
N_DAYS = 40
SLOT_MINUTES = 30

# (amplitude, centre hour, width in hours)
HOURLY_PEAKS = (
    (150.0, 8.10, 0.75),   # morning commute, narrow + isolated, for the 3-ramp bump
    (45.0, 12.40, 0.90),   # lunch
    (190.0, 17.70, 1.00),  # evening commute, the tallest structure of the day
    (35.0, 20.80, 1.60),   # evening leisure, broad tail
)
DAWN_LEVEL, DAWN_HOUR, DAWN_SHARPNESS = 26.0, 6.55, 2.4
DAY_FACTOR_SD = 0.12

# Dataset B: demand across the city
CITY_HALF_WIDTH = 6.0        # km, so the map is a 12 km x 12 km box around the HB
CITY_BASELINE = 18.0         # demand in the far outskirts
CITY_GLOW, CITY_GLOW_SIGMA = 75.0, 4.2   # broad "denser near the centre" envelope
N_STATIONS = 700
TRUTH_GRID = 100

# (amplitude, x_km, y_km, sigma_km)
CITY_HOTSPOTS = (
    (300.0, 0.00, 0.00, 0.80),    # Hauptbahnhof
    (200.0, 0.40, 4.20, 1.00),    # Oerlikon
    (190.0, 2.60, -2.00, 0.85),   # Seefeld / Bellevue (lakeside)
    (130.0, -3.80, -0.80, 0.95),  # Altstetten
    (115.0, -2.60, 2.80, 0.85),   # ETH Hönggerberg
    (110.0, -1.00, -3.20, 0.95),  # Wiedikon / Enge
    (100.0, 3.40, 2.60, 1.05),    # Schwamendingen
)
HOTSPOT_NAMES = ('Hauptbahnhof', 'Oerlikon', 'Seefeld', 'Altstetten',
                 'Hönggerberg', 'Wiedikon', 'Schwamendingen')

LAKE_NORMAL = (0.62, -0.78)
LAKE_POINT = (3.20, -2.60)
LAKE_EDGE_WIDTH = 0.45


def soft_switch(hour, centre, sharpness):
    """A single sigmoid neuron, written the way a human reads it.

    ``sigmoid(w * hour + b)`` with ``sharpness = w`` and ``centre = -b / w``: the output
    slides from 0 to 1, crossing 0.5 exactly at ``centre``. The notebook no longer teaches
    with this shape, it teaches with ReLU ramps (:func:`relu_ramp` and friends), but the
    dawn rise in :func:`hourly_demand_curve` is still generated with one, so a smooth,
    genuinely S-shaped rise is sitting inside the data for a ReLU network to approximate
    with straight lines, rather than match exactly.

    Args:
        hour: Array of input values (hours of the day).
        centre: Input value at which the switch is half open.
        sharpness: How abruptly the switch opens; large values approach a hard step.

    Returns:
        Array of switch openings between 0 and 1, same shape as ``hour``.
    """
    return 1.0 / (1.0 + np.exp(-sharpness * (np.asarray(hour, dtype=float) - centre)))


def relu_ramp(hour, start, slope):
    """A single ReLU neuron, written the way a human reads it.

    ``slope * relu(hour - start)``: flat at 0 before ``start``, then a dead-straight line
    climbing (or falling, for a negative ``slope``) at a constant rate from then on. Unlike
    :func:`soft_switch` it never levels off by itself, which is the whole lesson of Part 1.

    Args:
        hour: Array of input values (hours of the day).
        start: Input value at which the ramp begins climbing.
        slope: How many units it adds per unit of input once it has started; the ReLU
            neuron's one and only steepness knob.

    Returns:
        Array of ramp values, 0 before ``start``, same shape as ``hour``.
    """
    return slope * np.maximum(0.0, np.asarray(hour, dtype=float) - start)


def relu_bump(hour, start, peak, end, height):
    """A triangular bump built from three ReLU neurons, written the way a human reads it.

    One ramp climbs from ``start``, reaching ``height`` exactly at ``peak``; a second,
    steeper ramp starting at ``peak`` turns the climb into a descent; a third, starting at
    ``end``, cancels that descent exactly where it reaches 0, so the bump starts at 0,
    rises in a straight line to ``height``, falls back in a straight line, and then sits
    at exactly 0 forever, never drifting negative the way two lone ramps would.

    Args:
        hour: Array of input values (hours of the day).
        start: Input value at which the bump lifts off 0.
        peak: Input value at which the bump reaches ``height``.
        end: Input value at which the bump is back to 0 and stays there.
        height: The bump's value at ``peak``.

    Returns:
        Array of bump values, same shape as ``hour``.
    """
    hour = np.asarray(hour, dtype=float)
    up, down = height / (peak - start), height / (end - peak)
    return (relu_ramp(hour, start, up)
            - relu_ramp(hour, peak, up + down)
            + relu_ramp(hour, end, down))


def relu_shelf(hour, start, end, height):
    """A switch built from two ReLU neurons: it turns on and, unlike one ramp, stays on.

    One ramp climbs from ``start``; a second, identical ramp starting at ``end`` cancels
    the climb exactly where it reaches ``height``, so the sum sits flat at ``height`` for
    every hour after that: a hard-edged, straight-line stand-in for what a single sigmoid
    neuron did for free by saturating.

    Args:
        hour: Array of input values (hours of the day).
        start: Input value at which the shelf starts climbing.
        end: Input value at which the shelf reaches ``height`` and levels off.
        height: The flat value the shelf holds from ``end`` onward.

    Returns:
        Array of shelf values, same shape as ``hour``.
    """
    hour = np.asarray(hour, dtype=float)
    slope = height / (end - start)
    return relu_ramp(hour, start, slope) - relu_ramp(hour, end, slope)


def hourly_demand_curve(hour):
    """Mean bike pickups per half hour at the Hauptbahnhof dock.

    Args:
        hour: Array of hours of the day (float, 24-hour clock).

    Returns:
        Array of expected pickups, same shape as ``hour``.
    """
    hour = np.asarray(hour, dtype=float)
    demand = DAWN_LEVEL * soft_switch(hour, DAWN_HOUR, DAWN_SHARPNESS)
    for amplitude, centre, width in HOURLY_PEAKS:
        demand = demand + amplitude * np.exp(-0.5 * ((hour - centre) / width) ** 2)
    return demand


def lake_signed_distance(x_km, y_km):
    """Signed distance to the lake shore: positive over the Zürichsee, negative on land.

    Args:
        x_km: Array of east-west offsets from the Hauptbahnhof, in km.
        y_km: Array of north-south offsets from the Hauptbahnhof, in km.

    Returns:
        Array of signed distances in km.
    """
    return (LAKE_NORMAL[0] * (np.asarray(x_km, dtype=float) - LAKE_POINT[0])
            + LAKE_NORMAL[1] * (np.asarray(y_km, dtype=float) - LAKE_POINT[1]))


def city_demand_field(x_km, y_km):
    """Mean daily bike pickups at a location on the Zürich map.

    Args:
        x_km: Array of east-west offsets from the Hauptbahnhof, in km.
        y_km: Array of north-south offsets from the Hauptbahnhof, in km.

    Returns:
        Array of expected daily pickups, broadcast over the inputs.
    """
    x_km = np.asarray(x_km, dtype=float)
    y_km = np.asarray(y_km, dtype=float)
    radius = np.hypot(x_km, y_km) + np.zeros(np.broadcast(x_km, y_km).shape)
    demand = CITY_BASELINE + CITY_GLOW * np.exp(-0.5 * (radius / CITY_GLOW_SIGMA) ** 2)
    for amplitude, cx, cy, sigma in CITY_HOTSPOTS:
        demand = demand + amplitude * np.exp(
            -0.5 * (((x_km - cx) ** 2 + (y_km - cy) ** 2) / sigma ** 2))
    land_mask = 1.0 / (1.0 + np.exp(lake_signed_distance(x_km, y_km) / LAKE_EDGE_WIDTH))
    return demand * land_mask


def build_hourly_dataset(seed=RANDOM_STATE):
    """Build the half-hourly Hauptbahnhof pickup log.

    Args:
        seed: Seed for the NumPy random generator.

    Returns:
        DataFrame with columns ``day``, ``hour`` and ``pickups``.
    """
    rng = np.random.default_rng(seed)
    slots = np.arange(OPENING_HOUR, CLOSING_HOUR + 1e-9, SLOT_MINUTES / 60.0)
    day_factor = rng.normal(1.0, DAY_FACTOR_SD, size=N_DAYS).clip(0.55, 1.45)

    days = np.repeat(np.arange(1, N_DAYS + 1), slots.size)
    hours = np.tile(slots, N_DAYS)
    mean = hourly_demand_curve(hours) * np.repeat(day_factor, slots.size)
    pickups = rng.poisson(np.clip(mean, 0.05, None))
    return pd.DataFrame({'day': days, 'hour': np.round(hours, 2), 'pickups': pickups})


def build_city_datasets(seed=RANDOM_STATE):
    """Build the surveyed-station sample and the dense ground-truth census.

    Args:
        seed: Seed for the NumPy random generator.

    Returns:
        Tuple ``(stations, truth)`` of DataFrames. ``stations`` has columns ``x_km``,
        ``y_km`` and ``pickups_per_day``; ``truth`` has ``x_km``, ``y_km`` and ``demand``.
    """
    rng = np.random.default_rng(seed + 1)
    xs = rng.uniform(-CITY_HALF_WIDTH, CITY_HALF_WIDTH, size=N_STATIONS)
    ys = rng.uniform(-CITY_HALF_WIDTH, CITY_HALF_WIDTH, size=N_STATIONS)
    counts = rng.poisson(np.clip(city_demand_field(xs, ys), 0.05, None))
    stations = pd.DataFrame({'x_km': np.round(xs, 4), 'y_km': np.round(ys, 4),
                             'pickups_per_day': counts})

    axis = np.linspace(-CITY_HALF_WIDTH, CITY_HALF_WIDTH, TRUTH_GRID)
    gx, gy = np.meshgrid(axis, axis)
    truth = pd.DataFrame({'x_km': np.round(gx.ravel(), 4), 'y_km': np.round(gy.ravel(), 4),
                          'demand': np.round(city_demand_field(gx, gy).ravel(), 3)})
    return stations, truth


DATA_FILES = ('velozueri_hourly_demand.csv', 'velozueri_city_stations.csv',
              'velozueri_city_truth.csv')
COURSE_REPO = 'eth-bmai-hs26/w1-cx-private'
PUBLIC_DATA_URL = ('https://raw.githubusercontent.com/eth-bmai-hs26/w1-cx-public/'
                   'main/universal-approximation/data')


def _github_token():
    """Resolve a GitHub token: Colab Secrets, then env var, then an interactive prompt."""
    try:
        from google.colab import userdata  # type: ignore
        token = userdata.get('GITHUB_TOKEN')
        if token:
            return token
    except Exception:
        pass
    if os.environ.get('GITHUB_TOKEN'):
        return os.environ['GITHUB_TOKEN']
    try:
        import getpass
        if sys.stdin is not None and sys.stdin.isatty() or 'google.colab' in sys.modules:
            entered = getpass.getpass(
                'GitHub token for the course repo (press Enter to work offline): ')
            return entered.strip() or None
    except Exception:
        pass
    return None


def load_velozueri_data(data_dir='data', allow_clone=True, verbose=True):
    """Load the three VeloZüri CSVs, rebuilding them offline if the repo is unreachable.

    Tries, in order: a local ``data_dir``; the copy published in the public course repo,
    which needs no credentials and is the path a student in Colab takes; a clone of the
    private course repo with a token, which is the instructor path; and finally the
    seeded offline builders, which reproduce the committed CSVs exactly. The notebook
    therefore runs end to end with no credentials at all.

    Args:
        data_dir: Directory to look in (and to write the offline rebuild into).
        allow_clone: Whether to reach out to GitHub at all.
        verbose: Whether to print which path was taken.

    Returns:
        Tuple ``(hourly, stations, truth)`` of DataFrames.
    """
    def _say(message):
        if verbose:
            print(message)

    def _read(folder):
        return tuple(pd.read_csv(os.path.join(folder, name)) for name in DATA_FILES)

    for folder in (data_dir, os.path.join('w1-cx-private', data_dir)):
        if all(os.path.exists(os.path.join(folder, name)) for name in DATA_FILES):
            _say(f'✅ Loaded the VeloZüri data from {folder}/')
            return _read(folder)

    if allow_clone:
        try:
            frames = tuple(pd.read_csv(f'{PUBLIC_DATA_URL}/{name}') for name in DATA_FILES)
            _say('✅ Loaded the VeloZüri data from the public course repo.')
            return frames
        except Exception:
            pass

    if allow_clone:
        token = _github_token()
        if token:
            url = f'https://{token}@github.com/{COURSE_REPO}.git'
            try:
                subprocess.run(['git', 'clone', '--depth', '1', url, 'w1-cx-private'],
                               check=True, capture_output=True, timeout=120)
                folder = os.path.join('w1-cx-private', data_dir)
                if all(os.path.exists(os.path.join(folder, n)) for n in DATA_FILES):
                    _say(f'✅ Cloned {COURSE_REPO} and loaded the VeloZüri data.')
                    return _read(folder)
            except Exception:
                _say('⚠️  Could not reach the course repo, rebuilding offline instead.')

    _say('🛟 Building the VeloZüri data offline from the seeded generator '
         '(identical to the committed CSVs).')
    hourly = build_hourly_dataset()
    stations, truth = build_city_datasets()
    try:
        os.makedirs(data_dir, exist_ok=True)
        for name, frame in zip(DATA_FILES, (hourly, stations, truth)):
            frame.to_csv(os.path.join(data_dir, name), index=False)
    except Exception:
        pass
    return hourly, stations, truth


# ═══════════════════════════════════════════════════════════════════════════════
# 2. TinyMLP: a feed-forward neural network in plain NumPy
# ═══════════════════════════════════════════════════════════════════════════════
ACTIVATIONS = {
    'sigmoid': (lambda z: 1.0 / (1.0 + np.exp(-np.clip(z, -60, 60))),
                lambda a: a * (1.0 - a)),
    'tanh': (np.tanh, lambda a: 1.0 - a ** 2),
    'relu': (lambda z: np.maximum(z, 0.0), lambda a: (a > 0).astype(a.dtype)),
}


class TinyMLP:
    """A feed-forward neural network trained with Adam, written in NumPy only.

    Inputs and targets are standardised internally using statistics from the training
    set, so callers can pass raw hours and raw bike counts and still get a good fit.

    Args:
        hidden: Tuple with the number of neurons in each hidden layer, e.g. ``(8,)``.
        activation: One of ``'relu'`` (the default, and what the notebook teaches with),
            ``'sigmoid'`` or ``'tanh'``.
        seed: Seed for the weight initialisation.

    Attributes:
        history: Dict with ``epoch``, ``train_rmse`` and (if validation data was given)
            ``val_rmse``, all in the original units of the target.
        n_parameters: Total number of weights and biases the network has to learn.
    """

    def __init__(self, hidden=(8,), activation='relu', seed=RANDOM_STATE):
        if activation not in ACTIVATIONS:
            raise ValueError(f'activation must be one of {sorted(ACTIVATIONS)}')
        self.hidden = tuple(hidden)
        self.activation = activation
        self.seed = seed
        self.history = {'epoch': [], 'train_rmse': [], 'val_rmse': []}
        self._weights = None

    # ── internals ────────────────────────────────────────────────────────────
    def _init_weights(self, n_in, n_out):
        # Biases start spread out rather than at zero. With ReLU that matters: a neuron's
        # kink sits at -b/w, so zero biases would stack every kink of the layer on the
        # same input value and training would have to drag them apart before the network
        # can bend anywhere else. Spreading them is what PyTorch's linear layers do too.
        rng = np.random.default_rng(self.seed)
        sizes = (n_in,) + self.hidden + (n_out,)
        gain = 4.0 if self.activation == 'sigmoid' else 1.0
        self._weights, self._biases = [], []
        for fan_in, fan_out in zip(sizes[:-1], sizes[1:]):
            limit = gain * np.sqrt(6.0 / (fan_in + fan_out))
            self._weights.append(rng.uniform(-limit, limit, size=(fan_in, fan_out)))
            spread = 1.0 / np.sqrt(fan_in)
            self._biases.append(rng.uniform(-spread, spread, size=fan_out))
        self.n_parameters = sum(w.size for w in self._weights) + \
            sum(b.size for b in self._biases)

    def _forward(self, X):
        """Run the forward pass, returning the activations of every layer."""
        act, _ = ACTIVATIONS[self.activation]
        layers = [X]
        for depth, (W, b) in enumerate(zip(self._weights, self._biases)):
            z = layers[-1] @ W + b
            layers.append(z if depth == len(self._weights) - 1 else act(z))
        return layers

    @staticmethod
    def _as_2d(X):
        X = np.asarray(X, dtype=float)
        return X.reshape(-1, 1) if X.ndim == 1 else X

    # ── public API ───────────────────────────────────────────────────────────
    def fit(self, X, y, epochs=3000, lr=0.02, batch_size=None,
            X_val=None, y_val=None, log_every=None, verbose=False):
        """Train the network with Adam on the mean squared error.

        Args:
            X: Inputs, shape ``(n_samples,)`` or ``(n_samples, n_features)``.
            y: Targets, shape ``(n_samples,)``.
            epochs: Number of passes over the training data.
            lr: Adam learning rate.
            batch_size: Mini-batch size; ``None`` trains on the full batch each epoch.
            X_val: Optional held-out inputs, scored every logged epoch.
            y_val: Optional held-out targets.
            log_every: How often to record the error; defaults to ~200 points.
            verbose: Whether to print progress while training.

        Returns:
            The fitted model, so calls can be chained.
        """
        X, y = self._as_2d(X), np.asarray(y, dtype=float).reshape(-1, 1)
        self._x_mean, self._x_std = X.mean(0), X.std(0) + 1e-9
        self._y_mean, self._y_std = y.mean(), y.std() + 1e-9
        Xs, ys = (X - self._x_mean) / self._x_std, (y - self._y_mean) / self._y_std
        self._init_weights(Xs.shape[1], 1)
        log_every = log_every or max(1, epochs // 200)

        _, act_grad = ACTIVATIONS[self.activation]
        rng = np.random.default_rng(self.seed + 1)
        m = [np.zeros_like(p) for p in self._weights + self._biases]
        v = [np.zeros_like(p) for p in self._weights + self._biases]
        beta1, beta2, eps, step = 0.9, 0.999, 1e-8, 0

        for epoch in range(1, epochs + 1):
            order = (rng.permutation(len(Xs)) if batch_size else np.arange(len(Xs)))
            chunk = batch_size or len(Xs)
            for start in range(0, len(order), chunk):
                idx = order[start:start + chunk]
                Xb, yb = Xs[idx], ys[idx]

                layers = self._forward(Xb)
                delta = 2.0 * (layers[-1] - yb) / len(Xb)      # dMSE/dz for the output
                grads_w, grads_b = [], []
                for depth in range(len(self._weights) - 1, -1, -1):
                    grads_w.insert(0, layers[depth].T @ delta)
                    grads_b.insert(0, delta.sum(0))
                    if depth:
                        delta = (delta @ self._weights[depth].T) * act_grad(layers[depth])

                step += 1
                params = self._weights + self._biases
                for i, (param, grad) in enumerate(zip(params, grads_w + grads_b)):
                    m[i] = beta1 * m[i] + (1 - beta1) * grad
                    v[i] = beta2 * v[i] + (1 - beta2) * grad ** 2
                    m_hat = m[i] / (1 - beta1 ** step)
                    v_hat = v[i] / (1 - beta2 ** step)
                    param -= lr * m_hat / (np.sqrt(v_hat) + eps)

            if epoch % log_every == 0 or epoch == 1 or epoch == epochs:
                train_rmse = float(np.sqrt(np.mean((self.predict(X) - y.ravel()) ** 2)))
                self.history['epoch'].append(epoch)
                self.history['train_rmse'].append(train_rmse)
                if X_val is not None:
                    val = float(np.sqrt(np.mean(
                        (self.predict(X_val) - np.asarray(y_val, float).ravel()) ** 2)))
                    self.history['val_rmse'].append(val)
                if verbose and (epoch % (log_every * 20) == 0 or epoch == epochs):
                    tail = (f'   held-out RMSE {self.history["val_rmse"][-1]:7.2f}'
                            if X_val is not None else '')
                    print(f'  epoch {epoch:6d}   training RMSE {train_rmse:7.2f}{tail}')
        return self

    def predict(self, X):
        """Predict the target for new inputs.

        Args:
            X: Inputs, shape ``(n_samples,)`` or ``(n_samples, n_features)``.

        Returns:
            Array of predictions, shape ``(n_samples,)``, in the original target units.
        """
        if self._weights is None:
            raise RuntimeError('call fit() before predict()')
        Xs = (self._as_2d(X) - self._x_mean) / self._x_std
        return (self._forward(Xs)[-1].ravel() * self._y_std + self._y_mean)


def rmse(y_true, y_pred):
    """Root mean squared error, in the units of the target.

    Args:
        y_true: Observed values.
        y_pred: Predicted values.

    Returns:
        Float root mean squared error.
    """
    y_true = np.asarray(y_true, dtype=float).ravel()
    y_pred = np.asarray(y_pred, dtype=float).ravel()
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


# ═══════════════════════════════════════════════════════════════════════════════
# 3. Analysis helpers the notebook works with directly
# ═══════════════════════════════════════════════════════════════════════════════
CITY_EXTENT = (-CITY_HALF_WIDTH, CITY_HALF_WIDTH, -CITY_HALF_WIDTH, CITY_HALF_WIDTH)


def split_days(hourly, train_days=30, verbose=True):
    """Split the dock log into training days and held-out days.

    Also returns the noise floor: the error a *perfect* forecast would still make on the
    held-out days, because two identical Tuesdays are not identical. Computing it needs
    the true mean demand curve, which only exists because we generated this data. It is
    a teaching device, not something a real operator could compute.

    Args:
        hourly: DataFrame with ``day``, ``hour`` and ``pickups`` columns.
        train_days: How many of the first days to train on.
        verbose: Whether to print the sizes and the noise floor.

    Returns:
        Tuple ``(train_hour, train_pickups, holdout_hour, holdout_pickups, noise_floor)``.
    """
    train, holdout = hourly[hourly['day'] <= train_days], hourly[hourly['day'] > train_days]
    train_hour = train['hour'].to_numpy()
    train_pickups = train['pickups'].to_numpy().astype(float)
    holdout_hour = holdout['hour'].to_numpy()
    holdout_pickups = holdout['pickups'].to_numpy().astype(float)
    noise_floor = rmse(holdout_pickups, hourly_demand_curve(holdout_hour))

    if verbose:
        last = int(hourly['day'].max())
        print(f'Training on  : days  1–{train_days}  ({len(train):,} counts)')
        print(f'Held out     : days {train_days + 1}–{last}  ({len(holdout):,} counts)')
        print(f'\nNoise floor  : {noise_floor:.1f} pickups, what a *perfect* forecast '
              'still gets wrong')
        print('               on the held-out days. Anything close to it is as good as '
              'this problem gets.')
    return train_hour, train_pickups, holdout_hour, holdout_pickups, noise_floor


def city_map_grid(resolution=TRUTH_GRID):
    """Build the dense list of map coordinates to ask a model about.

    Args:
        resolution: Number of points per side.

    Returns:
        Array of shape ``(resolution ** 2, 2)``, ready to pass to ``predict``.
    """
    axis = np.linspace(-CITY_HALF_WIDTH, CITY_HALF_WIDTH, resolution)
    gx, gy = np.meshgrid(axis, axis)
    return np.column_stack([gx.ravel(), gy.ravel()])


def as_map(values, resolution=TRUTH_GRID):
    """Fold a flat list of per-location values back into a square map.

    Args:
        values: Flat sequence of ``resolution ** 2`` values, in ``city_map_grid`` order.
        resolution: Number of points per side.

    Returns:
        Square array of shape ``(resolution, resolution)``.
    """
    return np.asarray(values, dtype=float).reshape(resolution, resolution)


def top_hotspots(grid, k=3, min_separation_km=2.0):
    """Find the ``k`` strongest, well-separated peaks of a demand map.

    Greedily takes the highest remaining cell and blanks everything within
    ``min_separation_km`` of it, so two depots are never proposed for one neighbourhood.

    Args:
        grid: Square array of demand values, as returned by :func:`as_map`.
        k: How many hotspots to return.
        min_separation_km: Minimum distance between two returned hotspots.

    Returns:
        List of ``(x_km, y_km, demand)`` tuples, strongest first.
    """
    grid = np.asarray(grid, dtype=float)
    axis = np.linspace(-CITY_HALF_WIDTH, CITY_HALF_WIDTH, grid.shape[0])
    remaining, found = grid.copy(), []
    for _ in range(k):
        iy, ix = np.unravel_index(np.argmax(remaining), remaining.shape)
        found.append((float(axis[ix]), float(axis[iy]), float(grid[iy, ix])))
        distance = np.hypot(*np.meshgrid(axis - axis[ix], axis - axis[iy]))
        remaining[distance < min_separation_km] = -np.inf
    return found


__all__ = [
    'TinyMLP', 'soft_switch', 'relu_ramp', 'relu_bump', 'relu_shelf',
    'hourly_demand_curve', 'city_demand_field',
    'load_velozueri_data', 'build_hourly_dataset', 'build_city_datasets',
    'split_days', 'city_map_grid', 'as_map', 'top_hotspots', 'rmse',
    'RANDOM_STATE', 'CITY_HALF_WIDTH', 'CITY_EXTENT', 'TRUTH_GRID',
    'CITY_HOTSPOTS', 'HOTSPOT_NAMES', 'OPENING_HOUR', 'CLOSING_HOUR',
]
