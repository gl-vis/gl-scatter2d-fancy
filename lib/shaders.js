'use strict'

var glslify = require('glslify')

module.exports = {
  vertex:     glslify('./shaders/vertex.glsl'),
  pickVertex: glslify('./shaders/pick-vertex.glsl'),
  fragment:   glslify('./shaders/fragment.glsl')
}
