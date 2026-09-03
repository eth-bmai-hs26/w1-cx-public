"""Every pixel the universal-approximation notebook draws.

The notebook is about one idea, and its cells should read like that idea. So each
visualisation in it is a single call into this module, `show_width_sweep(hourly, models)`
rather than thirty lines of matplotlib, and none of the figure boilerplate, HTML
explainer markup or colour bookkeeping is ever in the student's way.

Nothing here computes anything the student is asked to understand. Two functions
(`show_budget_comparison`, `show_seed_disagreement`, `show_depth_vs_width`) do train
networks, because the point they make *is* the comparison between several fits; the
narrative around them in the notebook explains what they show.

Layout of this file:
    1. Palette and house style
    2. Low-level plotting primitives
    3. Inline HTML explainers
    4. `show_*`, one function per notebook cell, in notebook order
"""

from __future__ import annotations

import time
import uuid

import matplotlib.pyplot as plt
import numpy as np

from universal_approximation_utils import (
    CITY_EXTENT, CITY_HALF_WIDTH, CLOSING_HOUR, OPENING_HOUR, RANDOM_STATE, TinyMLP,
    as_map, hourly_demand_curve, relu_bump, relu_ramp, relu_shelf, rmse, top_hotspots,
)

try:                                    # only present inside a notebook
    from IPython.display import HTML, display
except ImportError:                     # pragma: no cover
    HTML = display = None


# ═══════════════════════════════════════════════════════════════════════════════
# 1. Palette and house style
# ═══════════════════════════════════════════════════════════════════════════════
PURPLE, PURPLE2 = '#667eea', '#764ba2'                 # primary / gradient accent
GREEN, RED, AMBER = '#39b36a', '#e0796d', '#e0a23c'    # good / bad / caution
INK, MUTED = '#2b2b3a', '#8b8ba7'
BUMP_COLOURS = ('#8fa3f2', '#5b76d6', '#8b6bc0', '#b39ad9')   # tints, for series only


def house_style():
    """Apply the shared matplotlib styling used across the BMAI notebooks."""
    plt.rcParams['figure.dpi'] = 110
    plt.rcParams['axes.spines.top'] = False
    plt.rcParams['axes.spines.right'] = False
    plt.rcParams['axes.titlesize'] = 11
    plt.rcParams['axes.labelcolor'] = INK
    plt.rcParams['text.color'] = INK
    plt.rcParams['font.size'] = 9.5


# ═══════════════════════════════════════════════════════════════════════════════
# 2. Low-level plotting primitives
# ═══════════════════════════════════════════════════════════════════════════════
def style_axis(ax, title='', xlabel='', ylabel=''):
    """Apply titles and spine styling to one axis.

    Args:
        ax: Matplotlib axes to style.
        title: Axis title.
        xlabel: Label for the x axis.
        ylabel: Label for the y axis.

    Returns:
        The same axes, so calls can be chained.
    """
    ax.set_title(title, color=INK)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.grid(alpha=0.18, linewidth=0.7)
    ax.set_axisbelow(True)
    return ax


def plot_demand_fit(hour, pickups, curves=(), ax=None, title='',
                    xlim=(OPENING_HOUR, CLOSING_HOUR), ylim=None, legend=True,
                    point_alpha=0.18, sampled_span=None):
    """Scatter the observed pickups and lay one or more model curves over them.

    Args:
        hour: Observed hours of the day.
        pickups: Observed pickup counts.
        curves: Iterable of ``(x, y, label, colour)`` or ``(x, y, label, colour, style)``.
        ax: Axes to draw on; a new figure is created when omitted.
        title: Axis title.
        xlim: X-axis limits.
        ylim: Y-axis limits, or ``None`` to let matplotlib choose.
        legend: Whether to draw the legend.
        point_alpha: Opacity of the observation scatter.
        sampled_span: Optional ``(lo, hi)`` shaded as "hours we actually measured".

    Returns:
        The axes that were drawn on.
    """
    if ax is None:
        _, ax = plt.subplots(figsize=(8.2, 4.3))
    if sampled_span is not None:
        ax.axvspan(*sampled_span, color=PURPLE, alpha=0.08, lw=0,
                   label='hours we measured')
    ax.scatter(hour, pickups, s=11, color=PURPLE, alpha=point_alpha, lw=0,
               label='observed pickups')
    for curve in curves:
        x, y, label, colour = curve[:4]
        style = curve[4] if len(curve) > 4 else '-'
        ax.plot(x, y, style, color=colour, lw=2.2, label=label, zorder=3)
    ax.set_xlim(*xlim)
    if ylim:
        ax.set_ylim(*ylim)
    style_axis(ax, title, 'hour of the day', 'bike pickups per half hour')
    if legend:
        ax.legend(frameon=False, fontsize=8.5, loc='upper left')
    return ax


def plot_city_maps(panels, stations=None, hotspots=None, vmax=None, cmap='magma'):
    """Draw one or more city demand maps side by side on a shared colour scale.

    Args:
        panels: Iterable of ``(title, grid)`` pairs, each grid a square array.
        stations: Optional ``(x, y)`` pair overlaid on every panel but the first, or a
            list with one entry per panel (``None`` to skip that panel).
        hotspots: Optional list, one entry per panel, of hotspot lists from
            ``top_hotspots`` to ring on that panel.
        vmax: Upper limit of the shared colour scale; defaults to the tallest panel.
        cmap: Matplotlib colormap name.

    Returns:
        The created matplotlib figure.
    """
    panels = list(panels)
    vmax = vmax if vmax is not None else max(np.max(g) for _, g in panels)
    fig, axes = plt.subplots(1, len(panels), figsize=(4.4 * len(panels), 4.3))
    axes = np.atleast_1d(axes)
    for i, (ax, (title, grid)) in enumerate(zip(axes, panels)):
        image = ax.imshow(grid, origin='lower', extent=CITY_EXTENT, cmap=cmap,
                          vmin=0, vmax=vmax, interpolation='bilinear')
        sites = stations[i] if isinstance(stations, list) else (stations if i else None)
        if sites is not None:
            dense = len(np.asarray(sites[0])) > 200
            ax.scatter(sites[0], sites[1], s=3 if dense else 9, color='white',
                       alpha=0.20 if dense else 0.75, lw=0)
        marks = hotspots[i] if hotspots is not None else None
        if marks:
            for rank, (x, y, _) in enumerate(marks, start=1):
                ax.plot(x, y, 'o', mfc='none', mec=GREEN, mew=2.2, ms=15)
                ax.annotate(str(rank), (x, y), color=GREEN, fontsize=8, weight='bold',
                            ha='center', va='center')
        style_axis(ax, title, 'km east of the Hauptbahnhof', 'km north' if i == 0 else '')
        ax.grid(False)
        fig.colorbar(image, ax=ax, fraction=0.046, pad=0.03,
                     label='pickups per day' if i == len(panels) - 1 else '')
    fig.tight_layout()
    return fig


# ═══════════════════════════════════════════════════════════════════════════════
# 3. Inline HTML explainers
# ═══════════════════════════════════════════════════════════════════════════════
_CARD_CSS = '''
  .card-{uid} {{ font-family: system-ui, "Segoe UI", Roboto, sans-serif;
    border-radius: 18px; border: 1px solid #ecebff; padding: 20px 22px;
    background: linear-gradient(135deg, #f6f8ff, #fbf5ff); color: #2b2b3a; }}
  .card-{uid} h3 {{ margin: 0 0 4px; font-size: 15px; letter-spacing: .2px; }}
  .card-{uid} .sub {{ margin: 0 0 16px; font-size: 12.5px; color: #8b8ba7; }}
  .card-{uid} .row {{ display: flex; flex-wrap: wrap; gap: 12px; }}
  .card-{uid} .box {{ flex: 1 1 190px; background: #fff; border: 1px solid #e6e8ee;
    border-radius: 14px; padding: 13px 15px; }}
  .card-{uid} .box b {{ font-size: 13px; }}
  .card-{uid} .box p {{ margin: 5px 0 0; font-size: 12.5px; line-height: 1.5;
    color: #4a4a63; }}
  .card-{uid} .box p.cap {{ min-height: 3.1em; }}
'''


def _ramp_svg(ramps):
    """Draw ReLU ramps on one shared 05:00-23:00 axis as a small inline SVG.

    The chart is scaled so the tallest ramp just fits, which is why a steeper ramp does not
    look taller here. It looks like it started climbing sooner and never stopped.

    Args:
        ramps: Iterable of ``(start, slope, colour)`` tuples.

    Returns:
        SVG markup as a string.
    """
    hours = np.linspace(5, 23, 120)
    ceiling = max(max(relu_ramp(hours, start, slope)) for start, slope, _ in ramps) or 1.0
    paths = []
    for start, slope, colour in ramps:
        climb = relu_ramp(hours, start, slope)
        px = 12 + (hours - 5) / 18 * 152
        py = 84 - climb / ceiling * 66
        points = ' '.join(f'{a:.1f},{b:.1f}' for a, b in zip(px, py))
        paths.append(f'<polyline points="{points}" fill="none" stroke="{colour}" '
                     f'stroke-width="2.8" stroke-linecap="round"/>')
    ticks = ''.join(
        f'<text x="{12 + (h - 5) / 18 * 152:.0f}" y="99" font-size="9" '
        f'fill="{MUTED}" text-anchor="middle">{h:02d}</text>'
        f'<line x1="{12 + (h - 5) / 18 * 152:.0f}" y1="84" '
        f'x2="{12 + (h - 5) / 18 * 152:.0f}" y2="87" stroke="#d9dbe7"/>'
        for h in (6, 12, 18))
    return (f'<svg viewBox="0 0 176 104" width="100%" height="104" role="img">'
            f'<line x1="12" y1="84" x2="164" y2="84" stroke="#d9dbe7"/>'
            f'{ticks}{"".join(paths)}</svg>')


def show_roadmap():
    """Display the five-step stepper that orients the reader at the top of the notebook."""
    uid = uuid.uuid4().hex[:8]
    steps = [
        ('🔌', 'One neuron', 'A straight ramp that starts climbing, and never stops'),
        ('🧱', 'Three ramps', 'Up, back down, then flat: three straight lines make a bump'),
        ('🎛️', 'Training', 'Stop turning the knobs by hand; let gradient descent do it'),
        ('🗺️', 'The whole city', 'The same trick in two dimensions: a demand map'),
        ('🚧', 'The limits', 'Where "universal" quietly stops being true'),
    ]
    chips = ''.join(f'''
      <div class="step-{uid}">
        <div class="dot-{uid}">{icon}</div>
        <div class="lbl-{uid}">{title}</div>
        <div class="txt-{uid}">{text}</div>
      </div>''' for icon, title, text in steps)
    display(HTML(f'''
    <style>
      .rm-{uid} {{ font-family: system-ui, "Segoe UI", Roboto, sans-serif;
        border-radius: 18px; border: 1px solid #ecebff; padding: 22px 20px 18px;
        background: linear-gradient(135deg, #f6f8ff, #fbf5ff); color: {INK}; }}
      .rm-{uid} h3 {{ margin: 0 0 18px; font-size: 15px; }}
      .rm-{uid} .track {{ display: flex; flex-wrap: wrap; gap: 10px; }}
      .step-{uid} {{ flex: 1 1 170px; background: #fff; border: 1px solid #e6e8ee;
        border-radius: 14px; padding: 14px 14px 16px; text-align: center; }}
      .dot-{uid} {{ width: 46px; height: 46px; margin: 0 auto 10px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center; font-size: 21px;
        background: linear-gradient(135deg, {PURPLE}, {PURPLE2});
        box-shadow: 0 4px 12px rgba(102,126,234,.32); }}
      .lbl-{uid} {{ font-weight: 650; font-size: 13.5px; margin-bottom: 5px; }}
      .txt-{uid} {{ font-size: 12px; line-height: 1.5; color: #6f6f8c; }}
    </style>
    <div class="rm-{uid}">
      <h3>🗺️ Where this notebook is going</h3>
      <div class="track">{chips}</div>
    </div>'''))


def show_neuron_knobs():
    """Display the card explaining the two knobs on a single ReLU neuron."""
    uid = uuid.uuid4().hex[:8]
    knobs = [
        ('Start', 'the hour at which it lifts off zero and starts climbing',
         [(8.0, 60.0, PURPLE), (14.0, 60.0, PURPLE2)]),
        ('Slope', 'how many pickups it adds per hour once it has started',
         [(8.0, 60.0, PURPLE), (8.0, 20.0, PURPLE2)]),
    ]
    boxes = ''.join(f'''
      <div class="box">
        <b>{name}</b>
        <p class="cap">{text}</p>
        {_ramp_svg(ramps)}
      </div>''' for name, text, ramps in knobs)
    display(HTML(f'''
    <style>{_CARD_CSS.format(uid=uid)}</style>
    <div class="card-{uid}">
      <h3>🔌 A neuron is a ramp with two knobs</h3>
      <p class="sub">Each chart runs from 05:00 to 23:00. The
        <b style="color:{PURPLE}">indigo</b> ramp is the same in both; the
        <b style="color:{PURPLE2}">violet</b> one has exactly one knob changed. Flat, then
        a straight line. There is nothing else a single neuron can do, and nothing in it
        that ever bends back.</p>
      <div class="row">{boxes}</div>
    </div>'''))


def show_theorem_card():
    """Display the universal approximation theorem and the four things it does not say."""
    uid = uuid.uuid4().hex[:8]
    caveats = [
        ('✅ What it promises',
         'For any continuous demand curve and any accuracy you name, <b>there exists</b> '
         'a network with one hidden layer that stays within that accuracy everywhere on '
         'the stretch of hours you care about.'),
        ('⚠️ What "enough" costs',
         'The theorem never says how many neurons. It could be sixteen, as here, or more '
         'than you can afford. Capacity is a budget line, not a free lunch.'),
        ('🚧 Where it stops',
         'Only on a <b>closed range</b> you sampled, and only for a <b>continuous</b> '
         'function. Outside that range it promises nothing at all, and Part 5 is what that '
         'looks like on a real forecast.'),
        ('🔍 And it is silent on finding it',
         'It says a good setting of the knobs exists. It does not say gradient descent '
         'will find it, or that your data is rich enough to pin it down.'),
    ]
    boxes = ''.join(f'<div class="box"><b>{title}</b><p>{text}</p></div>'
                    for title, text in caveats)
    display(HTML(f'''
    <style>{_CARD_CSS.format(uid=uid)}
      .fx-{uid} {{ background: #fff; border: 1px solid #e6e8ee; border-radius: 14px;
        padding: 12px 16px; margin-bottom: 14px; font-size: 14px; text-align: center;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }}
    </style>
    <div class="card-{uid}">
      <h3>🧩 The universal approximation theorem</h3>
      <p class="sub">Cybenko (1989), Hornik (1991), stated the way it matters to you.</p>
      <div class="fx-{uid}">demand(hour) &nbsp;≈&nbsp;
        v<sub>1</sub>·ramp<sub>1</sub>(hour) + v<sub>2</sub>·ramp<sub>2</sub>(hour)
        + … + v<sub>n</sub>·ramp<sub>n</sub>(hour)</div>
      <div class="row">{boxes}</div>
    </div>'''))


# ═══════════════════════════════════════════════════════════════════════════════
# 4. One function per notebook visualisation, in notebook order
# ═══════════════════════════════════════════════════════════════════════════════
_HOUR_GRID = np.linspace(OPENING_HOUR, CLOSING_HOUR, 400)


def describe_datasets(hourly, stations, truth):
    """Print what the three VeloZüri files contain and show the head of the dock log.

    Args:
        hourly: The half-hourly dock log.
        stations: The surveyed-site table.
        truth: The dense census of city demand.
    """
    print(f'\nDock log      : {len(hourly):,} half-hourly counts over '
          f'{hourly["day"].nunique()} days at the Hauptbahnhof')
    print(f'Site survey   : {len(stations):,} surveyed locations across the city')
    print(f'Full census   : {len(truth):,} map cells (the study we could never afford)')
    display(hourly.head())


def show_demand_scatter(hourly):
    """Scatter every pickup count in the dock log against the hour of the day.

    Args:
        hourly: The half-hourly dock log.
    """
    ax = plot_demand_fit(hourly['hour'], hourly['pickups'],
                         title='Every pickup count we have: 40 days × 37 half-hourly slots')
    ax.legend_.remove()
    plt.tight_layout()
    plt.show()


def show_relu_function(start=6.3, slope=100.0):
    """Draw the ReLU activation twice: as a formula, and as a ramp over the day.

    The left panel is the activation on its own, so the flat half and the straight half
    are visible before any of it is dressed up as demand. The right panel is the same
    neuron in the units of this notebook, which is where the two knobs of Part 1 live.

    Args:
        start: Hour at which the ramp on the right leaves zero.
        slope: Pickups the ramp on the right adds per hour once it has started.
    """
    fig, axes = plt.subplots(1, 2, figsize=(11.4, 4.2))

    z = np.linspace(-4, 4, 400)
    ax = axes[0]
    ax.axhline(0, color='#d9dbe7', lw=1, zorder=1)
    ax.axvline(0, color='#d9dbe7', lw=1, zorder=1)
    ax.plot(z, np.maximum(0.0, z), color=PURPLE, lw=2.4, solid_capstyle='round', zorder=3)
    ax.plot([0], [0], 'o', ms=8, mfc='white', mec=PURPLE, mew=2.2, zorder=4)
    ax.annotate('output stays at zero', xy=(-2.6, 0), xytext=(-3.9, 1.35), color=INK,
                fontsize=9.5, arrowprops=dict(arrowstyle='-|>', color=MUTED, lw=1.1,
                                              connectionstyle='arc3,rad=-0.25'))
    ax.annotate('output follows the input,\none for one', xy=(2.5, 2.5),
                xytext=(0.45, 3.25), color=INK, fontsize=9.5,
                arrowprops=dict(arrowstyle='-|>', color=MUTED, lw=1.1,
                                connectionstyle='arc3,rad=0.2'))
    ax.text(0.12, -0.62, 'the kink', color=MUTED, fontsize=9)
    ax.set_xlim(-4, 4)
    ax.set_ylim(-1, 4.2)
    style_axis(ax, 'ReLU(z) = max(0, z)', 'input into the neuron  (z = w·h + b)',
               'output of the neuron')

    hours = np.linspace(OPENING_HOUR, CLOSING_HOUR, 400)
    ramp = relu_ramp(hours, start, slope)
    ax = axes[1]
    ax.plot(hours, ramp, color=PURPLE, lw=2.4, solid_capstyle='round', zorder=3)
    ax.plot([start], [0], 'o', ms=8, mfc='white', mec=PURPLE, mew=2.2, zorder=4)
    ax.axvline(start, color='#d9dbe7', lw=1, ls='--', zorder=1)
    ax.annotate(f'start = {int(start):02d}:{round(start % 1 * 60):02d}\n'
                'the hour it leaves zero', xy=(start, 0),
                xytext=(start + 0.6, ramp.max() * 0.45), color=INK, fontsize=9.5,
                arrowprops=dict(arrowstyle='-|>', color=MUTED, lw=1.1,
                                connectionstyle='arc3,rad=0.25'))
    ax.annotate(f'slope = {slope:.0f} pickups per hour', xy=(16.5, slope * (16.5 - start)),
                xytext=(9.4, ramp.max() * 0.88), color=INK, fontsize=9.5,
                arrowprops=dict(arrowstyle='-|>', color=MUTED, lw=1.1,
                                connectionstyle='arc3,rad=-0.2'))
    ax.set_xlim(OPENING_HOUR, CLOSING_HOUR)
    ax.set_ylim(-0.07 * ramp.max(), 1.12 * ramp.max())
    style_axis(ax, 'The same neuron, read as a ramp', 'hour of the day',
               'bike pickups per half hour')

    plt.tight_layout()
    plt.show()


def show_single_neuron_fit(hourly, hour_grid, one_neuron):
    """Lay the student's single-neuron curve over the whole day.

    Args:
        hourly: The half-hourly dock log.
        hour_grid: Hours the curve was evaluated on.
        one_neuron: The single-neuron curve from Exercise 1.
    """
    plot_demand_fit(hourly['hour'], hourly['pickups'],
                    curves=[(hour_grid, one_neuron, 'a single neuron', PURPLE2)],
                    title='One neuron can climb. It cannot come back down.')
    plt.tight_layout()
    plt.show()


def show_bump_construction(hour_grid):
    """Show, in three panels, how three straight ramps add up to one bump.

    Args:
        hour_grid: Hours to draw the ramps on.
    """
    start, peak, end, height = 7.33, 8.10, 10.0, 175.0
    up, down = height / (peak - start), height / (end - peak)
    first = relu_ramp(hour_grid, start, up)
    second = first - relu_ramp(hour_grid, peak, up + down)
    third = second + relu_ramp(hour_grid, end, down)

    fig, axes = plt.subplots(1, 3, figsize=(13.5, 3.4), sharey=True)
    panels = [
        ('① one ramp lifts off at 07:20', first, PURPLE, 'climbs, and never stops'),
        ('② a steeper ramp at 08:06 bends it down', second, MUTED, 'now it falls'),
        ('③ a third ramp at 10:00 holds it flat', third, PURPLE2, 'a bump'),
    ]
    for ax, (title, values, colour, label) in zip(axes, panels):
        if not title.startswith('①'):
            ax.plot(hour_grid, first, color=PURPLE, lw=1, alpha=.35)
        if title.startswith('③'):
            ax.plot(hour_grid, second, color=MUTED, lw=1, alpha=.45)
        ax.plot(hour_grid, values, color=colour, lw=2.6, label=label)
        ax.set_xlim(OPENING_HOUR, CLOSING_HOUR)
        ax.set_ylim(-260, 300)
        ax.axhline(0, color=INK, lw=1, ls='--', alpha=.35)
        ax.legend(frameon=False, fontsize=8.5, loc='upper right')
        style_axis(ax, title, 'hour of the day', 'pickups' if ax is axes[0] else '')
    plt.tight_layout()
    plt.show()


def show_morning_rush(hourly, hour_grid, one_neuron, morning_rush):
    """Compare the student's hand-built bump with the single neuron of Part 1.

    Args:
        hourly: The half-hourly dock log.
        hour_grid: Hours the curves were evaluated on.
        one_neuron: The single-neuron curve from Exercise 1.
        morning_rush: The two-neuron bump from Exercise 2.
    """
    plot_demand_fit(hourly['hour'], hourly['pickups'],
                    curves=[(hour_grid, one_neuron, 'Part 1: one ramp', MUTED, '--'),
                            (hour_grid, morning_rush, 'Part 2: three ramps', PURPLE2)],
                    title='Three ramps: a window of demand that starts, peaks, and ends')
    plt.tight_layout()
    plt.show()


# The nineteen numbers of Part 2, all read off the scatter plot by eye. They live here
# rather than in the notebook so the cell stays one line. The printed table below is
# what the reader is meant to look at, not the source. The dawn shelf costs two ramps
# (one to climb, one to hold it level); each bump costs three.
HAND_BASELINE = (34.0, 5.30, 7.60)                    # (height, start, level-off)
HAND_BUMPS = (                                        # (name, height, start, peak, end)
    ('morning rush', 154.0, 6.50, 8.10, 9.70),
    ('lunch lift', 42.0, 10.70, 12.40, 14.10),
    ('evening rush', 205.0, 15.60, 17.70, 20.10),
    ('evening drift', 35.0, 19.50, 20.20, 23.80),
)
HAND_NEURONS = 2 + 3 * len(HAND_BUMPS)
HAND_NUMBERS = 3 + 4 * len(HAND_BUMPS)


def show_hand_built_day(hourly, hour_grid):
    """Build the whole demand curve from fourteen hand-tuned neurons and plot the result.

    Args:
        hourly: The half-hourly dock log.
        hour_grid: Hours to build the curve on.
    """
    height, start, level_off = HAND_BASELINE
    hand_built = relu_shelf(hour_grid, start, level_off, height)
    pieces = [(hand_built.copy(), 'dawn baseline', AMBER)]
    for (name, amp, opens, peak, closes), colour in zip(HAND_BUMPS, BUMP_COLOURS):
        bump = relu_bump(hour_grid, opens, peak, closes, amp)
        hand_built = hand_built + bump
        pieces.append((bump, name, colour))

    fig, axes = plt.subplots(1, 2, figsize=(13.5, 4.3))
    for values, label, colour in pieces:
        axes[0].plot(hour_grid, values, color=colour, lw=2.0, label=label)
    style_axis(axes[0], f'The {HAND_NEURONS} neurons, one structure at a time',
               'hour of the day', 'pickups')
    axes[0].legend(frameon=False, fontsize=8.5)
    plot_demand_fit(hourly['hour'], hourly['pickups'],
                    curves=[(hour_grid, hand_built, 'their sum', PURPLE2)],
                    ax=axes[1], title='Added together: the demand curve, hand-built')
    plt.tight_layout()
    plt.show()

    print(f'{"structure":<15}{"height":>9}{"starts":>8}{"peaks":>8}{"ends":>8}{"ramps":>8}')
    print('─' * 56)
    print(f'{"dawn baseline":<15}{height:9.1f}{start:8.2f}{level_off:8.2f}{"-":>8}{2:8d}')
    for name, amp, opens, peak, closes in HAND_BUMPS:
        print(f'{name:<15}{amp:9.1f}{opens:8.2f}{peak:8.2f}{closes:8.2f}{3:8d}')
    print('─' * 56)
    print(f'Numbers turned by hand : {HAND_NUMBERS}   (ramps used: {HAND_NEURONS})')
    print(f'Distance from the true average demand curve : '
          f'{rmse(hourly_demand_curve(hour_grid), hand_built):.2f} pickups')


# ── The hand-tuning panel ────────────────────────────────────────────────────
# Rendered as inline HTML + SVG with a little vanilla JavaScript rather than with
# ipywidgets, for one reason: every slider move has to redraw instantly. An ipywidgets
# slider round-trips to the kernel, and a third of a second of lag is exactly enough to
# destroy the thing this panel exists to teach: the feel of the error surface under
# your hands. The trade is that the sliders need JavaScript to be live; the chart itself
# is rendered server-side, so a viewer without it still sees a correct static fit.
_TUNER_JS = r"""
(function () {
  var root = document.getElementById('tuner-__UID__');
  if (!root) { return; }
  var HRS = __HOURS__, PK = __PICKUPS__;
  var BH = __BASE_H__, BS = __BASE_S__, BE = __BASE_E__;
  var LO = __WIN_LO__, HI = __WIN_HI__, FLOOR = __FLOOR__;
  var X0 = 5, X1 = 11, YMAX = 260;
  var W = 680, H = 300, PL = 46, PR = 12, PT = 10, PB = 30;

  function sx(h) { return PL + (h - X0) / (X1 - X0) * (W - PL - PR); }
  function sy(v) { return H - PB - v / YMAX * (H - PB - PT); }
  function ramp(h, start, slope) { return slope * Math.max(0, h - start); }
  function shelf(h, start, end, height) {
    var k = height / (end - start);
    return ramp(h, start, k) - ramp(h, end, k);
  }
  function bump(h, start, peak, end, height) {
    var up = height / Math.max(peak - start, 0.05);
    var down = height / Math.max(end - peak, 0.05);
    return ramp(h, start, up) - ramp(h, peak, up + down) + ramp(h, end, down);
  }
  function model(h, p) {
    return shelf(h, BS, BE, BH) + bump(h, p.start, p.peak, p.end, p.height);
  }

  var ids = ['height', 'start', 'peak', 'end'];
  function readSliders() {
    var p = {};
    ids.forEach(function (id) {
      p[id] = parseFloat(root.querySelector('#' + id + '-__UID__').value);
    });
    return p;
  }

  function error(p) {
    var total = 0, n = 0;
    for (var i = 0; i < HRS.length; i++) {
      if (HRS[i] < LO || HRS[i] > HI) { continue; }
      var d = PK[i] - model(HRS[i], p);
      total += d * d; n++;
    }
    return Math.sqrt(total / n);
  }

  function path(p) {
    var pts = [];
    for (var i = 0; i <= 240; i++) {
      var h = X0 + (X1 - X0) * i / 240;
      pts.push(sx(h).toFixed(1) + ',' + sy(model(h, p)).toFixed(1));
    }
    return pts.join(' ');
  }

  var best = Infinity, nudges = 0;
  function draw() {
    var p = readSliders();
    ids.forEach(function (id) {
      root.querySelector('#' + id + '-val-__UID__').textContent =
        (id === 'height') ? p[id].toFixed(0) : p[id].toFixed(2);
    });
    root.querySelector('#fit-__UID__').setAttribute('points', path(p));

    var e = error(p);
    if (e < best) { best = e; }
    var verdict, colour;
    if (e <= FLOOR + 0.6) { verdict = 'at the noise floor'; colour = '#39b36a'; }
    else if (e < 18) { verdict = 'close'; colour = '#39b36a'; }
    else if (e < 30) { verdict = 'getting there'; colour = '#e0a23c'; }
    else { verdict = 'a long way off'; colour = '#e0796d'; }

    var errEl = root.querySelector('#err-__UID__');
    errEl.textContent = e.toFixed(1);
    errEl.style.color = colour;
    var vEl = root.querySelector('#verdict-__UID__');
    vEl.textContent = verdict;
    vEl.style.color = colour;
    root.querySelector('#best-__UID__').textContent = best.toFixed(1);
    root.querySelector('#nudges-__UID__').textContent = nudges;
    root.querySelector('#code-__UID__').textContent =
      'RUSH_HEIGHT = ' + p.height.toFixed(0) + '    RUSH_START = ' + p.start.toFixed(2) +
      '    RUSH_PEAK = ' + p.peak.toFixed(2) + '    RUSH_END = ' + p.end.toFixed(2);
  }

  ids.forEach(function (id) {
    var el = root.querySelector('#' + id + '-__UID__');
    el.addEventListener('input', draw);
    el.addEventListener('change', function () { nudges++; draw(); });
  });
  draw();
})();
"""


def _tuner_slider(uid, key, label, lo, hi, step, value, unit=''):
    """Build one labelled range slider for the hand-tuning panel.

    Args:
        uid: Unique suffix keeping this panel's element ids and CSS to itself.
        key: Slider name, matching the key the JavaScript reads.
        label: Text shown to the left of the track.
        lo: Minimum value.
        hi: Maximum value.
        step: Slider granularity.
        value: Starting value.
        unit: Suffix shown after the live readout.

    Returns:
        HTML markup for one slider row.
    """
    shown = f'{value:.0f}' if key == 'height' else f'{value:.2f}'
    return f'''
      <label class="knob">
        <span class="knob-name">{label}</span>
        <input id="{key}-{uid}" type="range" min="{lo}" max="{hi}" step="{step}"
               value="{value}">
        <span class="knob-val"><b id="{key}-val-{uid}">{shown}</b>{unit}</span>
      </label>'''


def show_bump_tuner(hourly, start=(175.0, 7.33, 8.10, 10.0), window=(6.5, 10.0)):
    """Show a live panel where the reader shapes the morning bump with four sliders.

    The dawn baseline is fixed and drawn in amber; the reader tunes only the three ramps
    that make the commuter bump, and watches the error move as they drag. That loop of
    nudge a knob, read the error, nudge again is gradient descent performed by hand,
    which is the point the notebook makes immediately afterwards.

    Args:
        hourly: The half-hourly dock log.
        start: Opening ``(height, starts, peaks, ends)``, normally the reader's own
            answer to Exercise 2. Non-numeric entries fall back to a rough guess, so the
            panel is usable even before that exercise is filled in.
        window: ``(lo, hi)`` hours the error is measured over.
    """
    try:
        height, opens, peak, closes = (float(v) for v in start)
    except (TypeError, ValueError):
        height, opens, peak, closes = 150.0, 7.00, 8.50, 10.00
        print('ℹ️  Exercise 2 is not filled in yet, so the sliders start from a rough '
              'guess.\n   Play here first if you like, then take your numbers back up.')

    visible = hourly[(hourly['hour'] >= 5) & (hourly['hour'] <= 11)]
    hours = visible['hour'].to_numpy()
    pickups = visible['pickups'].to_numpy().astype(float)
    scored = (hours >= window[0]) & (hours <= window[1])
    floor = rmse(pickups[scored], hourly_demand_curve(hours[scored]))
    base_h, base_s, base_e = HAND_BASELINE
    smooth = np.linspace(5, 11, 160)

    def _sx(h):
        return 46 + (np.asarray(h, dtype=float) - 5) / 6 * 622

    def _sy(v):
        return 270 - np.asarray(v, dtype=float) / 260 * 260

    def _points(x, y):
        return ' '.join(f'{a:.1f},{b:.1f}' for a, b in zip(_sx(x), _sy(y)))

    fitted = (relu_shelf(smooth, base_s, base_e, base_h)
              + relu_bump(smooth, opens, peak, closes, height))
    dots = ''.join(f'<circle cx="{a:.1f}" cy="{b:.1f}" r="1.9"/>'
                   for a, b in zip(_sx(hours), _sy(pickups)))
    ticks = ''.join(
        f'<line x1="{_sx(h):.0f}" y1="270" x2="{_sx(h):.0f}" y2="274" stroke="#d9dbe7"/>'
        f'<text x="{_sx(h):.0f}" y="286" font-size="10" fill="{MUTED}" '
        f'text-anchor="{"start" if h == 5 else "end" if h == 11 else "middle"}">'
        f'{h:02d}:00</text>' for h in range(5, 12))
    ygrid = ''.join(
        f'<line x1="46" y1="{_sy(v):.0f}" x2="668" y2="{_sy(v):.0f}" stroke="#eceef5"/>'
        f'<text x="40" y="{_sy(v) + 3:.0f}" text-anchor="end" font-size="10" '
        f'fill="{MUTED}">{v}</text>' for v in (0, 50, 100, 150, 200, 250))

    uid = uuid.uuid4().hex[:8]
    sliders = (_tuner_slider(uid, 'height', 'peak height', 0, 350, 5, height, ' pickups')
               + _tuner_slider(uid, 'start', 'starts at', 5, 9, 0.05, opens, 'h')
               + _tuner_slider(uid, 'peak', 'peaks at', 6, 11, 0.05, peak, 'h')
               + _tuner_slider(uid, 'end', 'back to zero at', 7, 12, 0.05, closes, 'h'))

    script = (_TUNER_JS
              .replace('__UID__', uid)
              .replace('__HOURS__', '[' + ','.join(f'{v:.2f}' for v in hours) + ']')
              .replace('__PICKUPS__', '[' + ','.join(f'{v:.0f}' for v in pickups) + ']')
              .replace('__BASE_H__', repr(base_h))
              .replace('__BASE_S__', repr(base_s))
              .replace('__BASE_E__', repr(base_e))
              .replace('__WIN_LO__', repr(float(window[0])))
              .replace('__WIN_HI__', repr(float(window[1])))
              .replace('__FLOOR__', f'{floor:.3f}'))

    display(HTML(f'''
    <style>{_CARD_CSS.format(uid=uid)}
      .card-{uid} .chart {{ background: #fff; border: 1px solid #e6e8ee;
        border-radius: 14px; padding: 6px 8px 2px; margin-bottom: 12px; }}
      .card-{uid} .knobs {{ display: flex; flex-wrap: wrap; gap: 8px 18px;
        margin-bottom: 12px; }}
      .card-{uid} .knob {{ flex: 1 1 310px; display: flex; align-items: center;
        gap: 10px; background: #fff; border: 1px solid #e6e8ee; border-radius: 12px;
        padding: 8px 12px; font-size: 12.5px; }}
      .card-{uid} .knob-name {{ width: 76px; color: #4a4a63; }}
      .card-{uid} .knob input {{ flex: 1; accent-color: {PURPLE2}; min-width: 90px; }}
      .card-{uid} .knob-val {{ width: 80px; text-align: right; color: {MUTED};
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; }}
      .card-{uid} .knob-val b {{ color: {INK}; font-size: 12.5px; }}
      .card-{uid} .score {{ display: flex; flex-wrap: wrap; gap: 10px; }}
      .card-{uid} .tile {{ flex: 1 1 150px; background: #fff; border: 1px solid #e6e8ee;
        border-radius: 12px; padding: 10px 14px; }}
      .card-{uid} .tile .k {{ font-size: 11px; color: {MUTED}; display: block; }}
      .card-{uid} .tile .v {{ font-size: 21px; font-weight: 650; line-height: 1.35; }}
      .card-{uid} code {{ display: block; margin-top: 12px; background: #fff;
        border: 1px solid #e6e8ee; border-radius: 12px; padding: 10px 14px;
        font-size: 12px; color: #4a4a63; overflow-x: auto; white-space: pre; }}
    </style>
    <div class="card-{uid}" id="tuner-{uid}">
      <h3>🎛️ Turn the knobs yourself</h3>
      <p class="sub">The <b style="color:{AMBER}">dawn baseline</b> is given, and the
        <b>dotted line</b> is the true average demand. You shape the three ramps that make
        the commuter bump. The error is measured against the real counts in the shaded
        window, {window[0]:.2f}h to {window[1]:.0f}h, the way a forecast would be graded.</p>
      <div class="chart">
        <svg viewBox="0 0 680 300" width="100%" role="img">
          <clipPath id="clip-{uid}"><rect x="46" y="6" width="622" height="266"/></clipPath>
          <rect x="{_sx(window[0]):.0f}" y="10"
                width="{_sx(window[1]) - _sx(window[0]):.0f}" height="260"
                fill="{PURPLE}" opacity="0.06"/>
          {ygrid}
          <line x1="46" y1="270" x2="668" y2="270" stroke="#d9dbe7"/>
          {ticks}
          <g fill="{PURPLE}" opacity="0.24">{dots}</g>
          <g clip-path="url(#clip-{uid})">
            <polyline points="{_points(smooth, hourly_demand_curve(smooth))}" fill="none"
                      stroke="{INK}" stroke-width="1.4" stroke-dasharray="3 3"
                      opacity="0.5"/>
            <polyline points="{_points(smooth, relu_shelf(smooth, base_s, base_e, base_h))}"
                      fill="none" stroke="{AMBER}" stroke-width="2"/>
            <polyline id="fit-{uid}" points="{_points(smooth, fitted)}" fill="none"
                      stroke="{PURPLE2}" stroke-width="3" stroke-linecap="round"/>
          </g>
        </svg>
      </div>
      <div class="knobs">{sliders}</div>
      <div class="score">
        <div class="tile"><span class="k">your error right now</span>
          <span class="v" id="err-{uid}">–</span>
          <span class="k" id="verdict-{uid}">&nbsp;</span></div>
        <div class="tile"><span class="k">best you have reached</span>
          <span class="v" id="best-{uid}">–</span>
          <span class="k">lower is better</span></div>
        <div class="tile"><span class="k">a perfect forecast scores</span>
          <span class="v" style="color:{GREEN}">{floor:.1f}</span>
          <span class="k">the rest is just weather</span></div>
        <div class="tile"><span class="k">knob nudges so far</span>
          <span class="v" id="nudges-{uid}">0</span>
          <span class="k">remember this number</span></div>
      </div>
      <code id="code-{uid}">RUSH_HEIGHT = {height:.0f}    RUSH_START = {opens:.2f}    RUSH_PEAK = {peak:.2f}    RUSH_END = {closes:.2f}</code>
    </div>
    <script>{script}</script>'''))


def show_width_sweep(hourly, models, ncols=3):
    """Draw one panel per trained network so the fits can be compared at a glance.

    Args:
        hourly: The half-hourly dock log.
        models: Mapping of hidden-layer width to a fitted ``TinyMLP``.
        ncols: Number of panels per row.
    """
    nrows = int(np.ceil(len(models) / ncols))
    fig, axes = plt.subplots(nrows, ncols, figsize=(4.6 * ncols, 3.3 * nrows),
                             sharex=True, sharey=True)
    flat = np.atleast_1d(axes).ravel()
    for index, (ax, (width, model)) in enumerate(zip(flat, models.items())):
        plot_demand_fit(
            hourly['hour'], hourly['pickups'], ax=ax, legend=False,
            curves=[(_HOUR_GRID, hourly_demand_curve(_HOUR_GRID), 'true demand', INK, ':'),
                    (_HOUR_GRID, model.predict(_HOUR_GRID), f'{width} neurons', PURPLE2)],
            title=f'{width} neuron{"s" if width > 1 else ""}'
                  f'  ·  {model.n_parameters} numbers to learn')
        if index < len(models) - ncols:
            ax.set_xlabel('')
        if index % ncols:
            ax.set_ylabel('')
    for ax in flat[len(models):]:
        ax.set_visible(False)
    fig.tight_layout()
    plt.show()


def show_model_size_tradeoff(models, train_hour, train_pickups,
                             holdout_hour, holdout_pickups, noise_floor, tolerance=0.02):
    """Plot error against model size and pick the cheapest network at the elbow.

    The elbow, not the minimum: past the point where the curve flattens, the differences
    between widths are smaller than the noise in the data itself, so the cheapest network
    within ``tolerance`` of the best is the one worth buying.

    Args:
        models: Mapping of hidden-layer width to a fitted ``TinyMLP``.
        train_hour: Hours of the training days.
        train_pickups: Pickup counts of the training days.
        holdout_hour: Hours of the held-out days.
        holdout_pickups: Pickup counts of the held-out days.
        noise_floor: The error a perfect forecast would still make.
        tolerance: Relative slack allowed above the best held-out error.

    Returns:
        Tuple ``(best_width, best_model)``.
    """
    widths = list(models)
    train_errors = [rmse(train_pickups, m.predict(train_hour)) for m in models.values()]
    holdout_errors = [rmse(holdout_pickups, m.predict(holdout_hour))
                      for m in models.values()]

    _, ax = plt.subplots(figsize=(7.2, 4.0))
    ax.plot(widths, train_errors, 'o--', color=PURPLE, lw=1.8, ms=6,
            label='error on the days we trained on')
    ax.plot(widths, holdout_errors, 'o-', color=PURPLE2, lw=2.4, ms=7,
            label='error on held-out days')
    ax.axhline(noise_floor, color=GREEN, lw=1.8, ls=':',
               label=f'noise floor on the held-out days ({noise_floor:.1f})')
    ax.set_xscale('log', base=2)
    ax.set_xticks(widths)
    ax.set_xticklabels([str(w) for w in widths])
    style_axis(ax, 'How much model do we actually need?',
               'neurons in the hidden layer', 'typical error (pickups per half hour)')
    ax.legend(frameon=False, fontsize=8.5)
    plt.tight_layout()
    plt.show()

    scores = dict(zip(widths, holdout_errors))
    best = min(w for w in widths if scores[w] <= min(holdout_errors) * (1 + tolerance))
    print(f'Best held-out error of any size : {min(holdout_errors):.2f} pickups')
    print(f'Cheapest network within {tolerance:.0%} of it: {best} neurons, '
          f'{models[best].n_parameters} numbers to learn.')
    return best, models[best]


def show_survey_and_census(stations, truth_grid):
    """Put the surveyed dots next to the demand map we wish we had.

    Args:
        stations: The surveyed-site table.
        truth_grid: The dense census, as a square array.
    """
    fig, axes = plt.subplots(1, 2, figsize=(11.4, 4.6))
    scatter = axes[0].scatter(stations['x_km'], stations['y_km'],
                              c=stations['pickups_per_day'], s=26, cmap='magma',
                              vmin=0, vmax=truth_grid.max(), lw=0)
    style_axis(axes[0], f'What the survey gives you: {len(stations)} dots',
               'km east of the Hauptbahnhof', 'km north')
    axes[0].set_xlim(-CITY_HALF_WIDTH, CITY_HALF_WIDTH)
    axes[0].set_ylim(-CITY_HALF_WIDTH, CITY_HALF_WIDTH)
    axes[0].grid(False)
    fig.colorbar(scatter, ax=axes[0], fraction=0.046, pad=0.03)
    image = axes[1].imshow(truth_grid, origin='lower', extent=CITY_EXTENT, cmap='magma',
                           vmin=0, vmax=truth_grid.max(), interpolation='bilinear')
    style_axis(axes[1], 'What you actually need: demand everywhere',
               'km east of the Hauptbahnhof', '')
    axes[1].grid(False)
    fig.colorbar(image, ax=axes[1], fraction=0.046, pad=0.03, label='pickups per day')
    plt.tight_layout()
    plt.show()

    print('The right-hand map is a full census of the city. VeloZüri does not have it and')
    print('never will. It is here only so we can grade the model honestly. The model will')
    print('only ever see the dots on the left.')


def show_reconstructed_city(truth_grid, predicted_grid, survey_budget):
    """Show the census, the reconstruction, and the gap between them on one colour scale.

    Args:
        truth_grid: The dense census, as a square array.
        predicted_grid: The network's demand map, as a square array.
        survey_budget: How many surveyed sites the network was given.
    """
    plot_city_maps(
        [('The full census (never available)', truth_grid),
         (f'What the network built from {survey_budget} dots', predicted_grid),
         ('How far off it is, same colour scale', np.abs(truth_grid - predicted_grid))],
        vmax=truth_grid.max())
    plt.show()


def show_budget_comparison(stations, truth_grid, map_coords, budgets=(40, 150, 700),
                           hidden=(48, 48), epochs=4000, lr=0.01):
    """Fit the same network on three survey budgets and compare the depots it proposes.

    Args:
        stations: The surveyed-site table.
        truth_grid: The dense census, as a square array.
        map_coords: Coordinates to predict on, from ``city_map_grid``.
        budgets: Survey sizes to compare.
        hidden: Hidden-layer sizes of the network.
        epochs: Training epochs per network.
        lr: Learning rate.
    """
    panels, sites, hotspots = [], [], []
    for budget in budgets:
        subset = stations.iloc[:budget]
        net = TinyMLP(hidden=hidden, activation='relu', seed=RANDOM_STATE).fit(
            subset[['x_km', 'y_km']].to_numpy(),
            subset['pickups_per_day'].to_numpy().astype(float), epochs=epochs, lr=lr)
        grid = as_map(net.predict(map_coords))
        panels.append((f'{budget} sites surveyed, off by '
                       f'{rmse(truth_grid, grid):.0f}/day', grid))
        sites.append((subset['x_km'], subset['y_km']))
        hotspots.append(top_hotspots(grid, k=3, min_separation_km=2.0))

    plot_city_maps(panels, stations=sites, hotspots=hotspots, vmax=truth_grid.max())
    plt.show()

    truth_spots = top_hotspots(truth_grid, k=3, min_separation_km=2.0)
    print('Where the three depots would go\n' + '─' * 62)
    print(f'{"survey":>8}   {"depot 1":>16} {"depot 2":>16} {"depot 3":>16}')
    print(f'{"census":>8}   '
          + ' '.join(f'({x:+5.1f},{y:+5.1f}) km' for x, y, _ in truth_spots))
    for budget, spots in zip(budgets, hotspots):
        print(f'{budget:>8}   '
              + ' '.join(f'({x:+5.1f},{y:+5.1f}) km' for x, y, _ in spots))


def show_extrapolation(hourly, best_net, best, night_hours, night_forecast):
    """Draw the fitted curve far outside the hours the network was ever shown.

    Args:
        hourly: The half-hourly dock log.
        best_net: The network Part 3 settled on.
        best: Its hidden-layer width, for the legend.
        night_hours: The out-of-range hours asked about in Exercise 5.
        night_forecast: What the network answered for them.
    """
    wide_grid = np.linspace(0, 30, 700)
    ax = plot_demand_fit(
        hourly['hour'], hourly['pickups'],
        curves=[(wide_grid, best_net.predict(wide_grid),
                 f'{best} neurons, extrapolated', RED),
                (_HOUR_GRID, best_net.predict(_HOUR_GRID), 'inside the sampled hours',
                 PURPLE2)],
        xlim=(0, 30), sampled_span=(OPENING_HOUR, CLOSING_HOUR),
        title='Same model, same weights, asked about hours it has never seen')
    ax.axhline(0, color=INK, lw=1, ls='--', alpha=.6)
    ax.scatter(night_hours, night_forecast, s=55, color=RED, zorder=5, marker='v',
               label='the van schedule')
    ax.legend(frameon=False, fontsize=8.5, loc='upper right')
    plt.tight_layout()
    plt.show()


def show_seed_disagreement(hourly, train_hour, train_pickups, holdout_hour,
                           holdout_pickups, width, seeds=(0, 1, 2, 7, 42),
                           epochs=6000, lr=0.02, batch_size=128):
    """Train the same architecture from several random starts and compare them.

    Inside the sampled hours the fits are interchangeable; outside them they fan apart,
    which is the cleanest available proof that the data says nothing about that region.

    Args:
        hourly: The half-hourly dock log.
        train_hour: Hours of the training days.
        train_pickups: Pickup counts of the training days.
        holdout_hour: Hours of the held-out days.
        holdout_pickups: Pickup counts of the held-out days.
        width: Hidden-layer width to use for every run.
        seeds: Random seeds to train from.
        epochs: Training epochs per network.
        lr: Learning rate.
        batch_size: Mini-batch size, matching the sweep in Part 3.
    """
    nets, scores = [], []
    for seed in seeds:
        net = TinyMLP(hidden=(width,), activation='relu', seed=seed).fit(
            train_hour, train_pickups, epochs=epochs, lr=lr, batch_size=batch_size)
        nets.append(net)
        scores.append(rmse(holdout_pickups, net.predict(holdout_hour)))

    wide_grid = np.linspace(0, 30, 700)
    shades = ['#667eea', '#764ba2', '#3fa9c9', '#c9739b', '#8b6bc0']
    curves = [(wide_grid, net.predict(wide_grid), f'seed {seed}', shade)
              for net, seed, shade in zip(nets, seeds, shades)]

    _, axes = plt.subplots(1, 2, figsize=(13.5, 4.4),
                           gridspec_kw={'width_ratios': [1.7, 1]})
    plot_demand_fit(hourly['hour'], hourly['pickups'], curves, ax=axes[0], xlim=(0, 30),
                    sampled_span=(OPENING_HOUR, CLOSING_HOUR), point_alpha=0.10,
                    legend=False,
                    title='Five models that agree on every hour we measured')
    axes[0].legend(frameon=False, fontsize=8, loc='upper right', ncol=2)
    night = (wide_grid >= 0) & (wide_grid <= 6)
    night_values = np.array([net.predict(wide_grid)[night] for net in nets])
    pad = 0.12 * (night_values.max() - night_values.min() + 1)
    plot_demand_fit(hourly['hour'], hourly['pickups'], curves, ax=axes[1], xlim=(0, 6),
                    ylim=(night_values.min() - pad, night_values.max() + pad),
                    sampled_span=(OPENING_HOUR, CLOSING_HOUR),
                    point_alpha=0.35, legend=False,
                    title='Zoomed on the night shift: no agreement at all')
    for ax in axes:
        ax.axhline(0, color=INK, lw=1, ls='--', alpha=.6)
    axes[1].set_ylabel('')
    plt.tight_layout()
    plt.show()

    print(f'Held-out error, all {len(seeds)}  : {min(scores):.2f} – {max(scores):.2f} '
          'pickups  (every one of them a defensible fit)')
    for probe in (12.0, 18.0, 0.0, 30.0):
        guesses = np.array([net.predict(np.array([probe]))[0] for net in nets])
        where = 'inside  ' if OPENING_HOUR <= probe <= CLOSING_HOUR else 'OUTSIDE '
        print(f'{where}the sampled hours, at {probe:4.1f}h : '
              f'they range from {guesses.min():7.1f} to {guesses.max():6.1f}  '
              f'(spread {np.ptp(guesses):5.1f})')


def show_depth_vs_width(survey, truth_grid, map_coords, epochs=4000, lr=0.01):
    """Fit the city twice at an identical parameter budget: two layers versus one.

    Args:
        survey: The surveyed sites the network is allowed to see.
        truth_grid: The dense census, as a square array.
        map_coords: Coordinates to predict on, from ``city_map_grid``.
        epochs: Training epochs per network.
        lr: Learning rate.
    """
    features = survey[['x_km', 'y_km']].to_numpy()
    target = survey['pickups_per_day'].to_numpy().astype(float)

    panels = []
    for hidden, label in (((48, 48), 'two layers of 48'), ((636,), 'one layer of 636')):
        started = time.time()
        net = TinyMLP(hidden=hidden, activation='relu', seed=RANDOM_STATE).fit(
            features, target, epochs=epochs, lr=lr)
        grid = as_map(net.predict(map_coords))
        panels.append((f'{label}, {net.n_parameters:,} parameters\n'
                       f'off by {rmse(truth_grid, grid):.0f}/day, '
                       f'{time.time() - started:.0f}s to train', grid))

    plot_city_maps([('The full census', truth_grid)] + panels, vmax=truth_grid.max())
    plt.show()


__all__ = [
    'house_style', 'PURPLE', 'PURPLE2', 'GREEN', 'RED', 'AMBER', 'INK', 'MUTED',
    'style_axis', 'plot_demand_fit', 'plot_city_maps',
    'show_roadmap', 'show_neuron_knobs', 'show_theorem_card', 'describe_datasets',
    'show_demand_scatter', 'show_relu_function', 'show_single_neuron_fit',
    'show_bump_construction',
    'show_morning_rush', 'show_hand_built_day', 'show_bump_tuner',
    'show_width_sweep',
    'show_model_size_tradeoff', 'show_survey_and_census', 'show_reconstructed_city',
    'show_budget_comparison', 'show_extrapolation', 'show_seed_disagreement',
    'show_depth_vs_width',
]
