/**
 * TFLite FlatBuffer Parser
 *
 * Reads the binary TFLite flatbuffer format to extract:
 *   - Model metadata (version, description)
 *   - Subgraph structure
 *   - Tensor shapes and types
 *   - Operator types
 *   - Raw weight buffers
 *
 * TFLite FlatBuffer schema reference:
 *   https://github.com/tensorflow/tensorflow/blob/master/tensorflow/lite/schema/schema.fbs
 *
 * TFLite tensor types (TensorType enum):
 *   0 = FLOAT32
 *   1 = FLOAT16
 *   2 = INT32
 *   3 = UINT8
 *   4 = INT64
 *   5 = STRING
 *   6 = BOOL
 *   7 = INT16
 *   8 = COMPLEX64
 *   9 = INT8
 *  10 = FLOAT64
 *
 * TFLite built-in operator codes (BuiltinOperator enum) — partial list:
 *   0  = ADD
 *   3  = CONV_2D
 *   4  = DEPTHWISE_CONV_2D
 *   9  = FULLY_CONNECTED
 *   14 = LOGISTIC
 *   22 = RELU
 *   21 = RELU6
 *   25 = RESHAPE
 *   84 = SOFTMAX
 *   ...
 */

'use strict';

const TENSOR_TYPES = {
  0: 'FLOAT32',
  1: 'FLOAT16',
  2: 'INT32',
  3: 'UINT8',
  4: 'INT64',
  5: 'STRING',
  6: 'BOOL',
  7: 'INT16',
  8: 'COMPLEX64',
  9: 'INT8',
  10: 'FLOAT64',
};

const BUILTIN_OPS = {
  0: 'ADD',
  3: 'CONV_2D',
  4: 'DEPTHWISE_CONV_2D',
  9: 'FULLY_CONNECTED',
  14: 'LOGISTIC',
  21: 'RELU6',
  22: 'RELU',
  25: 'RESHAPE',
  46: 'AVERAGE_POOL_2D',
  56: 'MUL',
  84: 'SOFTMAX',
  85: 'SPACE_TO_DEPTH',
  86: 'TRANSPOSE_CONV',
  96: 'BATCH_NORM',
  114: 'MEAN',
};

/**
 * Read a FlatBuffer scalar or offset at a given position.
 */
function readI32(buf, offset) {
  return buf.readInt32LE(offset);
}
function readU32(buf, offset) {
  return buf.readUInt32LE(offset);
}

/**
 * Follow a FlatBuffer offset field from a table position.
 * FlatBuffer tables: at `tablePos`, read vtable offset, then from vtable
 * find the field's relative offset in the table data.
 *
 * For simplicity, since we know the TFLite schema, we use
 * direct offset arithmetic rather than full vtable traversal.
 */
function followOffset(buf, currentPos) {
  const rel = buf.readInt32LE(currentPos);
  return currentPos + rel;
}

/**
 * Read a FlatBuffer string at a given absolute offset.
 * FlatBuffer string: int32 length followed by UTF-8 bytes.
 */
function readFBString(buf, absoluteOffset) {
  const len = readU32(buf, absoluteOffset);
  return buf.slice(absoluteOffset + 4, absoluteOffset + 4 + len).toString('utf8');
}

/**
 * Read a FlatBuffer vector at a given absolute offset.
 * Returns {count, dataStart} where dataStart is the offset of the first element.
 */
function readFBVector(buf, absoluteOffset) {
  const count = readU32(buf, absoluteOffset);
  return { count, dataStart: absoluteOffset + 4 };
}

/**
 * Parse a Tensor table from the FlatBuffer.
 * TFLite Tensor table fields (in vtable order):
 *   [4]  name   (string offset)
 *   [6]  type   (TensorType, int32 inline)
 *   [8]  shape  (vector<int32>)
 *  [10]  buffer (uint32 inline — index into buffers)
 *  [12]  quantization (QuantizationParameters offset, optional)
 *
 * Because vtable layouts can vary by flatc version, we use a targeted search.
 */
function parseTensorFromBuffer(buf, tensorAbsOffset) {
  // Read vtable
  const vtableRelOff = readI32(buf, tensorAbsOffset);
  const vtableAbsOff = tensorAbsOffset - vtableRelOff;
  const vtableBytes = readU32(buf, vtableAbsOff);       // vtable size in bytes
  const dataBytes = readU32(buf, vtableAbsOff + 4);      // object size in bytes

  function getField(fieldIdx) {
    const vtableFieldOffset = 4 + fieldIdx * 2;         // 4 = sizeof(uint32)*2 header
    if (vtableFieldOffset + 2 > vtableBytes) return 0;
    return buf.readUInt16LE(vtableAbsOff + vtableFieldOffset);
  }

  const result = {
    name: null,
    type: null,
    typeName: null,
    shape: null,
    bufferIndex: 0,
    quantization: null,
  };

  // Field 0 (vtable index 0): name
  const nameOff = getField(0);
  if (nameOff) {
    const nameAbsOff = tensorAbsOffset + nameOff;
    const nameRelOff = readI32(buf, nameAbsOff);
    result.name = readFBString(buf, nameAbsOff + nameRelOff);
  }

  // Field 1 (vtable index 1): type (enum inline int32)
  const typeOff = getField(1);
  if (typeOff) {
    result.type = readI32(buf, tensorAbsOffset + typeOff);
    result.typeName = TENSOR_TYPES[result.type] || `UNKNOWN(${result.type})`;
  }

  // Field 2 (vtable index 2): shape vector
  const shapeOff = getField(2);
  if (shapeOff) {
    const shapeAbsOff = tensorAbsOffset + shapeOff;
    const shapeVecAbsOff = shapeAbsOff + readI32(buf, shapeAbsOff);
    const { count, dataStart } = readFBVector(buf, shapeVecAbsOff);
    result.shape = [];
    for (let i = 0; i < count; i++) {
      result.shape.push(readI32(buf, dataStart + i * 4));
    }
  }

  // Field 3 (vtable index 3): buffer index
  const bufOff = getField(3);
  if (bufOff) {
    result.bufferIndex = readU32(buf, tensorAbsOffset + bufOff);
  }

  // Field 4 (vtable index 4): quantization
  const quantOff = getField(4);
  if (quantOff) {
    try {
      const quantAbsOff = tensorAbsOffset + quantOff;
      const quantTableAbsOff = quantAbsOff + readI32(buf, quantAbsOff);
      const qvtableRelOff = readI32(buf, quantTableAbsOff);
      const qvtableAbsOff = quantTableAbsOff - qvtableRelOff;
      const qvtableBytes = readU32(buf, qvtableAbsOff);

      function getQField(fi) {
        const off2 = 4 + fi * 2;
        if (off2 + 2 > qvtableBytes) return 0;
        return buf.readUInt16LE(qvtableAbsOff + off2);
      }

      const quant = {};
      // scale vector
      const scaleOff = getQField(0);
      if (scaleOff) {
        const svAbsOff = quantTableAbsOff + scaleOff;
        const svVecAbsOff = svAbsOff + readI32(buf, svAbsOff);
        const { count: sc, dataStart: sd } = readFBVector(buf, svVecAbsOff);
        quant.scale = [];
        for (let i = 0; i < sc; i++) quant.scale.push(buf.readFloatLE(sd + i * 4));
      }
      // zero_point vector
      const zpOff = getQField(1);
      if (zpOff) {
        const zvAbsOff = quantTableAbsOff + zpOff;
        const zvVecAbsOff = zvAbsOff + readI32(buf, zvAbsOff);
        const { count: zc, dataStart: zd } = readFBVector(buf, zvVecAbsOff);
        quant.zero_point = [];
        for (let i = 0; i < zc; i++) quant.zero_point.push(readI32(buf, zd + i * 4));
      }
      if (Object.keys(quant).length > 0) result.quantization = quant;
    } catch (e) { /* quantization parse error is non-fatal */ }
  }

  return result;
}

/**
 * Parse an Operator table.
 * Fields: opcode_index, inputs (vector), outputs (vector), builtin_options, custom_options
 */
function parseOperator(buf, opAbsOffset) {
  const vtableRelOff = readI32(buf, opAbsOffset);
  const vtableAbsOff = opAbsOffset - vtableRelOff;
  const vtableBytes = readU32(buf, vtableAbsOff);

  function getField(fi) {
    const o = 4 + fi * 2;
    if (o + 2 > vtableBytes) return 0;
    return buf.readUInt16LE(vtableAbsOff + o);
  }

  const op = { opcodeIndex: 0, inputs: [], outputs: [] };

  // opcode_index (field 0)
  const ociOff = getField(0);
  if (ociOff) op.opcodeIndex = readI32(buf, opAbsOffset + ociOff);

  // inputs (field 1)
  const inOff = getField(1);
  if (inOff) {
    const inAbsOff = opAbsOffset + inOff;
    const inVecOff = inAbsOff + readI32(buf, inAbsOff);
    const { count: ic, dataStart: id } = readFBVector(buf, inVecOff);
    for (let i = 0; i < ic; i++) op.inputs.push(readI32(buf, id + i * 4));
  }

  // outputs (field 2)
  const outOff = getField(2);
  if (outOff) {
    const outAbsOff = opAbsOffset + outOff;
    const outVecOff = outAbsOff + readI32(buf, outAbsOff);
    const { count: oc, dataStart: od } = readFBVector(buf, outVecOff);
    for (let i = 0; i < oc; i++) op.outputs.push(readI32(buf, od + i * 4));
  }

  return op;
}

/**
 * Main entry point: parse the entire TFLite model.
 * Returns a structured model description.
 */
function parseTFLiteModel(fileBuffer) {
  const buf = fileBuffer;

  // Verify TFLite identifier
  const ident = buf.slice(4, 8).toString('ascii');
  if (ident !== 'TFL3') {
    throw new Error(`Not a valid TFLite file. Expected identifier 'TFL3', got '${ident}'`);
  }

  // Root table offset (first 4 bytes = LE uint32)
  const rootAbsOff = readU32(buf, 0);
  const modelAbsOff = rootAbsOff; // root IS the Model table

  // Model table vtable
  const vtableRelOff = readI32(buf, modelAbsOff);
  const vtableAbsOff = modelAbsOff - vtableRelOff;
  const vtableBytes = readU32(buf, vtableAbsOff);

  function getModelField(fi) {
    const o = 4 + fi * 2;
    if (o + 2 > vtableBytes) return 0;
    return buf.readUInt16LE(vtableAbsOff + o);
  }

  // ── version (field 0) ──────────────────────────────────────────────────
  let version = 0;
  const verOff = getModelField(0);
  if (verOff) version = readI32(buf, modelAbsOff + verOff);

  // ── operator_codes (field 1) ────────────────────────────────────────────
  const opCodesOff = getModelField(1);
  const operatorCodes = [];
  if (opCodesOff) {
    const oc = modelAbsOff + opCodesOff;
    const ocVecOff = oc + readI32(buf, oc);
    const { count, dataStart } = readFBVector(buf, ocVecOff);
    for (let i = 0; i < count; i++) {
      const entryRelOff = readI32(buf, dataStart + i * 4);
      const entryAbsOff = dataStart + i * 4 + entryRelOff;
      // OperatorCode vtable
      const evtRelOff = readI32(buf, entryAbsOff);
      const evtAbsOff = entryAbsOff - evtRelOff;
      const evtBytes = readU32(buf, evtAbsOff);

      function getEF(fi) {
        const o = 4 + fi * 2;
        if (o + 2 > evtBytes) return 0;
        return buf.readUInt16LE(evtAbsOff + o);
      }
      // builtin_code (field 0): int8 (deprecated, see below)
      // custom_code (field 1): string
      // version (field 2): int32
      // builtin_code_2 (field 4): int32 (actual for >= 127)
      let builtinCode = 0;
      const bcOff = getEF(0);
      if (bcOff) builtinCode = buf.readInt8(entryAbsOff + bcOff);

      // Extended builtin code for codes >= 127 (field index 4)
      const extOff = getEF(4);
      if (extOff) {
        const ext = readI32(buf, entryAbsOff + extOff);
        if (ext > 0) builtinCode = ext;
      }

      let customCode = null;
      const ccOff = getEF(1);
      if (ccOff) {
        const ccAbsOff = entryAbsOff + ccOff;
        customCode = readFBString(buf, ccAbsOff + readI32(buf, ccAbsOff));
      }

      operatorCodes.push({
        builtinCode,
        builtinName: BUILTIN_OPS[builtinCode] || `BUILTIN_${builtinCode}`,
        customCode,
      });
    }
  }

  // ── subgraphs (field 2) ─────────────────────────────────────────────────
  const sgOff = getModelField(2);
  const subgraphs = [];
  if (sgOff) {
    const sg = modelAbsOff + sgOff;
    const sgVecOff = sg + readI32(buf, sg);
    const { count: sgCount, dataStart: sgStart } = readFBVector(buf, sgVecOff);

    for (let si = 0; si < sgCount; si++) {
      const sgRelOff = readI32(buf, sgStart + si * 4);
      const sgAbsOff = sgStart + si * 4 + sgRelOff;

      // Subgraph vtable
      const svtRelOff = readI32(buf, sgAbsOff);
      const svtAbsOff = sgAbsOff - svtRelOff;
      const svtBytes = readU32(buf, svtAbsOff);

      function getSGF(fi) {
        const o = 4 + fi * 2;
        if (o + 2 > svtBytes) return 0;
        return buf.readUInt16LE(svtAbsOff + o);
      }

      const subgraph = { tensors: [], inputs: [], outputs: [], operators: [], name: null };

      // tensors (field 0)
      const tensorsOff = getSGF(0);
      if (tensorsOff) {
        const tvAbsOff = sgAbsOff + tensorsOff;
        const tvVecAbsOff = tvAbsOff + readI32(buf, tvAbsOff);
        const { count: tc, dataStart: td } = readFBVector(buf, tvVecAbsOff);
        for (let ti = 0; ti < tc; ti++) {
          const tRelOff = readI32(buf, td + ti * 4);
          const tAbsOff = td + ti * 4 + tRelOff;
          subgraph.tensors.push(parseTensorFromBuffer(buf, tAbsOff));
        }
      }

      // inputs (field 1): vector<int32>
      const inpOff = getSGF(1);
      if (inpOff) {
        const iAbsOff = sgAbsOff + inpOff;
        const iVecAbsOff = iAbsOff + readI32(buf, iAbsOff);
        const { count: ic, dataStart: id } = readFBVector(buf, iVecAbsOff);
        for (let ii = 0; ii < ic; ii++) subgraph.inputs.push(readI32(buf, id + ii * 4));
      }

      // outputs (field 2): vector<int32>
      const outpOff = getSGF(2);
      if (outpOff) {
        const oAbsOff = sgAbsOff + outpOff;
        const oVecAbsOff = oAbsOff + readI32(buf, oAbsOff);
        const { count: oc, dataStart: od } = readFBVector(buf, oVecAbsOff);
        for (let oi = 0; oi < oc; oi++) subgraph.outputs.push(readI32(buf, od + oi * 4));
      }

      // operators (field 3): vector<Operator>
      const opsOff = getSGF(3);
      if (opsOff) {
        const opAbsOff2 = sgAbsOff + opsOff;
        const opVecAbsOff = opAbsOff2 + readI32(buf, opAbsOff2);
        const { count: opCount, dataStart: opStart } = readFBVector(buf, opVecAbsOff);
        for (let opi = 0; opi < opCount; opi++) {
          const opRelOff = readI32(buf, opStart + opi * 4);
          const opAbsOff3 = opStart + opi * 4 + opRelOff;
          subgraph.operators.push(parseOperator(buf, opAbsOff3));
        }
      }

      // name (field 4)
      const nameOff2 = getSGF(4);
      if (nameOff2) {
        const nAbsOff = sgAbsOff + nameOff2;
        subgraph.name = readFBString(buf, nAbsOff + readI32(buf, nAbsOff));
      }

      subgraphs.push(subgraph);
    }
  }

  // ── buffers (field 3) ───────────────────────────────────────────────────
  const bufsOff = getModelField(3);
  const buffers = [];
  if (bufsOff) {
    const bv = modelAbsOff + bufsOff;
    const bvVecOff = bv + readI32(buf, bv);
    const { count: bc, dataStart: bd } = readFBVector(buf, bvVecOff);
    for (let bi = 0; bi < bc; bi++) {
      const bRelOff = readI32(buf, bd + bi * 4);
      const bAbsOff = bd + bi * 4 + bRelOff;

      // Buffer table vtable
      const bvtRelOff = readI32(buf, bAbsOff);
      const bvtAbsOff = bAbsOff - bvtRelOff;
      const bvtBytes = readU32(buf, bvtAbsOff);

      let dataVec = null;
      const dataFieldOff = bvtBytes >= 6 ? buf.readUInt16LE(bvtAbsOff + 4) : 0;
      if (dataFieldOff) {
        const dataAbsOff = bAbsOff + dataFieldOff;
        const dataVecAbsOff = dataAbsOff + readI32(buf, dataAbsOff);
        const { count: dc, dataStart: dd } = readFBVector(buf, dataVecAbsOff);
        // Return a Buffer slice rather than copying
        dataVec = buf.slice(dd, dd + dc);
      }
      buffers.push(dataVec);
    }
  }

  // ── description (field 7) ───────────────────────────────────────────────
  let description = null;
  const descOff = getModelField(7);
  if (descOff) {
    const dAbsOff = modelAbsOff + descOff;
    try { description = readFBString(buf, dAbsOff + readI32(buf, dAbsOff)); } catch (e) { /* ignore */ }
  }

  return {
    version,
    description,
    operatorCodes,
    subgraphs,
    buffers,
  };
}

module.exports = { parseTFLiteModel, TENSOR_TYPES, BUILTIN_OPS };
