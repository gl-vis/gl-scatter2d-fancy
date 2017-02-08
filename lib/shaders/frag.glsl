precision highp float;

uniform sampler2D chars;
uniform vec2 charsShape;
uniform float charsStep;

varying vec4 fragColor;
varying vec2 charOffset;
varying vec2 pointCoord;
varying float pointSize;

void main() {
	vec2 pointUV = (pointCoord - gl_FragCoord.xy + pointSize * .5) / pointSize;
	pointUV.x = 1. - pointUV.x;
	vec2 texCoord = ((charOffset + pointUV) * charsStep) / charsShape;
  float dist = texture2D(chars, texCoord).r;

  float buffer = .725;
  float gamma = .0275 * 50. / pointSize;

  //FIXME: step scales with the point size, make sure it remains absolute
	float alpha = smoothstep(buffer - gamma, buffer + gamma, dist);
	gl_FragColor = vec4(fragColor.rgb, alpha * fragColor.a);

  // gl_FragColor = vec4(vec3(1.-dist), 1.);
}
