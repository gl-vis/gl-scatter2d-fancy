'use strict'

var createShader = require('gl-shader')
var createBuffer = require('gl-buffer')
var textCache = require('text-cache')
var shaders = require('./lib/shaders')

var VERTEX_SIZE       = 9
var VERTEX_SIZE_BYTES = VERTEX_SIZE * 4

function GLScatterFancy(
    plot,
    shader,
    pickShader,
    positionBuffer,
    offsetBuffer,
    colorBuffer,
    idBuffer) {
  this.plot           = plot
  this.shader         = shader
  this.pickShader     = pickShader
  this.positionBuffer = positionBuffer
  this.offsetBuffer   = offsetBuffer
  this.colorBuffer    = colorBuffer
  this.idBuffer       = idBuffer
  this.bounds         = [Infinity, Infinity, -Infinity, -Infinity]
  this.numPoints      = 0
  this.numVertices    = 0
}

var proto = GLScatterFancy.prototype

proto.draw = (function() {
  var MATRIX = [
    1, 0, 0,
    0, 1, 0,
    0, 0, 1
  ];

  var PIXEL_SCALE = [1, 1]

  return function() {
    var plot          = this.plot
    var shader        = this.shader
    var bounds        = this.bounds
    var numVertices   = this.numVertices

    var gl          = plot.gl
    var viewBox     = plot.viewBox
    var dataBox     = plot.dataBox
    var pixelRatio  = plot.pixelRatio

    var boundX  = bounds[2] - bounds[0]
    var boundY  = bounds[3] - bounds[1]
    var dataX   = dataBox[2] - dataBox[0]
    var dataY   = dataBox[3] - dataBox[1]

    MATRIX[0] = 2.0 * boundX / dataX
    MATRIX[4] = 2.0 * boundY / dataY
    MATRIX[6] = 2.0 * (bounds[0] - dataBox[0]) / dataX - 1.0
    MATRIX[7] = 2.0 * (bounds[1] - dataBox[1]) / dataY - 1.0

    var screenX = (viewBox[2] - viewBox[0])
    var screenY = (viewBox[3] - viewBox[1])

    PIXEL_SCALE[0] = pixelRatio / screenX
    PIXEL_SCALE[1] = pixelRatio / screenY

    shader.bind()

    shader.uniforms.pixelScale = PIXEL_SCALE
    shader.uniforms.viewTransform = MATRIX

    this.positionBuffer.bind()
    shader.attributes.position.pointer()

    this.offsetBuffer.bind()
    shader.attributes.offset.pointer()

    this.colorBuffer.bind()
    shader.attributes.color.pointer()

    gl.drawArrays(gl.TRIANGLES, 0, numVertices)
  }
})()

proto.drawPick = (function() {

  return function(offset) {

    return offset + numPoints
  }
})()

proto.update = function(options) {
  options = options || {}

  var positions     = options.positions    || []
  var colors        = options.colors       || []
  var glyphs        = options.glyphs       || []
  var sizes         = options.sizes        || []

  var bounds = this.bounds = [Infinity, Infinity, -Infinity, -Infinity]
  var numVertices = 0
  for(var i=0; i<glyphs.length; ++i) {
    numVertices += textCache('sans-serif', glyphs[i]).data.length
    for(var j=0; j<2; ++j) {
      bounds[j]   = Math.min(bounds[j],   positions[2*i+j])
      bounds[2+j] = Math.min(bounds[2+j], positions[2*i+j])
    }
  }

  var sx = 1/(bounds[2] - bounds[0])
  var sy = 1/(bounds[3] - bounds[1])
  var tx = bounds[0]
  var ty = bounds[1]

  var v_position = pool.mallocFloat32(2 * numVertices)
  var v_offset   = pool.mallocFloat32(2 * numVertices)
  var v_color    = pool.mallocUint8(4 * numVertices)
  var v_ids      = pool.mallocUint32(numVertices)
  var ptr = 0

  for(var i=0; i<glyphs.length; ++i) {
    var glyph = glyphs[i]
    var x = sx * (positions[2*i]   - tx)
    var y = sy * (positions[2*i+1] - ty)
    var s = sizes[i]
    var r = colors[4*i]   * 255.0
    var g = colors[4*i+1] * 255.0
    var b = colors[4*i+2] * 255.0
    var a = colors[4*i+3] * 255.0

    for(var j=0; j<glyph.data.length; j+=2) {
      v_position[2*ptr]   = x
      v_position[2*ptr+1] = y
      v_offset[2*ptr]     = 2 * glyph[j]
      v_offset[2*ptr+1]   = 2 * glyph[j+1]
      v_color[4*ptr]      = r
      v_color[4*ptr+1]    = g
      v_color[4*ptr+2]    = b
      v_color[4*ptr+3]    = a
      v_ids[ptr]          = i

      ptr += 1
    }
  }

  this.numVertices = numVertices

  this.positionBuffer.update(v_position)
  this.offsetBuffer.update(v_offset)
  this.colorBuffer.update(v_color)
  this.idBuffer.update(v_ids)

  pool.free(v_position)
  pool.free(v_offset)
  pool.free(v_color)
  pool.free(v_ids)
}

proto.dispose = function() {
  this.shader.dispose()
  this.pickShader.dispose()
  this.positionBuffer.dispose()
  this.offsetBuffer.dispose()
  this.colorBuffer.dispose()
  this.idBuffer.dispose()
  this.plot.removeObject(this)
}

function createFancyScatter2D(plot, options) {
  var gl = plot.gl

  var shader      = createShader(gl, shaders.vertex,     shaders.fragment)
  var pickShader  = createShader(gl, shaders.pickVertex, shaders.fragment)

  var positionBuffer  = createBuffer(gl)
  var offsetBuffer    = createBuffer(gl)
  var colorBuffer     = createBuffer(gl)
  var idBuffer        = createBuffer(gl)

  var scatter = new GLScatterFancy(
    plot,
    shader,
    pickShader,
    buffer)

  scatter.update(options)

  plot.addObject(scatter)

  return scatter
}
