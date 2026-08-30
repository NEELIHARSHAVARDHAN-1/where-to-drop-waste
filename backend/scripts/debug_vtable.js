/**
 * Low-level analysis of the first few tensors to understand the vtable layout.
 */
'use strict';

const path = require('path');
const fs = require('fs');

const buf = fs.readFileSync(path.join(__dirname, '..', 'models', 'teachable_machine', 'model_unquant.tflite'));

function safe_readI32(off) { return (off >= 0 && off + 4 <= buf.length) ? buf.readInt32LE(off) : 0; }
function safe_readU32(off) { return (off >= 0 && off + 4 <= buf.length) ? buf.readUInt32LE(off) : 0; }
function safe_readI8(off)  { return (off >= 0 && off + 1 <= buf.length) ? buf.readInt8(off) : 0; }

function makeVTable(tableAbsOff) {
  const vtRel = safe_readI32(tableAbsOff);
  const vtAbs = tableAbsOff - vtRel;
  const vtSz  = safe_readU32(vtAbs) & 0xFFFF;
  console.log(`    vtable at 0x${vtAbs.toString(16)}, vtRel=${vtRel}, vtSz=${vtSz}`);
  // Print all vtable fields
  const numFields = Math.floor((vtSz - 4) / 2);
  const fields = [];
  for (let fi = 0; fi < numFields; fi++) {
    const fo = buf.readUInt16LE(vtAbs + 4 + fi * 2);
    fields.push(fo);
  }
  console.log(`    fields[${numFields}]: [${fields.join(', ')}]`);
  return function getField(fieldIndex) {
    const byteOff = 4 + fieldIndex * 2;
    if (byteOff + 2 > vtSz) return 0;
    return buf.readUInt16LE(vtAbs + byteOff);
  };
}

// Navigate to first tensor
const rootAbsOff = safe_readU32(0);
const modelGF = makeVTable(rootAbsOff);

const sgFieldOff = modelGF(2); // subgraphs
console.log('\n--- Model vtable sgFieldOff:', sgFieldOff);

const sgRefAbs = rootAbsOff + sgFieldOff;
const sgVecAbs = sgRefAbs + safe_readI32(sgRefAbs);
const sg0RelOff = safe_readI32(sgVecAbs + 4);
const sg0AbsOff = sgVecAbs + 4 + sg0RelOff;
const sgGF = makeVTable(sg0AbsOff);

const tensorsFieldOff = sgGF(0);
console.log('\n--- Subgraph vtable tensorsFieldOff:', tensorsFieldOff);

const tvRefAbs = sg0AbsOff + tensorsFieldOff;
const tvRelOff = safe_readI32(tvRefAbs);
const tvVecAbs = tvRefAbs + tvRelOff;
const tvCount  = safe_readU32(tvVecAbs);
console.log(`Tensor count: ${tvCount}`);

// Analyze tensor 0 in detail
for (let ti = 0; ti < Math.min(3, tvCount); ti++) {
  const tRelOff = safe_readI32(tvVecAbs + 4 + ti * 4);
  const tAbsOff = tvVecAbs + 4 + ti * 4 + tRelOff;
  
  console.log(`\n=== Tensor ${ti} at 0x${tAbsOff.toString(16)} ===`);
  const tGF = makeVTable(tAbsOff);
  
  // field 0: name
  const nameOff = tGF(0);
  console.log(`  nameFieldOff: ${nameOff}`);
  if (nameOff) {
    const nameRefAbs = tAbsOff + nameOff;
    const nameRelOff = safe_readI32(nameRefAbs);
    const nameVecAbs = nameRefAbs + nameRelOff;
    const nameLen = safe_readU32(nameVecAbs);
    console.log(`  nameLen: ${nameLen}`);
    if (nameLen > 0 && nameLen < 200) {
      const name = buf.slice(nameVecAbs + 4, nameVecAbs + 4 + nameLen).toString('utf8');
      console.log(`  name: "${name}"`);
    }
  }

  // field 1: type
  const typeOff = tGF(1);
  console.log(`  typeFieldOff: ${typeOff}`);
  if (typeOff) {
    const typeVal = safe_readI32(tAbsOff + typeOff);
    const types = ['FLOAT32','FLOAT16','INT32','UINT8','INT64','STRING','BOOL','INT16','COMPLEX64','INT8','FLOAT64','COMPLEX128'];
    console.log(`  type: ${typeVal} (${types[typeVal] || '?'})`);
  }

  // field 2: shape
  const shapeOff = tGF(2);
  console.log(`  shapeFieldOff: ${shapeOff}`);
  if (shapeOff) {
    const shapeRefAbs = tAbsOff + shapeOff;
    const shapeRelOff = safe_readI32(shapeRefAbs);
    const shapeVecAbs = shapeRefAbs + shapeRelOff;
    const shapeCount = safe_readU32(shapeVecAbs);
    console.log(`  shapeCount: ${shapeCount}`);
    const shape = [];
    for (let i = 0; i < Math.min(shapeCount, 8); i++) {
      shape.push(safe_readI32(shapeVecAbs + 4 + i * 4));
    }
    console.log(`  shape: [${shape}]`);
  }

  // field 3: buffer
  const bufOff = tGF(3);
  console.log(`  bufferFieldOff: ${bufOff}`);
  if (bufOff) {
    const bufIdx = safe_readU32(tAbsOff + bufOff);
    console.log(`  bufferIndex: ${bufIdx}`);
  }
}
