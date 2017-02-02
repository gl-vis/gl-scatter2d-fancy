precision highp float;

attribute vec2 positionHi, positionLo;
attribute vec2 offset;
attribute vec2 char;
attribute vec4 color;

//this is 64-bit form of scale and translate
uniform vec2 scaleHi, scaleLo, translateHi, translateLo;
uniform vec2 pixelScale, charsShape;
uniform vec4 viewBox;

varying vec4 fragColor;
varying vec2 charOffset;
varying vec2 pointCoord;
varying float size;
varying vec2 position;

#pragma glslify: computePosition = require("./xform.glsl")

void main() {
  // vec4 color = texture2D(colors, vec2(colorIdx, .5));

  fragColor = color;

  gl_PointSize = 32.;
  size = 32.;

  charOffset = char;

  gl_Position = computePosition(
    positionHi, positionLo,
    scaleHi, scaleLo,
    translateHi, translateLo,
    pixelScale, offset);

  pointCoord = viewBox.xy + (viewBox.zw - viewBox.xy) * (gl_Position.xy * .5 + .5);
}
