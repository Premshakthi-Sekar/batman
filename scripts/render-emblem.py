#!/usr/bin/env python3
"""Render the 1989 oval emblem from the Batman curve (MathWorld)."""

from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "renderer" / "batman-mark.svg"


def batman(x):
    H = lambda v: np.heaviside(v, 0.5)
    sqrt = lambda v: np.sqrt(np.maximum(v, 0.0))

    w = 3 * sqrt(1 - (x / 7) ** 2)
    l = 0.5 * (x + 3) - 3 / 7 * sqrt(10 * (4 - (x + 1) ** 2)) + 6 / 7 * sqrt(10)
    h = 0.5 * (
        3 * (np.abs(x + 0.5) + np.abs(x - 0.5) + 6)
        - 11 * (np.abs(x - 0.75) + np.abs(x + 0.75))
    )
    r = 0.5 * (3 - x) - 3 / 7 * sqrt(10 * (4 - (x - 1) ** 2)) + 6 / 7 * sqrt(10)

    upper = np.where(
        np.abs(x) > 7,
        np.nan,
        (h - l) * H(x + 1)
        + (r - h) * H(x - 1)
        + (l - w) * H(x + 3)
        + (w - r) * H(x - 3)
        + w,
    )
    lower = np.where(
        np.abs(x) > 7,
        np.nan,
        0.5
        * (
            np.abs(0.5 * x)
            + sqrt(1 - (np.abs(np.abs(x) - 2) - 1) ** 2)
            - (3 * sqrt(33) - 7) / 112 * x**2
            + 3 * sqrt(1 - (x / 7) ** 2)
            - 3
        )
        * (np.sign(x + 4) - np.sign(x - 4))
        - 3 * sqrt(1 - (x / 7) ** 2),
    )
    return upper, lower


def main():
    x = np.linspace(-7, 7, 2400)
    upper, lower = batman(x)
    good = np.isfinite(upper) & np.isfinite(lower)
    x, upper, lower = x[good], upper[good], lower[good]

    xs = np.concatenate([x, x[::-1]])
    ys = np.concatenate([upper, lower[::-1]])

    # Map the curve into a 1000x500 oval with a little padding.
    pad_x, pad_y = 0.55, 0.42
    min_x, max_x = -7 - pad_x, 7 + pad_x
    min_y, max_y = -3.15 - pad_y, 3.05 + pad_y
    vb_w, vb_h = 1000.0, 500.0

    def tx(v):
        return (v - min_x) / (max_x - min_x) * vb_w

    def ty(v):
        return (max_y - v) / (max_y - min_y) * vb_h

    pts = " ".join(f"{tx(px):.2f},{ty(py):.2f}" for px, py in zip(xs, ys))
    cx, cy = vb_w / 2, vb_h / 2
    rx, ry = vb_w / 2 - 8, vb_h / 2 - 8

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500" aria-hidden="true">
  <ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="#FFD200" stroke="#000" stroke-width="16"/>
  <polygon fill="#000" points="{pts}"/>
</svg>
"""
    OUT.write_text(svg)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {len(xs)} points)")


if __name__ == "__main__":
    main()
