precision mediump float;

attribute vec2 position;
attribute vec2 offset;
attribute vec4 id;

uniform mat3 viewTransform;
uniform vec2 pixelScale;
uniform vec4 pickOffset;

varying vec4 fragColor;

#pragma glslify: computePosition = require("./xform.glsl")

void main() {
  vec4 fragId = id + pickOffset;

  fragId.z += floor(fragId.w) / 255.0;
  fragId.w -= floor(fragId.w);

  fragId.y += floor(fragId.z) / 255.0;
  fragId.z -= floor(fragId.z);

  fragId.x += floor(fragId.y) / 255.0;
  fragId.y -= floor(fragId.y);

  fragColor = fragId;

  gl_Position = computePosition(
    position,
    offset,
    viewTransform,
    pixelScale);
}
