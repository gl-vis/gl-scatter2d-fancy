gl-scatter2d-fancy
==================
This code is similar to gl-scatter2d, but supports a larger range of styling features like custom marker glyphs, per marker colors, etc.  As a result, it is not as performant but provides more customization.

```js
const createPlot = require('gl-plot2d')
const createScatter = require('gl-scatter2d-fancy')

let plot = createPlot({gl, ...})

let scatter = createScatter(plot, {
	positions:    [.5,.5, .6,.7, ...],
	sizes:        [2, 3, ...],
	colors:       [0,0,0,1, .5,.5,1,1, ...],
	glyphs:       ['x', 'y', ...],
	borderWidths: [.5, 1, ...],
	borderColors: [1,0,0,.5, 0,0,1,.5, ...]
})

plot.draw()
```

# License
(c) 2015 Mikola Lysenko. MIT License
