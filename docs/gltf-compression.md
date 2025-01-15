# GLTF Compression

### use gltf-pipeline for compression

https://github.com/CesiumGS/gltf-pipeline

Can be installed using npm:

```bash
npm install -g gltf-pipeline
```

### sane person compression if it's already stylized:

```bash
gltf-pipeline -i input.glb -o output.glb --draco.compressionLevel 10 --texcomp.quality 50 --texcomp.powerOfTwoImage true
```

This command:

1. Uses Draco compression with maximum level (10)
2. Reduces the precision of various attributes (position, normal, texture coordinates, color, and other generic
   attributes) by specifying fewer bits for each. This effectively removes data points. 3.
3. Applies the --optimize.simplify flag, which attempts to simplify the geometry while preserving the overall shape.

You can adjust the quantization bits (the numbers after each quantize...Bits option) to be even lower for more
aggressive simplification. For example:

```bash
--draco.quantizePositionBits 8 --draco.quantizeNormalBits 6 --draco.quantizeTexcoordBits 6 --draco.quantizeColorBits 6 --draco.quantizeGenericBits 6
```

### really abysmal compression to "stylize" something normal

(used for possum and banana so far)- uses 8 for quantization leading to gross blocky look sometimes unintended with
holes

```bash
gltf-pipeline -i possum.glb -o simplified_possum.glb --draco.compressionLevel 10 --draco.quantizePositionBits 6 --draco.quantizeNormalBits 4 --draco.quantizeTexcoordBits 4 --draco.quantizeColorBits 4 --draco.quantizeGenericBits 4 --optimize.simplify
```

#### not sure what this one does, added a bunch more flags might break things lmk tho

```bash
gltf-pipeline -i possum.glb -o simplified_possum.glb --draco.compressionLevel 10 --draco.quantizePositionBits 6 --draco.quantizeNormalBits 4 --draco.quantizeTexcoordBits 4 --draco.quantizeColorBits 4 --draco.quantizeGenericBits 4 --optimize.simplify --optimize.pruneUnused --optimize.mergeInstances --optimize.mergeMaterials --optimize.stripJoints
```
