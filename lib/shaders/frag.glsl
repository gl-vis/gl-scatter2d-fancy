precision highp float;

uniform sampler2D chars;
uniform vec2 charsShape;
uniform float charsStep;

varying vec4 fragColor;
varying vec2 charOffset;
varying vec2 pointCoord;
varying float pointSize;

const float BUFFER = .72;
const float GAMMA = .05;

void main() {
	vec2 pointUV = (pointCoord - gl_FragCoord.xy + pointSize * .5) / pointSize;
	pointUV.x = 1. - pointUV.x;
	vec2 texCoord = ((charOffset + pointUV) * charsStep) / charsShape;
  float dist = texture2D(chars, texCoord).r;

	float alpha = smoothstep(BUFFER - GAMMA, BUFFER + GAMMA, dist);
	gl_FragColor = vec4(fragColor.rgb, alpha * fragColor.a);

  // gl_FragColor = vec4(vec3(dist), 1.);
}
