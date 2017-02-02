precision highp float;

uniform sampler2D chars;
uniform vec2 charsShape;

varying vec4 fragColor;
varying vec2 charCoord;
varying vec2 pointCoord;

void main() {
	//FIXME: why pixelScale is double?
	//FIXME: whis does not include dataBox viewport
	vec2 coord = (pointCoord - gl_FragCoord.xy + 16.) / 32.;
	vec2 uvCoord = ((charCoord + coord) * 64.) / charsShape;
  vec4 color = texture2D(chars, uvCoord);
  // float alpha = smoothstep(u_buffer - u_gamma, u_buffer + u_gamma, dist);
  gl_FragColor = vec4(color.rgb, 1.);

  // gl_FragColor = vec4(fragColor.rgb * fragColor.a, fragColor.a);
}
