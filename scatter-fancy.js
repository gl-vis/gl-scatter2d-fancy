'use strict'

module.exports = createFancyScatter2D

var createShader = require('gl-shader')
var createBuffer = require('gl-buffer')
var textCache = require('text-cache')
var pool = require('typedarray-pool')
var shaders = require('./lib/shaders')
var snapPoints = require('snap-points-2d')
var atlas = require('font-atlas-sdf')
var createTexture = require('gl-texture2d')
var colorId = require('color-id')
var ndarray = require('ndarray')

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

  //buffers
  this.posHiBuffer    = positionHiBuffer
  this.posLoBuffer    = positionLoBuffer
  this.sizeBuffer     = sizeBuffer
  this.colorBuffer    = colorBuffer
  this.idBuffer       = idBuffer
  this.charBuffer       = charBuffer

  this.bounds         = [Infinity, Infinity, -Infinity, -Infinity]
  this.pointCount     = 0
  this.pickOffset     = 0

  //positions data
  this.points         = null

  //lod scales
  this.scales         = []

  //font atlas texture
  this.charCanvas     = document.createElement('canvas')
  this.charTexture    = createTexture(this.plot.gl, this.charCanvas)
  this.charStep       = 400

  //border/char colors texture
  this.paletteTexture   = createTexture(this.plot.gl, [256, 1])
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

    //FIXME: why twice?
    PIXEL_SCALE[0] = 2 * pixelRatio / screenX
    PIXEL_SCALE[1] = 2 * pixelRatio / screenY
  }

  var PICK_OFFSET = [0, 0, 0, 0]

  proto.drawPick = function(offset) {
    var pick = offset !== undefined
    var plot = this.plot

    var pointCount = this.pointCount

    if(!pointCount) {
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
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);

      this.colorBuffer.bind()
      shader.attributes.color.pointer(gl.UNSIGNED_BYTE, false)

      this.charBuffer.bind()
      shader.attributes.char.pointer(gl.UNSIGNED_BYTE, false)

      shader.uniforms.chars = this.charTexture.bind(0)
      shader.uniforms.charsShape = [this.charCanvas.width, this.charCanvas.height]
      shader.uniforms.charsStep = this.charStep;
      shader.uniforms.palette = this.paletteTexture.bind(1)

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

        var startOffset = intervalStart
        var endOffset = intervalEnd || pointCount

        //TODO: we can shave off even more by slicing by left/right limits, see gl-scatter2d. Points are arranged by x coordinate so just calc bounds

        if (endOffset > startOffset) {
          gl.drawArrays(gl.POINTS, startOffset, (endOffset - startOffset))
        }
    }

    if(pick) return offset + this.pointCount
  }
})()

proto.draw = proto.drawPick

proto.pick = function(x, y, value) {
  var pickOffset = this.pickOffset
  var pointCount = this.pointCount
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

  this.pointCount = pointCount

  //FIXME: figure out what these bounds are about or get rid of them
  var bounds = this.bounds = [Infinity, Infinity, -Infinity, -Infinity]

  bounds[0] = 0
  bounds[1] = 0
  bounds[2] = 1
  bounds[3] = 1

  var sx = 1 / (bounds[2] - bounds[0])
  var sy = 1 / (bounds[3] - bounds[1])
  var tx = bounds[0]
  var ty = bounds[1]

  //v_position contains normalized positions to the available range of positions
  var v_position = pool.mallocFloat64(2 * pointCount)
  var v_posHi    = pool.mallocFloat32(2 * pointCount)
  var v_posLo    = pool.mallocFloat32(2 * pointCount)
  var v_size     = pool.mallocFloat32(pointCount)
  var v_color    = pool.mallocUint8(2 * pointCount)
  var v_ids      = pool.mallocUint32(pointCount)
  var v_chars    = pool.mallocUint8(2 * pointCount)
  var ptr = 0

  //aggregate colors
  var paletteIds = {}, colorIds = [], paletteColors = [], bColorIds = []
  for (var i = 0, l = pointCount, k = 0; i < l; ++i) {
    var channels = [colors[4 * i] * 255, colors[4 * i + 1] * 255, colors[4 * i + 2] * 255, colors[4 * i + 3] * 255]
    var cId = colorId(channels, false)
    if (paletteIds[cId] == null) {
      paletteIds[cId] = k++
      paletteColors.push(channels[0])
      paletteColors.push(channels[1])
      paletteColors.push(channels[2])
      paletteColors.push(channels[3])
    }
    colorIds.push(cId)

    if (borderColors && borderColors.length) {
      channels = [borderColors[4 * i] * 255, borderColors[4 * i + 1] * 255, borderColors[4 * i + 2] * 255, borderColors[4 * i + 3] * 255]
      cId = colorId(channels, false)
      if (paletteIds[cId] == null) {
        paletteIds[cId] = k++
        paletteColors.push(channels[0])
        paletteColors.push(channels[1])
        paletteColors.push(channels[2])
        paletteColors.push(channels[3])
      }
      bColorIds.push(cId)
    }
  }

  //aggregate glyphs
  var glyphChars = {};
  for (var i = 0, l = pointCount, k = 0; i < l; i++) {
    var char = glyphs[i]
    if (glyphChars[char] == null) {
      glyphChars[char] = k++
    }
  }

  //generate font atlas
  //TODO: make size depend on chars number/max size of a point
  var chars = Object.keys(glyphChars)
  var step = this.charStep
  var size = Math.floor(step / 2)
  var maxW = gl.getParameter(gl.MAX_TEXTURE_SIZE)
  var maxChars = (maxW / step) * (maxW / step)
  var atlasW = Math.min(maxW, step*chars.length)
  var atlasH = Math.min(maxW, step*Math.ceil(step*chars.length/maxW))
  var cols = atlasW / step
  if (chars.length > maxChars) {
    console.warn('gl-scatter2d-fancy: number of characters is more than maximum texture size. Try reducing it.')
  }
  this.charCanvas = atlas({
    canvas: this.charCanvas,
    family: 'sans-serif',
    size: size,
    shape: [atlasW, atlasH],
    step: [step, step],
    chars: chars
  })

  //collect buffers data
  for(i = 0; i < pointCount; ++i) {
    var id = packedId[i]
    var x = sx * (positions[2 * id]     - tx)
    var y = sy * (positions[2 * id + 1] - ty)
    var s = sizes[id]

    v_position[2 * i]     = x
    v_position[2 * i + 1] = y
    v_size[i]             = s

    v_ids[i]              = id

    var w = borderWidths[id]

    //color/bufferColor indexes
    var cId = colorIds[id]
    var pcId = paletteIds[cId]
    v_color[2 * i] = pcId
    var bcId = bColorIds[id]
    var pbcId = paletteIds[bcId]
    v_color[2 * i + 1] = pbcId

    //char indexes
    var char = glyphs[id]
    var charId = glyphChars[char]
    v_chars[2 * i + 1] = Math.floor(charId / cols)
    v_chars[2 * i] = charId % cols
  }


  //collect hi-precition tails
  v_posHi.set(v_position)
  for(i = 0; i < v_position.length; i++)
    v_posLo[i] = v_position[i] - v_posHi[i]

  //fill buffes
  this.posHiBuffer.update(v_posHi)
  this.posLoBuffer.update(v_posLo)
  this.sizeBuffer.update(v_size)
  this.colorBuffer.update(v_color)
  this.idBuffer.update(v_ids)
  this.charBuffer.update(v_chars)

  //update char/color textures
  this.charTexture.shape = [this.charCanvas.width, this.charCanvas.height]
  this.charTexture.setPixels(this.charCanvas)
  this.paletteTexture.setPixels(ndarray(paletteColors.slice(0, 256*4), [256, 1, 4]))

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
