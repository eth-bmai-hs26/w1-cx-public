# Weekend 1 coding exercises, public material

CAS "Building ML/AI Applications" (BMAI), ETH Zurich, HS26. Weekend 1, Friday 4
and Saturday 5 September 2026.

This repository holds the participant-facing notebooks for weekend 1. It is
public so that every notebook opens in Google Colab with one click. The
solutions and the grading material live in `w1-cx-private`.

The course website links to everything here:

    https://eth-bmai-hs26.github.io/BMAI-PAGE/

## Exercises

| Slot | Exercise | Open |
|---|---|---|
| Saturday 09:00 | **Iris PyTorch** | [Open in Colab](https://colab.research.google.com/github/eth-bmai-hs26/w1-cx-public/blob/main/iris-pytorch/iris_pytorch.ipynb) |
| TBA | **Universal approximation** | [Open in Colab](https://colab.research.google.com/github/eth-bmai-hs26/w1-cx-public/blob/main/universal-approximation/universal_approximation.ipynb) |

More weekend 1 exercises are added here as they are finished.

## Iris PyTorch

`iris-pytorch/iris_pytorch.ipynb` follows the Saturday 08:00 lecture, "Training
neural networks with PyTorch". It builds and trains a small neural network on
the Iris dataset, and every step of the training loop is visible on one screen:
no helper module, no DataLoader, no device juggling.

Eight sections: load the data, define the network, set the loss and the
optimizer, train, plot the learning curve, evaluate on held out data, and look
at one prediction up close.

Prerequisites are Python basics, meaning functions, loops and variables. No
prior machine learning or PyTorch knowledge is assumed.

Dependencies are `torch`, `scikit-learn` and `matplotlib`, all preinstalled in
Colab. To run it on your own machine instead:

```bash
pip install torch scikit-learn matplotlib
jupyter notebook iris-pytorch/iris_pytorch.ipynb
```

**The notebook seeds nothing**, so the initial weights are drawn fresh on every
run and your numbers will differ from the slides and from your neighbour's. The
lecture deck shows one seeded run and says so on the slide. Measured over 20
unseeded runs on torch 2.1.0: 10 finished at 100 percent test accuracy, 7 at
96.7 percent, 2 at 83.3 and 1 at 80. So a low score is a normal outcome of a
small network started from a bad draw, and it is worth rerunning the training
cell before concluding anything is wrong.

The four things to try at the end of the notebook are the exercise: change the
learning rate, change the hidden layer size, add a second hidden layer, and
train for more or fewer epochs.

## Universal approximation

`universal-approximation/universal_approximation.ipynb` rebuilds the demand model of a
fictional Zürich bike-sharing operator, VeloZüri, using NumPy only: no PyTorch, no
TensorFlow, no GPU.

The arc is one idea, earned in five steps. One neuron is a ReLU ramp, flat and then
straight. Three ramps stacked make a bump. Four bumps and a dawn shelf, nineteen numbers
chosen by hand, make a whole day of demand. Gradient descent then takes those knobs over,
and a width sweep shows where buying more neurons stops paying for itself. The same idea
with two inputs turns 700 surveyed sites into a city demand map and three depot
locations. The last part shows five equally good models disagreeing wildly about the
hours they were never shown.

Five exercise cells are scaffolded. Each states what to build and which variable to put
it in, and the unknowns are written as `...`. Everything else in the notebook already
runs, so you fill in the decision and the plots follow.

Prerequisites are Python basics. No prior machine learning is assumed, and no calculus:
backpropagation is used and explained in words, never derived.

Dependencies are `numpy`, `pandas` and `matplotlib`, all preinstalled in Colab. To run it
on your own machine instead:

```bash
pip install -r universal-approximation/requirements.txt
jupyter notebook universal-approximation/universal_approximation.ipynb
```

The three `universal_approximation_*.py` files next to the notebook hold the network, the
data and every figure, which is what keeps the notebook cells about the argument rather
than the plumbing. The notebook does not need them to be present: its setup cell carries
a compressed copy of all three and unpacks them when they are missing, which is what
makes the Colab link work on its own.

The data sits in `universal-approximation/data/`. The notebook reads it from there if you
cloned the repo, and over the network from this repository otherwise. No token and no
account are needed. If both fail it rebuilds the same three CSVs from the seeded
generator, so lecture hall wifi is never a dependency.

## Provenance

`iris-pytorch/iris_pytorch.ipynb` is unmodified from the FS26 original at
`github.com/eth-bmai-fs26/coding-exercises`, branch `week1`, path
`cx_minimal_nn/notebooks/iris_nn.ipynb`, byte for byte. The Saturday 08:00
lecture deck projects its code under a rule that allows deleting a line to fit a
slide and forbids changing one, so an edit here changes what the slides claim.
