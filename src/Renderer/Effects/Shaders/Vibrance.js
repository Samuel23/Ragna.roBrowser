/**
 * Renderer/Effects/Shaders/Vibrance.js
 * Implementation of the Vibrance post-processing effect.
 * Adjusts color saturation based on existing saturation levels.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author AoShinHo
 */
'use strict';

import GraphicsSettings from 'Preferences/Graphics';
import WebGL from 'Utils/WebGL';
import PostProcess from 'Renderer/Effects/PostProcess';
import commonVS from './GLSL/Common.vs?raw';
import vibranceFS from './GLSL/Vibrance.fs?raw';

let _program, _buffer;
	function Vibrance() {}

	Vibrance.render = function render(gl, inputTexture, outputFramebuffer) {
		if (!_buffer || !_program || !Vibrance.isActive()) {
			return;
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, outputFramebuffer);
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		gl.useProgram(_program);

		gl.uniform1f(_program.uniform.uVibrance, GraphicsSettings.vibrance || 0.15);
		gl.uniform3f(_program.uniform.uVibranceRGBBalance, 1.0, 1.0, 1.0);

		gl.bindBuffer(gl.ARRAY_BUFFER, _buffer);
		let posLoc = _program.attribute.aPosition;
		gl.enableVertexAttribArray(posLoc);
		gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);
		gl.uniform1i(_program.uniform.uTexture, 0);

		gl.drawArrays(gl.TRIANGLES, 0, 6);

		Vibrance.afterRender(gl);
	};

	Vibrance.afterRender = function (gl) {
		gl.useProgram(null);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.bindTexture(gl.TEXTURE_2D, null);
	};

	Vibrance.init = function init(gl) {
		if (!gl) {
			return;
		}
		try {
			_program = WebGL.createShaderProgram(gl, commonVS, vibranceFS);
		} catch (e) {
			console.error('Error compiling Vibrance shader.', e);
			return;
		}
		let quadVertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
		_buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, _buffer);
		gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
	};

	Vibrance.isActive = function isActive() {
		return GraphicsSettings.vibranceEnabled;
	};

	Vibrance.program = function program() {
		return _program;
	};

	Vibrance.clean = function clean(gl) {
		if (_buffer) {
			gl.deleteBuffer(_buffer);
		}
		_program = _buffer = null;
	};
export default Vibrance;