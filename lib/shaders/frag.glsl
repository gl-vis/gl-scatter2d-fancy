precision highp float;

uniform sampler2D chars;
uniform vec2 charsShape;
uniform float gamma;

varying vec4 fragColor;
varying vec2 charOffset;
varying vec2 pointCoord;

const float BUFFER = .64;
const float GAMMA = .16;

void main() {
	vec2 pointUV = (pointCoord - gl_FragCoord.xy + 16.) / 32.;
	vec2 texCoord = ((charOffset + pointUV) * 64.) / charsShape;
  float dist = texture2D(chars, texCoord).r;

	float alpha = smoothstep(BUFFER - GAMMA, BUFFER + GAMMA, dist);
	gl_FragColor = vec4(fragColor.rgb, alpha * fragColor.a);

  // gl_FragColor = vec4(vec3(dist), 1.);

  // gl_FragColor = vec4(fragColor.rgb * fragColor.a, fragColor.a);
}
