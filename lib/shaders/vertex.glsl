precision highp float;

attribute vec2 positionHi, positionLo;
attribute float size;
attribute vec2 char;
attribute vec4 color;

//this is 64-bit form of scale and translate
uniform vec2 scaleHi, scaleLo, translateHi, translateLo;
uniform vec2 pixelScale;
uniform vec4 viewBox;

varying vec4 fragColor;
varying vec2 charOffset;
varying vec2 pointCoord;
varying float pointSize;
varying vec2 position;

#pragma glslify: computePosition = require("./xform.glsl")

void main() {
  fragColor = color;

  gl_PointSize = size*2.;
  pointSize = size*2.;

  charOffset = char;

  gl_Position = computePosition(
    positionHi, positionLo,
    scaleHi, scaleLo,
    translateHi, translateLo,
    pixelScale, vec2(0));

  pointCoord = viewBox.xy + (viewBox.zw - viewBox.xy) * (gl_Position.xy * .5 + .5);
}
