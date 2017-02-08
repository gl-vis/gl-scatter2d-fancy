precision highp float;

#pragma glslify: computePosition = require("./xform.glsl")

attribute vec2 positionHi, positionLo;
attribute float size, border;
attribute vec2 char, color;

//this is 64-bit form of scale and translate
uniform vec2 scaleHi, scaleLo, translateHi, translateLo;
uniform vec2 pixelScale;
uniform vec4 viewBox;
uniform sampler2D palette;

varying vec4 charColor;
varying vec4 borderColor;
varying vec2 charOffset;
varying vec2 pointCoord;
varying float pointSize;
varying vec2 position;
varying float borderWidth;


void main() {
  charColor = texture2D(palette, vec2(color.x / 255., 0));
  borderColor = texture2D(palette, vec2(color.y / 255., 0));

  gl_PointSize = size*2.;
  pointSize = size*2.;

  charOffset = char;
  borderWidth = border;

  gl_Position = computePosition(
    positionHi, positionLo,
    scaleHi, scaleLo,
    translateHi, translateLo,
    pixelScale, vec2(0));

  pointCoord = viewBox.xy + (viewBox.zw - viewBox.xy) * (gl_Position.xy * .5 + .5);
}
