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

## Provenance

`iris-pytorch/iris_pytorch.ipynb` is unmodified from the FS26 original at
`github.com/eth-bmai-fs26/coding-exercises`, branch `week1`, path
`cx_minimal_nn/notebooks/iris_nn.ipynb`, byte for byte. The Saturday 08:00
lecture deck projects its code under a rule that allows deleting a line to fit a
slide and forbids changing one, so an edit here changes what the slides claim.
