'use strict';
const fs = require('fs');
const path = require('path');
const buf = fs.readFileSync(path.join(__dirname, '..', 'models', 'teachable_machine', 'model_unquant.tflite'));

function i32(off) { return buf.readInt32LE(off); }
function u32(off) { return buf.readUInt32LE(off); }

// Check 0x1fe53c
const off = 0x1fe53c;
console.log(`At 0x${off.toString(16)}:  ${i32(off)}, ${i32(off+4)}, ${i32(off+8)}, ${i32(off+12)}`);

// The actual shape [1,224,224,3] is at 0x1fe4fc
// Let's check the byte before it
const shapeVec = 0x1fe4fc;
console.log(`\nAt 0x${shapeVec.toString(16)} (shape vector start):`);
console.log(`  count=${u32(shapeVec)}: [${i32(shapeVec+4)}, ${i32(shapeVec+8)}, ${i32(shapeVec+12)}, ${i32(shapeVec+16)}]`);

// Now let's find what field offset leads to shapeVec=0x1fe4fc
// tAbsOff = 0x1fe4e4
// shapeVec - shapeFieldAddr = relOff
// shapeFieldAddr = tAbsOff + fieldOff = 0x1fe4e4 + fieldOff
// relOff = shapeVec - shapeFieldAddr = 0x1fe4fc - (0x1fe4e4 + fieldOff) = 24 - fieldOff
// For fieldOff=8: relOff = 24 - 8 = 16? But stored value at +8 is 1.
// For fieldOff=4: relOff = 24 - 4 = 20? Value at +4 is 20! YES!

console.log('\n--- Testing field 0 (offset=4) as shape field ---');
const t0AbsOff = 0x1fe4e4;
const candidateFieldOff = 4;
const candidateFieldAddr = t0AbsOff + candidateFieldOff; // 0x1fe4e8
const candidateRelOff = i32(candidateFieldAddr); // value at +4 = 20
const candidateVecAbs = candidateFieldAddr + candidateRelOff; // 0x1fe4e8 + 20 = 0x1fe4fc
console.log(`  fieldAddr=0x${candidateFieldAddr.toString(16)}, relOff=${candidateRelOff}, vecAbs=0x${candidateVecAbs.toString(16)}`);
console.log(`  count=${u32(candidateVecAbs)}: [${i32(candidateVecAbs+4)}, ${i32(candidateVecAbs+8)}, ${i32(candidateVecAbs+12)}, ${i32(candidateVecAbs+16)}]`);

// So field[0] with vtable offset=4 leads to the shape!
// But the vtable says field[0] is the NAME field...

// Let me re-read the vtable more carefully
// vtable at 0x1fe4d0
// vtSz=20 means 20 bytes = 5 uint16 entries before the data offsets
// No wait: vtSz includes the vtable header (4 bytes: vtSz + objSz) plus 2 bytes per field
// vtSz=20 → (20-4)/2 = 8 field slots
// [0]=4, [1]=0, [2]=8, [3]=12, [4]=16, [5]=0, [6]=0, [7]=20

const vtAbs = 0x1fe4d0;
console.log('\n--- VTable dump ---');
const vtSz = buf.readUInt16LE(vtAbs);  // first uint16 = vtable size in bytes
const objSz = buf.readUInt16LE(vtAbs + 2); // second uint16 = object size
console.log(`vtSz=${vtSz}, objSz=${objSz}`);
const numFields = (vtSz - 4) / 2;
for (let fi = 0; fi < numFields; fi++) {
  const fo = buf.readUInt16LE(vtAbs + 4 + fi * 2);
  console.log(`  field[${fi}] vtable_offset=${fo}`);
}

// FlatBuffers Tensor schema field order (from schema.fbs):
// 0: name (string)
// 1: type (TensorType = int8 enum, but stored as int32? No, as int8!)
// 2: shape ([int])
// 3: buffer (uint32)
// 4: quantization (QuantizationParameters)
// 5: is_variable (bool)
// 6: sparsity
// 7: shape_signature ([int])

// field[1] has vtable_offset=0 → absent (no type field for this tensor)
// This means tensor 0 has no explicit type → default is FLOAT32 (0)

// field[0] has vtable_offset=4 → "name" field is at table+4, value=20 → name string offset
// Wait but i showed field[0] leads to count=4 / shape=[1,224,224,3]

// Let me check: name string at tAbsOff+4 = 0x1fe4e8, value=20, string at 0x1fe4e8+20=0x1fe4fc
// 0x1fe4fc: count=4, then bytes: these should be the string length + chars
// But i32(0x1fe4fc)=4 then [1, 224, 224, 3]
// If it's a name string: length=4, content = bytes [1, 224, 224, 3] = non-printable
// That doesn't make sense as a name.

// Maybe field[0] is NOT the name... Let me look at what's ACTUALLY at field[7]
// field[7] vtable_offset=20 → value at tAbsOff+20 = 0x1fe4f8 = 68
// 68 as relative offset: points to 0x1fe4f8+68=0x1fe53c
const f7addr = t0AbsOff + 20; // 0x1fe4f8
const f7rel = i32(f7addr);
const f7vec = f7addr + f7rel;
console.log(`\nfield[7] at 0x${f7addr.toString(16)}, relOff=${f7rel}, vecAbs=0x${f7vec.toString(16)}`);
console.log(`  count=${u32(f7vec)}: [${i32(f7vec+4)}, ${i32(f7vec+8)}, ${i32(f7vec+12)}, ${i32(f7vec+16)}]`);

// Let me also check field[2] with vtable_offset=8
const f2addr = t0AbsOff + 8; // 0x1fe4ec
const f2rel = i32(f2addr); // = 1
console.log(`\nfield[2] at 0x${f2addr.toString(16)}, relOff=${f2rel}, vecAbs=0x${(f2addr+f2rel).toString(16)}`);
// 0x1fe4ed is misaligned, but let's see if there's a shape there
console.log(`  u32 at 0x${(f2addr+f2rel).toString(16)}: ${u32(f2addr+f2rel)}`);
// Try reading as u32 with different alignment
console.log(`  bytes: ${buf[f2addr+f2rel]}, ${buf[f2addr+f2rel+1]}, ${buf[f2addr+f2rel+2]}, ${buf[f2addr+f2rel+3]}`);

// Check the object size to understand table layout
console.log(`\nObject size from vtable: ${objSz} bytes (table from +0 to +${objSz-1})`);

// Dump all fields systematically
console.log('\n--- All field values (tAbsOff-relative) ---');
for (let fi = 0; fi < 8; fi++) {
  const fo = buf.readUInt16LE(vtAbs + 4 + fi * 2);
  if (fo === 0) { console.log(`  field[${fi}] ABSENT`); continue; }
  const addr = t0AbsOff + fo;
  const val32 = i32(addr);
  const val8  = buf[addr];
  // If it's a reference (string/vector/table), follow it
  const derefAbs = addr + val32;
  const derefCount = u32(derefAbs);
  console.log(`  field[${fi}] fo=${fo} addr=0x${addr.toString(16)} val32=${val32} → deref=0x${derefAbs.toString(16)} count/val=${derefCount}`);
}
