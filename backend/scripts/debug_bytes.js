/**
 * Direct byte dump of tensor 0 to understand the exact FlatBuffer layout.
 */
'use strict';

const path = require('path');
const fs = require('fs');

const buf = fs.readFileSync(path.join(__dirname, '..', 'models', 'teachable_machine', 'model_unquant.tflite'));

function safe_readI32(off) { return (off >= 0 && off + 4 <= buf.length) ? buf.readInt32LE(off) : 0; }
function safe_readU32(off) { return (off >= 0 && off + 4 <= buf.length) ? buf.readUInt32LE(off) : 0; }
function safe_readI16(off) { return (off >= 0 && off + 2 <= buf.length) ? buf.readInt16LE(off) : 0; }
function safe_readU16(off) { return (off >= 0 && off + 2 <= buf.length) ? buf.readUInt16LE(off) : 0; }

function hexAt(off, n=4) {
  const bytes = [];
  for (let i = 0; i < n; i++) bytes.push(buf[off+i]?.toString(16).padStart(2,'0') || '??');
  return bytes.join(' ');
}

// Navigate to tensor 0
const rootAbsOff = safe_readU32(0);
function makeVTable(tableAbsOff) {
  const vtRel = safe_readI32(tableAbsOff);
  const vtAbs = tableAbsOff - vtRel;
  const vtSz  = safe_readU16(vtAbs);
  const fields = [];
  const numFields = Math.floor((vtSz - 4) / 2);
  for (let fi = 0; fi < numFields; fi++) {
    fields.push(safe_readU16(vtAbs + 4 + fi * 2));
  }
  return { fields, getField: (fi) => fi < fields.length ? fields[fi] : 0 };
}

const modelVt = makeVTable(rootAbsOff);
const sgFieldOff = modelVt.getField(2);
const sgRefAbs = rootAbsOff + sgFieldOff;
const sgVecAbs = sgRefAbs + safe_readI32(sgRefAbs);
const sg0RelOff = safe_readI32(sgVecAbs + 4);
const sg0AbsOff = sgVecAbs + 4 + sg0RelOff;
const sgVt = makeVTable(sg0AbsOff);

const tensorsFieldOff = sgVt.getField(0);
const tvRefAbs = sg0AbsOff + tensorsFieldOff;
const tvRelOff = safe_readI32(tvRefAbs);
const tvVecAbs = tvRefAbs + tvRelOff;
const tvCount  = safe_readU32(tvVecAbs);

// Tensor 0
const t0RelOff = safe_readI32(tvVecAbs + 4);
const t0AbsOff = tvVecAbs + 4 + t0RelOff;

console.log(`Tensor 0 at: 0x${t0AbsOff.toString(16)}`);
console.log('Raw bytes (+0 to +31):');
for (let i = 0; i < 32; i += 4) {
  const val = safe_readI32(t0AbsOff + i);
  const hex = hexAt(t0AbsOff + i, 4);
  console.log(`  [+${i.toString().padStart(2)}] 0x${(t0AbsOff + i).toString(16).padStart(8,'0')}  bytes: ${hex}  i32: ${val}`);
}

// VTable
const vtRel = safe_readI32(t0AbsOff);
const vtAbs = t0AbsOff - vtRel;
const vtSz  = safe_readU16(vtAbs);
console.log(`\nVTable at 0x${vtAbs.toString(16)}, vtRel=${vtRel}, vtSz=${vtSz}`);
const numFields = Math.floor((vtSz - 4) / 2);
for (let fi = 0; fi < numFields; fi++) {
  const fo = safe_readU16(vtAbs + 4 + fi * 2);
  console.log(`  field[${fi}] offset=${fo}  value_at_table+${fo}: i32=${fo ? safe_readI32(t0AbsOff+fo) : 'N/A'}  u32=${fo ? safe_readU32(t0AbsOff+fo) : 'N/A'}`);
}

// Field 2 (shape) — let's trace it manually
console.log('\n--- Manual shape field trace ---');
const shapeFieldOff = safe_readU16(vtAbs + 4 + 2 * 2); // field index 2
console.log(`shape field offset in table: ${shapeFieldOff}`);
if (shapeFieldOff) {
  const shapeRefOff = t0AbsOff + shapeFieldOff;  // position in table where offset lives
  const shapeRelOff = safe_readI32(shapeRefOff);  // relative offset to vector
  const shapeVecAbs = shapeRefOff + shapeRelOff;  // absolute vector position
  console.log(`  shapeRefOff=0x${shapeRefOff.toString(16)}`);
  console.log(`  shapeRelOff=${shapeRelOff} (0x${shapeRelOff.toString(16)})`);
  console.log(`  shapeVecAbs=0x${shapeVecAbs.toString(16)}`);
  const count = safe_readU32(shapeVecAbs);
  console.log(`  count=${count}`);
  if (count <= 8) {
    const shape = [];
    for (let i = 0; i < count; i++) {
      shape.push(safe_readI32(shapeVecAbs + 4 + i * 4));
    }
    console.log(`  shape=[${shape}]`);
  } else {
    // Try i32 count
    const count32 = safe_readI32(shapeVecAbs);
    console.log(`  count as i32=${count32}`);
    // Show raw bytes around vector
    console.log('  Raw bytes at shapeVecAbs:');
    for (let i = 0; i < 24; i += 4) {
      const v = safe_readI32(shapeVecAbs + i);
      console.log(`    [+${i}] ${v}`);
    }
  }
}

// Also look at the known-good location of the shape from our earlier binary analysis
// Earlier we found shape [1, 224, 224, 3] at offset 0x1fe4fc
const shapeHintOff = 0x1fe4fc;
console.log(`\n--- Shape data near 0x1fe4fc (from earlier binary analysis) ---`);
const count = safe_readU32(shapeHintOff - 4);
console.log(`Count at 0x${(shapeHintOff-4).toString(16)}: ${count}`);
for (let i = 0; i < 4; i++) {
  console.log(`  [${i}] = ${safe_readI32(shapeHintOff + i * 4)}`);
}

// Figure out where tensor 0 table ends and what follows it
console.log(`\n--- Context around tensor 0 (0x${t0AbsOff.toString(16)}) ---`);
for (let i = -8; i <= 48; i += 4) {
  const off = t0AbsOff + i;
  const v = safe_readI32(off);
  console.log(`  [${i >= 0 ? '+' : ''}${i}] 0x${off.toString(16)} = ${v}`);
}
