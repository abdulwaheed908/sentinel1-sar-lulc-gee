# Sentinel-1 SAR Land Use / Land Cover Classification (Google Earth Engine)

Land use / land cover (LULC) mapping of **Islamabad Capital Territory, Pakistan** for **2022** using Sentinel-1 C-band SAR backscatter and a Random Forest classifier in Google Earth Engine.

<!-- Map image will be added here: images/lulc_map.png -->

## Why SAR?
Islamabad's monsoon season brings heavy cloud cover, which leaves gaps in optical imagery. Sentinel-1 radar images through cloud, so a full-year composite is always available.

## Data
| Dataset | Details |
|---|---|
| Sentinel-1 GRD (`COPERNICUS/S1_GRD`) | IW mode, VV + VH, ascending and descending passes, Jan–Dec 2022 |
| Study area boundary | FAO GAUL 2015, level 1 (Islamabad Capital Territory) |
| Training labels | Stratified random points (300 per class) labelled from ESA WorldCover 2021 (`ESA/WorldCover/v200`), grouped into built-up, vegetation and barren |

## Method
1. Filter Sentinel-1 scenes by area, date, polarization (VV + VH) and IW mode; mask border noise.
2. Build annual mean composites separately for ascending and descending passes. Averaging is done in **linear power, not dB**, then converted back to dB.
3. Features: VV and VH (ascending and descending) plus the VH/VV ratio.
4. Sample the composite at the training points; split 70% training / 30% testing.
5. Classify with Random Forest (200 trees).
6. Assess accuracy on the **held-out test points**: confusion matrix, overall accuracy, kappa, producer's and user's accuracy.
7. Compute area per class.

## Results
*In progress. Accuracy, kappa and per-class areas will be added after the final run.*

## Limitations
- Training and test labels come from WorldCover, not field data, so the reported accuracy measures agreement with WorldCover (including its errors), not true ground accuracy.
- SAR alone separates vegetation from barren ground less reliably than optical data.
- Steep terrain causes layover and shadow in SAR; no terrain correction is applied.
- Random point splits can overstate accuracy when test points sit close to training points (spatial autocorrelation).

## Next steps
- Add Sentinel-2 bands and indices (NDVI, NDBI) for a SAR + optical classification.
- Add a water class and seasonal composites.
- Use spatially separated test data.

## How to run
1. Open the [Earth Engine Code Editor](https://code.earthengine.google.com/) and paste `s1_lulc.js`.
2. Click **Run**. No imports are needed: training points are generated automatically from ESA WorldCover.
3. Check the Console output, and run the export task from the **Tasks** tab.
