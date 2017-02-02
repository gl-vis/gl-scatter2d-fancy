'use strict'

module.exports = createFancyScatter2D

var createShader = require('gl-shader')
var createBuffer = require('gl-buffer')
var textCache = require('text-cache')
var vectorizeText = require('vectorize-text')
var pool = require('typedarray-pool')
var shaders = require('./lib/shaders')
var snapPoints = require('snap-points-2d')
var atlas = require('font-atlas-sdf')
var createTexture = require('gl-texture2d')


var BOUNDARIES = {}

function getBoundary(glyph) {
  if(glyph in BOUNDARIES) {
    return BOUNDARIES[glyph]
  }

  var polys = vectorizeText(glyph, {
    polygons: true,
    font: 'sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic'
  })

  var coords  = []
  var normals = []

  polys.forEach(function(loops) {
    loops.forEach(function(loop) {
      for(var i=0; i < loop.length; ++i) {
        var a = loop[(i + loop.length - 1) % loop.length]
        var b = loop[i]
        var c = loop[(i + 1) % loop.length]
        var d = loop[(i + 2) % loop.length]

        var dx = b[0] - a[0]
        var dy = b[1] - a[1]
        var dl = Math.sqrt(dx * dx + dy * dy)
        dx /= dl
        dy /= dl

        coords.push(a[0], a[1] + 1.4)
        normals.push(dy, -dx)
        coords.push(a[0], a[1] + 1.4)
        normals.push(-dy, dx)
        coords.push(b[0], b[1] + 1.4)
        normals.push(-dy, dx)

        coords.push(b[0], b[1] + 1.4)
        normals.push(-dy, dx)
        coords.push(a[0], a[1] + 1.4)
        normals.push(dy, -dx)
        coords.push(b[0], b[1] + 1.4)
        normals.push(dy, -dx)

        var ex = d[0] - c[0]
        var ey = d[1] - c[1]
        var el = Math.sqrt(ex * ex + ey * ey)
        ex /= el
        ey /= el

        coords.push(b[0], b[1] + 1.4)
        normals.push(dy, -dx)
        coords.push(b[0], b[1] + 1.4)
        normals.push(-dy, dx)
        coords.push(c[0], c[1] + 1.4)
        normals.push(-ey, ex)

        coords.push(c[0], c[1] + 1.4)
        normals.push(-ey, ex)
        coords.push(b[0], b[1] + 1.4)
        normals.push(ey, -ex)
        coords.push(c[0], c[1] + 1.4)
        normals.push(ey, -ex)
      }
    })
  })

  var bounds = [Infinity, Infinity, -Infinity, -Infinity]
  for(var i = 0; i < coords.length; i += 2) {
    for(var j = 0; j < 2; ++j) {
      bounds[j]     = Math.min(bounds[j],     coords[i + j])
      bounds[2 + j] = Math.max(bounds[2 + j], coords[i + j])
    }
  }

  return BOUNDARIES[glyph] = {
    coords:  coords,
    normals: normals,
    bounds:  bounds
  }
}

function GLScatterFancy(
    plot,
    shader,
    pickShader,
    positionHiBuffer,
    positionLoBuffer,
    sizeBuffer,
    colorBuffer,
    idBuffer,
    charBuffer) {
  this.plot           = plot
  this.shader         = shader
  this.pickShader     = pickShader
  this.posHiBuffer    = positionHiBuffer
  this.posLoBuffer    = positionLoBuffer
  this.sizeBuffer     = sizeBuffer
  this.colorBuffer    = colorBuffer
  this.idBuffer       = idBuffer
  this.charBuffer       = charBuffer
  this.bounds         = [Infinity, Infinity, -Infinity, -Infinity]
  this.numPoints      = 0
  this.numVertices    = 0
  this.pickOffset     = 0

  //positions data
  this.points         = null

  //lod scales
  this.scales         = []

  //data vertices offsets
  this.pointOffset   = []

  //font atlas texture
  this.charCanvas = document.createElement('canvas')
  this.charTexture = createTexture(this.plot.gl, this.charCanvas)
  // this.colorsTexture = createTexture(this.plot.gl, [512, 512])
}

var proto = GLScatterFancy.prototype

;(function() {
  var SCALE_HI = new Float32Array([0, 0])
  var SCALE_LO = new Float32Array([0, 0])
  var TRANSLATE_HI = new Float32Array([0, 0])
  var TRANSLATE_LO = new Float32Array([0, 0])

  var PIXEL_SCALE = [0, 0]

  var pixelSize

  function calcScales() {
    var plot       = this.plot
    var bounds     = this.bounds
    var viewBox    = plot.viewBox
    var dataBox    = plot.dataBox
    var pixelRatio = plot.pixelRatio

    var boundX = bounds[2] - bounds[0]
    var boundY = bounds[3] - bounds[1]
    var dataX  = dataBox[2] - dataBox[0]
    var dataY  = dataBox[3] - dataBox[1]

    var scaleX = 2 * boundX / dataX
    var scaleY = 2 * boundY / dataY
    var translateX = (bounds[0] - dataBox[0] - 0.5 * dataX) / boundX
    var translateY = (bounds[1] - dataBox[1] - 0.5 * dataY) / boundY

    SCALE_HI[0] = scaleX
    SCALE_LO[0] = scaleX - SCALE_HI[0]
    SCALE_HI[1] = scaleY
    SCALE_LO[1] = scaleY - SCALE_HI[1]

    TRANSLATE_HI[0] = translateX
    TRANSLATE_LO[0] = translateX - TRANSLATE_HI[0]
    TRANSLATE_HI[1] = translateY
    TRANSLATE_LO[1] = translateY - TRANSLATE_HI[1]

    var screenX = viewBox[2] - viewBox[0]
    var screenY = viewBox[3] - viewBox[1]

    pixelSize   = Math.min(dataX / screenX, dataY / screenY)

    //FIXME: why double?
    PIXEL_SCALE[0] = 2 * pixelRatio / screenX
    PIXEL_SCALE[1] = 2 * pixelRatio / screenY
  }

  var PICK_OFFSET = [0, 0, 0, 0]

  proto.drawPick = function(offset) {
    var pick = offset !== undefined
    var plot = this.plot

    var numVertices = this.numVertices

    if(!numVertices) {
      return offset
    }

    calcScales.call(this)

    var gl = plot.gl
    var shader = pick ? this.pickShader : this.shader

    shader.bind()

    if(pick) {

      this.pickOffset = offset

      for (var i = 0; i < 4; ++i) {
        PICK_OFFSET[i] = (offset >> (i * 8)) & 0xff
      }

      shader.uniforms.pickOffset = PICK_OFFSET

      this.idBuffer.bind()
      shader.attributes.id.pointer(gl.UNSIGNED_BYTE, false)

    } else {
      //enable data blending
      //FIXME: make sure it does not trigger each and every draw call
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.enable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);

      this.colorBuffer.bind()
      // shader.attributes.color = [0,1,0,1]
      shader.attributes.color.pointer(gl.UNSIGNED_BYTE, true)

      this.charBuffer.bind()
      shader.attributes.char.pointer(gl.UNSIGNED_BYTE, false)

      // let ctx = this.charCanvas.getContext('2d');
      // ctx.fillStyle = 'red';
      // ctx.fillRect(30,30,4,4);

      //TODO: get rid of recreating texture each fucking draw time
      this.charTexture = createTexture(this.plot.gl, this.charCanvas)
      shader.uniforms.chars = this.charTexture.bind(0)
      // document.body.appendChild(this.charCanvas)
      //TODO: get rid of this resetting each redraw time
      this.charTexture.setPixels(this.charCanvas)
      shader.uniforms.charsShape = [this.charCanvas.width, this.charCanvas.height]
      shader.uniforms.charsStep = this.charStep;

      this.sizeBuffer.bind()
      shader.attributes.size.pointer()
    }

    this.posHiBuffer.bind()
    shader.attributes.positionHi.pointer()

    this.posLoBuffer.bind()
    shader.attributes.positionLo.pointer()

    shader.uniforms.pixelScale  = PIXEL_SCALE
    shader.uniforms.scaleHi     = SCALE_HI
    shader.uniforms.scaleLo     = SCALE_LO
    shader.uniforms.translateHi = TRANSLATE_HI
    shader.uniforms.translateLo = TRANSLATE_LO
    //FIXME: this may be an issue for changed viewbox, test it
    //FIXME: make sure we can't do the same with PIXEL_SCALE or something
    shader.uniforms.viewBox = plot.viewBox

    var scales = this.scales

    for(var scaleNum = scales.length - 1; scaleNum >= 0; scaleNum--) {
        var lod = scales[scaleNum]
        if(lod.pixelSize < pixelSize && scaleNum > 1) {
          continue
        }

        var intervalStart = lod.offset
        var intervalEnd   = lod.count + intervalStart

        var startOffset = this.pointOffset[intervalStart]
        var endOffset = this.pointOffset[intervalEnd] || numVertices

        //TODO: we can shave off even more by slicing by left/right limits, see gl-scatter2d. Points are arranged by x coordinate so just calc bounds

        if (endOffset > startOffset) {
          gl.drawArrays(gl.POINTS, startOffset, (endOffset - startOffset))
        }
    }

    if(pick) return offset + this.numPoints
  }
})()

proto.draw = proto.drawPick

proto.pick = function(x, y, value) {
  var pickOffset = this.pickOffset
  var pointCount = this.numPoints
  if(value < pickOffset || value >= pickOffset + pointCount) {
    return null
  }
  var pointId = value - pickOffset
  var points  = this.points
  return {
    object:    this,
    pointId:   pointId,
    dataCoord: [points[2 * pointId], points[2 * pointId + 1]]
  }
}

proto.update = function(options) {
  options = options || {}

  var positions     = options.positions    || []
  var colors        = options.colors       || []
  var glyphs        = options.glyphs       || []
  var sizes         = options.sizes        || []
  var borderWidths  = options.borderWidths || []
  var borderColors  = options.borderColors || []
  var i, j
  var gl = this.plot.gl

  this.points = positions

  //create packed positions here
  var pointCount         = this.points.length / 2
  var packedId           = pool.mallocInt32(pointCount)
  var packedW            = pool.mallocFloat32(2 * pointCount)
  var packed             = pool.mallocFloat64(2 * pointCount)
  packed.set(this.points)
  this.scales = snapPoints(packed, packedId, packedW, this.bounds)

  var bounds = this.bounds = [Infinity, Infinity, -Infinity, -Infinity]
  var numVertices = 0

  var glyphMeshes = Array(pointCount)
  var glyphBoundaries = Array(pointCount)
  var glyph, border, glyphData

  bounds[0] = 0
  bounds[1] = 0
  bounds[2] = 1
  bounds[3] = 1

  for(i = 0; i < pointCount; ++i) {
    var id = packedId[i]
    glyph = textCache('sans-serif', glyphs[id])
    border = getBoundary(glyphs[id])
    glyphMeshes[id] = glyph
    glyphBoundaries[id] = border
    // numVertices += (glyph.data.length + border.coords.length) >> 1
    numVertices += 1
    // for(j = 0; j < 2; ++j) {
    //   bounds[j]     = Math.min(bounds[j],     positions[2 * id + j])
    //   bounds[2 + j] = Math.max(bounds[2 + j], positions[2 * id + j])
    // }
  }

  // if(bounds[0] === bounds[2]) {
  //   bounds[2] += 1
  // }
  // if(bounds[3] === bounds[1]) {
  //   bounds[3] += 1
  // }

  var sx = 1 / (bounds[2] - bounds[0])
  var sy = 1 / (bounds[3] - bounds[1])
  var tx = bounds[0]
  var ty = bounds[1]

  //v_position contains normalized positions to the available range of positions
  var v_position = pool.mallocFloat64(2 * numVertices)
  var v_posHi    = pool.mallocFloat32(2 * numVertices)
  var v_posLo    = pool.mallocFloat32(2 * numVertices)
  var v_size     = pool.mallocFloat32(numVertices)
  var v_color    = pool.mallocUint8(4 * numVertices)
  var v_ids      = pool.mallocUint32(numVertices)
  var v_chars    = pool.mallocUint8(2 * numVertices)
  var ptr = 0

  this.pointOffset.length = pointCount

  for(i = 0; i < pointCount; ++i) {
    this.pointOffset[i] = ptr

    var id = packedId[i]
    var x = sx * (positions[2 * id]     - tx)
    var y = sy * (positions[2 * id + 1] - ty)
    var s = sizes[id]
    var r = colors[4 * id]     * 255
    var g = colors[4 * id + 1] * 255
    var b = colors[4 * id + 2] * 255
    var a = colors[4 * id + 3] * 255

    v_position[2 * ptr]     = x
    v_position[2 * ptr + 1] = y
    v_size[ptr]             = s
    v_color[4 * ptr]        = r
    v_color[4 * ptr + 1]    = g
    v_color[4 * ptr + 2]    = b
    v_color[4 * ptr + 3]    = a
    v_ids[ptr]              = id

    ptr += 1

    var w = borderWidths[id]
    r = borderColors[4 * id]     * 255
    g = borderColors[4 * id + 1] * 255
    b = borderColors[4 * id + 2] * 255
    a = borderColors[4 * id + 3] * 255
  }

  this.numPoints = pointCount
  this.numVertices = numVertices

  v_posHi.set(v_position)
  for(i = 0; i < v_position.length; i++)
    v_posLo[i] = v_position[i] - v_posHi[i]

  //aggregate glyphs
  var glyphChars = {};
  for (var i = 0, l = pointCount, k = 0; i < l; i++) {
    var char = glyphs[i]
    if (glyphChars[char] == null) {
      glyphChars[char] = k++
    }
  }

  //generate font atlas
  //TODO: make step depend on chars number
  var chars = Object.keys(glyphChars)
  var size = 64
  var step = size*2
  var maxW = gl.getParameter(gl.MAX_TEXTURE_SIZE)
  var atlasW = Math.min(maxW, step*chars.length)
  var atlasH = Math.min(maxW, step*Math.floor(step*chars.length/atlasW))
  this.charCanvas = atlas({
    canvas: this.charCanvas,
    family: 'sans-serif',
    size: size,
    shape: [atlasW, atlasH],
    step: [step, step],
    chars: chars
  })
  this.charStep = step
  this.charSize = size

  //populate char indexes
  var cols = atlasW / step
  for (var i = 0; i < pointCount; i++) {
    var char = glyphs[i]
    var charIdx = glyphChars[char]
    v_chars[2*i + 1] = Math.floor(charIdx / cols)
    v_chars[2*i] = charIdx % cols
  }

  //update data
  this.posHiBuffer.update(v_posHi)
  this.posLoBuffer.update(v_posLo)
  this.sizeBuffer.update(v_size)
  this.colorBuffer.update(v_color)
  this.idBuffer.update(v_ids)
  this.charBuffer.update(v_chars)

  pool.free(v_position)
  pool.free(v_posHi)
  pool.free(v_posLo)
  pool.free(v_size)
  pool.free(v_color)
  pool.free(v_ids)
  pool.free(v_chars)

  pool.free(packed)
  pool.free(packedId)
  pool.free(packedW)
}

proto.dispose = function() {
  this.shader.dispose()
  this.pickShader.dispose()
  this.posHiBuffer.dispose()
  this.posLoBuffer.dispose()
  this.sizeBuffer.dispose()
  this.colorBuffer.dispose()
  this.idBuffer.dispose()
  this.charBuffer.dispose()
  this.plot.removeObject(this)
}

function createFancyScatter2D(plot, options) {
  var gl = plot.gl

  var shader     = createShader(gl, shaders.vertex,     shaders.fragment)
  var pickShader = createShader(gl, shaders.pickVertex, shaders.pickFragment)

  var positionHiBuffer = createBuffer(gl)
  var positionLoBuffer = createBuffer(gl)
  var sizeBuffer     = createBuffer(gl)
  var colorBuffer      = createBuffer(gl)
  var idBuffer         = createBuffer(gl)
  var charBuffer       = createBuffer(gl)

  var scatter = new GLScatterFancy(
    plot,
    shader,
    pickShader,
    positionHiBuffer,
    positionLoBuffer,
    sizeBuffer,
    colorBuffer,
    idBuffer,
    charBuffer)

  scatter.update(options)

  plot.addObject(scatter)

  return scatter
}
