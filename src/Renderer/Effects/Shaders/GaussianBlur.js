/**
 * Renderer/Effects/Shaders/GaussianBlur.js
 * Implementation of Radial Gaussian Blur.
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
import blurFS from './GLSL/GaussianBlur.fs?raw';

let _program, _buffer;
	/**
	 * Fragment Shader: Single-Pass Gaussian Blur
	 */
	function GaussianBlur() {}

	/**
	 * Renders the Blur effect
	 * @param {WebGLRenderingContext} gl
	 * @param {WebGLTexture} inputTexture - Texture from previous pass
	 * @param {WebGLFramebuffer} outputFramebuffer - Target buffer
	 */
	GaussianBlur.render = function render(gl, inputTexture, outputFramebuffer) {
		if (!_buffer || !_program || !GaussianBlur.isActive()) {
			return;
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, outputFramebuffer);

		// Viewport handling
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		gl.useProgram(_program);

		let focusRadius = GraphicsSettings.blurArea / 100;
		let focusFalloff = 0.5;

		gl.uniform1f(_program.uniform.uFocusRadius, focusRadius);
		gl.uniform1f(_program.uniform.uFocusFalloff, focusFalloff);

		let boxsampleFactor = GraphicsSettings.blurIntensity;

		gl.uniform2f(
			_program.uniform.uTexelSize,
			(1.0 / gl.canvas.width) * boxsampleFactor,
			(1.0 / gl.canvas.height) * boxsampleFactor
		);

		gl.bindBuffer(gl.ARRAY_BUFFER, _buffer);
		let posLoc = _program.attribute.aPosition;
		gl.enableVertexAttribArray(posLoc);
		gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);
		gl.uniform1i(_program.uniform.uTexture, 0);

		gl.drawArrays(gl.TRIANGLES, 0, 6);

		GaussianBlur.afterRender(gl);
	};

	GaussianBlur.afterRender = function (gl) {
		if (!_buffer || !_program) {
			return;
		}
		gl.useProgram(null);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.bindTexture(gl.TEXTURE_2D, null);
	};

	GaussianBlur.init = function init(gl) {
		if (!gl) {
			return;
		}
		try {
			_program = WebGL.createShaderProgram(gl, commonVS, blurFS);
		} catch (e) {
			console.error('Error compiling Lens Blur shader.', e);
			return;
		}
		let quadVertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
		_buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, _buffer);
		gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
	};

	GaussianBlur.isActive = function isActive() {
		return GraphicsSettings.blur;
	};

	GaussianBlur.program = function program() {
		return _program;
	};

	// No internal FBO needed for this effect in this architecture
	GaussianBlur.clean = function clean(gl) {
		if (_buffer) {
			gl.deleteBuffer(_buffer);
		}
		_program = _buffer = null;
	};
export default GaussianBlur;