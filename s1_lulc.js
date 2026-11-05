// =====================================================================
// Land use / land cover classification from Sentinel-1 SAR (VV/VH)
// Google Earth Engine — Random Forest
// Author: Abdul Waheed
// Adapted from: [credit the original tutorial/author here]
// =====================================================================


// ---------------- 1. Study area ----------------
// A public boundary, so anyone can run this script.
// CHECK: confirm these names match your study area in FAO GAUL
// (print the collection and inspect ADM2_NAME if the count below is 0).
var districts = ['Upper Dir', 'Lower Dir'];
var ROI = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'Pakistan'))
  .filter(ee.Filter.inList('ADM2_NAME', districts));
print('ROI features (must be > 0):', ROI.size());
Map.centerObject(ROI, 9);


// ---------------- 2. Parameters ----------------
var START = '2022-01-01';
var END   = '2023-01-01';   // filterDate end is exclusive, so this covers all of 2022
var SCALE = 10;             // Sentinel-1 GRD pixel size (m)
var SEED  = 42;             // fixed seed so the split and the forest are reproducible
var EXPORT_CRS = 'EPSG:32643'; // set the UTM zone for your area (zone 42N/43N boundary is at 72°E)


// ---------------- 3. Sentinel-1 collection ----------------
// Simple border-noise mask: very low VV values at scene edges are artefacts.
function maskBorderNoise(img) {
  return img.updateMask(img.select('VV').gt(-30));
}

var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(ROI)
  .filterDate(START, END)
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .map(maskBorderNoise);

var asc  = s1.filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'));
var desc = s1.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'));
print('Ascending scenes:', asc.size());
print('Descending scenes:', desc.size());


// ---------------- 4. Composite ----------------
// S1_GRD values are in dB (logarithmic). Averaging dB values is not the mean
// backscatter, so convert to linear power, average, then convert back to dB.
function meanDb(collection, band) {
  var linear = collection.select(band).map(function (img) {
    return ee.Image.constant(10).pow(img.divide(10)).rename(band);
  });
  return linear.mean().log10().multiply(10);
}

var composite = ee.Image.cat([
  meanDb(asc,  'VV').rename('VV_asc'),
  meanDb(asc,  'VH').rename('VH_asc'),
  meanDb(desc, 'VV').rename('VV_desc'),
  meanDb(desc, 'VH').rename('VH_desc')
]);

// VH - VV (a ratio in dB) helps separate vegetation from built-up and bare ground.
composite = composite.addBands(
  composite.select('VH_asc').subtract(composite.select('VV_asc')).rename('ratio_asc')
);
// Note: no focal_median here. A year of temporal averaging already removes most
// speckle, and spatial filtering blurs field and building edges.

Map.addLayer(composite.clip(ROI),
  {bands: ['VV_asc', 'VH_asc', 'VH_desc'], min: [-20, -25, -25], max: [0, -5, -5]},
  'S1 composite');


// ---------------- 5. Training data ----------------
// Training points are drawn in the Code Editor as three FeatureCollection imports,
// each with a NUMERIC property 'landcover':
//   builtup = 0, vegetation = 1, barren = 2
// To let others run this script, export the points as an asset and share it
// publicly, then load it here with ee.FeatureCollection('projects/.../points').
var samples = builtup.merge(vegetation).merge(barren);

var classNames = ['Built-up', 'Vegetation', 'Barren'];
var palette    = ['#d7301f', '#1a9850', '#fee08b'];

var bands = composite.bandNames();

var sampled = composite.sampleRegions({
  collection: samples,
  properties: ['landcover'],
  scale: SCALE
}).randomColumn('random', SEED);

// 70% to train, 30% held out to test. The model never sees the test points.
var trainSet = sampled.filter(ee.Filter.lt('random', 0.7));
var testSet  = sampled.filter(ee.Filter.gte('random', 0.7));
print('Training samples:', trainSet.size());
print('Test samples:', testSet.size());


// ---------------- 6. Random Forest ----------------
var classifier = ee.Classifier.smileRandomForest({numberOfTrees: 200, seed: SEED})
  .train({
    features: trainSet,
    classProperty: 'landcover',
    inputProperties: bands
  });

var classified = composite.classify(classifier).clip(ROI);
Map.addLayer(classified, {min: 0, max: 2, palette: palette}, 'LULC 2022');


// ---------------- 7. Accuracy (on held-out test points) ----------------
var tested = testSet.classify(classifier);
var cm = tested.errorMatrix('landcover', 'classification');
print('Classes (0, 1, 2):', classNames);
print('Confusion matrix (rows = reference, columns = predicted):', cm);
print('Overall accuracy:', cm.accuracy());
print('Kappa:', cm.kappa());
print("Producer's accuracy:", cm.producersAccuracy());
print("User's accuracy:", cm.consumersAccuracy());

print('Variable importance:', ee.Dictionary(classifier.explain().get('importance')));


// ---------------- 8. Area per class ----------------
var areas = ee.Image.pixelArea().divide(1e6).addBands(classified)
  .reduceRegion({
    reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'class'}),
    geometry: ROI.geometry(),
    scale: 30,          // 30 m is faster; change to 10 for final numbers
    maxPixels: 1e13,
    tileScale: 4
  });
print('Area by class (km²):', areas);


// ---------------- 9. Export ----------------
Export.image.toDrive({
  image: classified.toByte(),
  description: 'S1_LULC_2022',
  region: ROI.geometry(),
  scale: SCALE,
  crs: EXPORT_CRS,
  maxPixels: 1e13
});
