/**
 * Deep analysis — identify op code 34 and trace the full execution path.
 */

'use strict';

const path = require('path');
const fs = require('fs');

const backendRoot = path.resolve(__dirname, '..');
const MODEL_PATH = path.join(backendRoot, 'models', 'teachable_machine', 'model_unquant.tflite');
const buf = fs.readFileSync(MODEL_PATH);

function safe_readI32(off) {
  if (off < 0 || off + 4 > buf.length) return 0;
  return buf.readInt32LE(off);
}
function safe_readU32(off) {
  if (off < 0 || off + 4 > buf.length) return 0;
  return buf.readUInt32LE(off);
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

// ── TFLite BuiltinOperator enum (from schema_generated.h) ────────────────────
// https://github.com/tensorflow/tensorflow/blob/master/tensorflow/lite/schema/schema.fbs
const BUILTIN_OP = {
  0: 'ADD',
  1: 'AVERAGE_POOL_2D',
  2: 'CONCATENATION',
  3: 'CONV_2D',
  4: 'DEPTHWISE_CONV_2D',
  5: 'DEQUANTIZE',
  6: 'EMBEDDING_LOOKUP',
  7: 'FLOOR',
  8: 'FULLY_CONNECTED (old=8)',
  9: 'FULLY_CONNECTED',
  10: 'HASHTABLE_LOOKUP',
  11: 'L2_NORMALIZATION',
  12: 'L2_POOL_2D',
  13: 'LOCAL_RESPONSE_NORMALIZATION',
  14: 'LOGISTIC',
  15: 'LSH_PROJECTION',
  16: 'LSTM',
  17: 'MAX_POOL_2D',
  18: 'MUL',
  19: 'RELU',
  20: 'RELU_N1_TO_1',
  21: 'RELU6',
  22: 'RESHAPE',
  23: 'RESIZE_BILINEAR',
  24: 'RNN',
  25: 'SOFTMAX',
  26: 'SPACE_TO_DEPTH',
  27: 'SVDF',
  28: 'TANH',
  29: 'CONCAT_EMBEDDINGS',
  30: 'SKIP_GRAM',
  31: 'CALL',
  32: 'CUSTOM',
  33: 'EMBEDDING_LOOKUP_SPARSE',
  34: 'PAD',                  // ← THIS ONE
  35: 'UNIDIRECTIONAL_SEQUENCE_RNN',
  36: 'GATHER',
  37: 'BATCH_TO_SPACE_ND',
  38: 'SPACE_TO_BATCH_ND',
  39: 'TRANSPOSE',
  40: 'MEAN',
  41: 'SUB',
  42: 'DIV',
  43: 'SQUEEZE',
  44: 'UNIDIRECTIONAL_SEQUENCE_LSTM',
  45: 'STRIDED_SLICE',
  46: 'BIDIRECTIONAL_SEQUENCE_RNN',
  47: 'EXP',
  48: 'TOPK_V2',
  49: 'SPLIT',
  50: 'LOG_SOFTMAX',
  51: 'DELEGATE',
  52: 'BIDIRECTIONAL_SEQUENCE_LSTM',
  53: 'CAST',
  54: 'PRELU',
  55: 'MAXIMUM',
  56: 'ARG_MAX',
  57: 'MINIMUM',
  58: 'LESS',
  59: 'NEG',
  60: 'PADV2',
  61: 'GREATER',
  62: 'GREATER_EQUAL',
  63: 'LESS_EQUAL',
  64: 'SELECT',
  65: 'SLICE',
  66: 'SIN',
  67: 'TRANSPOSE_CONV',
  68: 'SPARSE_TO_DENSE',
  69: 'TILE',
  70: 'EXPAND_DIMS',
  71: 'EQUAL',
  72: 'NOT_EQUAL',
  73: 'LOG',
  74: 'SUM',
  75: 'SQRT',
  76: 'RSQRT',
  77: 'SHAPE',
  78: 'POW',
  79: 'ARG_MIN',
  80: 'FAKE_QUANT',
  81: 'REDUCE_PROD',
  82: 'REDUCE_MAX',
  83: 'PACK',
  84: 'LOGICAL_OR',
  85: 'ONE_HOT',
  86: 'LOGICAL_AND',
  87: 'LOGICAL_NOT',
  88: 'UNPACK',
  89: 'REDUCE_MIN',
  90: 'FLOOR_DIV',
  91: 'REDUCE_ANY',
  92: 'SQUARE',
  93: 'ZEROS_LIKE',
  94: 'FILL',
  95: 'FLOOR_MOD',
  96: 'RANGE',
  97: 'RESIZE_NEAREST_NEIGHBOR',
  98: 'LEAKY_RELU',
  99: 'SQUARED_DIFFERENCE',
  100: 'MIRROR_PAD',
  101: 'ABS',
  102: 'SPLIT_V',
  103: 'UNIQUE',
  104: 'CEIL',
  105: 'REVERSE_V2',
  106: 'ADD_N',
  107: 'GATHER_ND',
  108: 'COS',
  109: 'WHERE',
  110: 'RANK',
  111: 'ELU',
  112: 'REVERSE_SEQUENCE',
  113: 'MATRIX_DIAG',
  114: 'QUANTIZE',
  115: 'MATRIX_SET_DIAG',
};

// ── Re-parse with proper op names ─────────────────────────────────────────────
const rootAbsOff = safe_readU32(0);
const modelGF    = makeVTable(rootAbsOff);

// Op codes
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

console.log('Op codes in use:', opCodes.map((c, i) => `${i}:${c}(${BUILTIN_OP[c] || '?'})`).join(', '));

// Subgraph
const sgFieldOff = modelGF(2);
const sgRefAbs  = rootAbsOff + sgFieldOff;
const sgVecAbs  = sgRefAbs + safe_readI32(sgRefAbs);
const sg0RelOff = safe_readI32(sgVecAbs + 4);
const sg0AbsOff = sgVecAbs + 4 + sg0RelOff;
const sgGF      = makeVTable(sg0AbsOff);

// All operators
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

console.log('\n=== All PAD operators (code 34) ===');
operators.forEach((op, i) => {
  if (opCodes[op.opcodeIndex] === 34) {
    console.log(`  op[${i}] PAD: in=[${op.inputs}] → out=[${op.outputs}]`);
  }
});

// Tensor shapes — need to look at a few key tensors
// Let's check tensors 0 (input), 2 (MEAN axes), 110 (output of first op), 177-180
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

    let name = '';
    const nameOff = tGF(0);
    if (nameOff) {
      try {
        const relOff = safe_readI32(tAbsOff + nameOff);
        const strAbsOff = tAbsOff + nameOff + relOff;
        const len = safe_readU32(strAbsOff);
        if (len > 0 && len < 200 && strAbsOff + 4 + len <= buf.length) {
          name = buf.slice(strAbsOff + 4, strAbsOff + 4 + len).toString('utf8');
        }
      } catch (e) {}
    }

    let shape = null;
    const shapeOff = tGF(2);
    if (shapeOff) {
      try {
        const relOff = safe_readI32(tAbsOff + shapeOff);
        const vecAbsOff = tAbsOff + shapeOff + relOff;
        const count = safe_readU32(vecAbsOff);
        if (count <= 8) {
          shape = [];
          for (let i = 0; i < count; i++) {
            shape.push(safe_readI32(vecAbsOff + 4 + i * 4));
          }
        }
      } catch (e) {}
    }

    let bufferIndex = 0;
    const biOff = tGF(3);
    if (biOff) bufferIndex = safe_readU32(tAbsOff + biOff);

    tensors.push({ name, shape, bufferIndex });
  }
}

const keyTensors = [0, 1, 2, 3, 110, 176, 177, 178, 179, 180];
console.log('\n=== Key tensor shapes ===');
keyTensors.forEach(i => {
  const t = tensors[i];
  if (t) {
    const bufData = /* placeholder */ null;
    console.log(`  tensor[${i}] name="${t.name}" shape=[${t.shape}] bufIdx=${t.bufferIndex}`);
  }
});
