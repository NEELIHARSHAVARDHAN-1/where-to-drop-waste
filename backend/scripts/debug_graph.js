/**
 * Debugging script — trace the graph execution to find why tensor 180 is not produced.
 */

'use strict';

const path = require('path');
const fs = require('fs');

const backendRoot = path.resolve(__dirname, '..');
const MODEL_PATH = path.join(backendRoot, 'models', 'teachable_machine', 'model_unquant.tflite');

// Re-import the parser from the main service
// We need to expose the parseTFLiteWeights function temporarily
const buf = fs.readFileSync(MODEL_PATH);

// ── Inline parser (same as tensorflowLiteService.js) ─────────────────────────
function parseTFLiteWeights(fileBuffer) {
  const buf = fileBuffer;

  function safe_readI32(off) {
    if (off < 0 || off + 4 > buf.length) return 0;
    return buf.readInt32LE(off);
  }
  function safe_readU32(off) {
    if (off < 0 || off + 4 > buf.length) return 0;
    return buf.readUInt32LE(off);
  }
  function safe_readF32(off) {
    if (off < 0 || off + 4 > buf.length) return 0;
    return buf.readFloatLE(off);
  }

  function makeVTable(tableAbsOff) {
    const vtRel = safe_readI32(tableAbsOff);
    const vtAbs = tableAbsOff - vtRel;
    const vtSz  = safe_readU32(vtAbs) & 0xFFFF;
    return function getField(fieldIndex) {
      const byteOff = 4 + fieldIndex * 2;
      if (byteOff + 2 > vtSz) return 0;
      if (vtAbs + byteOff + 2 > buf.length) return 0;
      return buf.readUInt16LE(vtAbs + byteOff);
    };
  }

  function readIntVector(refAbsOff) {
    const relOff = safe_readI32(refAbsOff);
    const vecAbsOff = refAbsOff + relOff;
    const count = safe_readU32(vecAbsOff);
    if (count > 10000) return [];
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push(safe_readI32(vecAbsOff + 4 + i * 4));
    }
    return arr;
  }

  function readString(refAbsOff) {
    const relOff = safe_readI32(refAbsOff);
    const strAbsOff = refAbsOff + relOff;
    const len = safe_readU32(strAbsOff);
    if (len > 10000 || strAbsOff + 4 + len > buf.length) return '';
    return buf.slice(strAbsOff + 4, strAbsOff + 4 + len).toString('utf8');
  }

  const rootAbsOff = safe_readU32(0);
  const modelGF    = makeVTable(rootAbsOff);

  const opCodesFieldOff = modelGF(1);
  const opCodes = [];
  if (opCodesFieldOff) {
    const ocRefAbs = rootAbsOff + opCodesFieldOff;
    const ocRelOff = safe_readI32(ocRefAbs);
    const ocVecAbs = ocRefAbs + ocRelOff;
    const ocCount  = safe_readU32(ocVecAbs);
    for (let i = 0; i < ocCount; i++) {
      const entryRelOff = safe_readI32(ocVecAbs + 4 + i * 4);
      const entryAbsOff = ocVecAbs + 4 + i * 4 + entryRelOff;
      const ocGF = makeVTable(entryAbsOff);

      let builtinCode = 0;
      const bcOff = ocGF(0);
      if (bcOff && entryAbsOff + bcOff < buf.length) {
        builtinCode = buf.readInt8(entryAbsOff + bcOff);
      }
      const extOff = ocGF(4);
      if (extOff) {
        const extVal = safe_readI32(entryAbsOff + extOff);
        if (extVal > 0) builtinCode = extVal;
      }

      opCodes.push(builtinCode);
    }
  }

  const sgFieldOff = modelGF(2);
  if (!sgFieldOff) throw new Error('No subgraphs');

  const sgRefAbs  = rootAbsOff + sgFieldOff;
  const sgVecAbs  = sgRefAbs + safe_readI32(sgRefAbs);
  const sg0RelOff = safe_readI32(sgVecAbs + 4);
  const sg0AbsOff = sgVecAbs + 4 + sg0RelOff;
  const sgGF      = makeVTable(sg0AbsOff);

  const tensorsFieldOff = sgGF(0);
  const tensors = [];
  if (tensorsFieldOff) {
    const tvRefAbs = sg0AbsOff + tensorsFieldOff;
    const tvRelOff = safe_readI32(tvRefAbs);
    const tvVecAbs = tvRefAbs + tvRelOff;
    const tvCount  = safe_readU32(tvVecAbs);
    for (let ti = 0; ti < tvCount; ti++) {
      const tRelOff = safe_readI32(tvVecAbs + 4 + ti * 4);
      const tAbsOff = tvVecAbs + 4 + ti * 4 + tRelOff;
      const tGF     = makeVTable(tAbsOff);

      let name = null;
      const nameOff = tGF(0);
      if (nameOff) { try { name = readString(tAbsOff + nameOff); } catch (e) {} }

      let tensorType = 0;
      const typeOff = tGF(1);
      if (typeOff) tensorType = safe_readI32(tAbsOff + typeOff);

      let shape = null;
      const shapeOff = tGF(2);
      if (shapeOff) { try { shape = readIntVector(tAbsOff + shapeOff); } catch (e) {} }

      let bufferIndex = 0;
      const biOff = tGF(3);
      if (biOff) bufferIndex = safe_readU32(tAbsOff + biOff);

      tensors.push({ name, type: tensorType, shape, bufferIndex });
    }
  }

  const inputsFieldOff  = sgGF(1);
  const outputsFieldOff = sgGF(2);
  const inputs  = inputsFieldOff  ? readIntVector(sg0AbsOff + inputsFieldOff)  : [];
  const outputs = outputsFieldOff ? readIntVector(sg0AbsOff + outputsFieldOff) : [];

  const opsFieldOff = sgGF(3);
  const operators = [];
  if (opsFieldOff) {
    const opRefAbs = sg0AbsOff + opsFieldOff;
    const opRelOff = safe_readI32(opRefAbs);
    const opVecAbs = opRefAbs + opRelOff;
    const opCount  = safe_readU32(opVecAbs);
    for (let oi = 0; oi < opCount; oi++) {
      const opEntryRel = safe_readI32(opVecAbs + 4 + oi * 4);
      const opEntryAbs = opVecAbs + 4 + oi * 4 + opEntryRel;
      const opGF       = makeVTable(opEntryAbs);

      const ociOff = opGF(0);
      const opcodeIndex = ociOff ? safe_readI32(opEntryAbs + ociOff) : 0;

      const inOff  = opGF(1);
      const opInputs  = inOff  ? readIntVector(opEntryAbs + inOff)  : [];

      const outOff = opGF(2);
      const opOutputs = outOff ? readIntVector(opEntryAbs + outOff) : [];

      operators.push({ opcodeIndex, inputs: opInputs, outputs: opOutputs });
    }
  }

  const bufsFieldOff = modelGF(3);
  const bufferDatas = [];
  if (bufsFieldOff) {
    const bvRefAbs = rootAbsOff + bufsFieldOff;
    const bvRelOff = safe_readI32(bvRefAbs);
    const bvVecAbs = bvRefAbs + bvRelOff;
    const bvCount  = safe_readU32(bvVecAbs);
    for (let bi = 0; bi < bvCount; bi++) {
      const bEntryRel = safe_readI32(bvVecAbs + 4 + bi * 4);
      const bEntryAbs = bvVecAbs + 4 + bi * 4 + bEntryRel;
      const bGF       = makeVTable(bEntryAbs);
      const dataOff   = bGF(0);
      let data        = null;
      if (dataOff) {
        try {
          const dataRefAbs = bEntryAbs + dataOff;
          const dataRelOff = safe_readI32(dataRefAbs);
          const dataVecAbs = dataRefAbs + dataRelOff;
          const dataCount  = safe_readU32(dataVecAbs);
          if (dataCount > 0 && dataVecAbs + 4 + dataCount <= buf.length) {
            data = buf.slice(dataVecAbs + 4, dataVecAbs + 4 + dataCount);
          }
        } catch (e) {}
      }
      bufferDatas.push(data);
    }
  }

  return { opCodes, tensors, inputs, outputs, operators, buffers: bufferDatas };
}

// ── Run analysis ──────────────────────────────────────────────────────────────
console.log('=== TFLite Graph Analysis ===\n');

const parsed = parseTFLiteWeights(buf);
const { opCodes, tensors, inputs, outputs, operators, buffers } = parsed;

console.log(`Total tensors:   ${tensors.length}`);
console.log(`Total operators: ${operators.length}`);
console.log(`Total buffers:   ${buffers.length}`);
console.log(`Graph inputs:    [${inputs}]`);
console.log(`Graph outputs:   [${outputs}]`);
console.log(`Unique op codes: ${[...new Set(operators.map(o => opCodes[o.opcodeIndex]))].sort((a,b)=>a-b).join(', ')}`);

console.log('\n=== All Operator Codes ===');
const codeNames = {
  0: 'ADD', 1: 'AVG_POOL_2D', 2: 'CONCAT', 3: 'CONV_2D', 4: 'DEPTHWISE_CONV',
  9: 'FULLY_CONNECTED', 14: 'LOGISTIC', 17: 'MAX_POOL', 18: 'MUL', 19: 'RELU',
  21: 'RELU6', 22: 'RESHAPE', 25: 'SOFTMAX', 40: 'MEAN', 56: 'MUL_56',
  84: 'SOFTMAX_84', 114: 'MEAN_114'
};
const opFreq = {};
operators.forEach(op => {
  const code = opCodes[op.opcodeIndex];
  opFreq[code] = (opFreq[code] || 0) + 1;
});
console.log('Op code frequencies:');
Object.entries(opFreq).sort(([a],[b]) => +a - +b).forEach(([code, count]) => {
  console.log(`  code ${code} (${codeNames[code] || 'UNKNOWN'}): ${count}x`);
});

console.log('\n=== Last 10 operators (approaching output) ===');
operators.slice(-10).forEach((op, i) => {
  const idx = operators.length - 10 + i;
  const code = opCodes[op.opcodeIndex];
  console.log(`  op[${idx}] code=${code} (${codeNames[code] || '?'}) in=[${op.inputs}] → out=[${op.outputs}]`);
});

console.log('\n=== First 3 operators ===');
operators.slice(0, 3).forEach((op, i) => {
  const code = opCodes[op.opcodeIndex];
  console.log(`  op[${i}] code=${code} (${codeNames[code] || '?'}) in=[${op.inputs}] → out=[${op.outputs}]`);
});

console.log('\n=== Output tensor ===');
const outIdx = outputs[0];
const outTensor = tensors[outIdx];
console.log(`  index: ${outIdx}, name: ${outTensor?.name}, shape: [${outTensor?.shape}]`);

// Find which op produces the output tensor
const producerOp = operators.findIndex(op => op.outputs.includes(outIdx));
console.log(`  produced by op[${producerOp}]`);

if (producerOp >= 0) {
  const op = operators[producerOp];
  const code = opCodes[op.opcodeIndex];
  console.log(`  op code: ${code} (${codeNames[code] || 'UNKNOWN'})`);
  console.log(`  op inputs: [${op.inputs}]`);
}

// Check for -1 inputs (optional tensors) in operators
const opsWithNegInputs = operators.filter(op => op.inputs.some(i => i < 0));
console.log(`\nOps with -1 (optional) inputs: ${opsWithNegInputs.length}`);

// Count how many ops have all their inputs from constants (no dynamic deps)
console.log('\n=== Input tensor ===');
const inIdx = inputs[0];
const inTensor = tensors[inIdx];
console.log(`  index: ${inIdx}, name: ${inTensor?.name}, shape: [${inTensor?.shape}]`);
