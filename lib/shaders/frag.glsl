precision highp float;

uniform sampler2D chars;
uniform vec2 charsShape;
uniform float charsStep;

varying vec4 borderColor;
varying vec4 charColor;
varying vec2 charOffset;
varying vec2 pointCoord;
varying float pointSize;
varying float borderWidth;

void main() {
	vec2 pointUV = (pointCoord - gl_FragCoord.xy + pointSize * .5) / pointSize;
	pointUV.x = 1. - pointUV.x;
	vec2 texCoord = ((charOffset + pointUV) * charsStep) / charsShape;
	float dist = texture2D(chars, texCoord).r;

	// border color
	float dif = 2. * borderWidth / pointSize;
	float borderLevel = .75 - dif * .8;
	float charLevel = .75 + dif * .2;
	float gamma = .005 * charsStep / pointSize;

	float alpha = smoothstep(borderLevel - gamma, borderLevel + gamma, dist);
	float mixAmount = smoothstep(charLevel - gamma, charLevel + gamma, dist);

	//mix border color and color
	gl_FragColor = vec4(mix(charColor.rgb, borderColor.rgb, 1. - mixAmount), alpha * borderColor.a * charColor.a);

	// gl_FragColor = vec4(vec3(1.-dist), 1.);
}
