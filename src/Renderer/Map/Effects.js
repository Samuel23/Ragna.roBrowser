/**
 * Renderer/Map/Effects.js
 *
 * Display 3D effects
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */
'use strict';

import glMatrix from 'Utils/gl-matrix';
import EffectManager from 'Renderer/EffectManager';

	/**
	 * Sound renderer namespace
	 */
	let vec3 = glMatrix.vec3;
	let _list = [];

	/**
	 * Add 3D sound to the list
	 */
	function add(mapEffect) {
		_list.push(mapEffect);
	}

	/**
	 * Remove data from memory
	 */
	function free() {
		_list.length = 0;
	}

	/**
	 * Get effect from list
	 */
	function get(GID) {
		let mapEffect;
		let count = _list.length;
		for (var i = 0; i < count; ++i) {
			mapEffect = _list[i];
			if (mapEffect.name == GID) {
				return mapEffect;
			}
		}
		return null;
	}

	/**
	 * Remove effect from list
	 */
	function remove(GID) {
		let mapEffect;
		let count = _list.length;
		for (var i = 0; i < count; ++i) {
			mapEffect = _list[i];
			if (mapEffect.name == GID) {
				_list.splice(i, 1);
				break;
			}
		}
	}

	/**
	 * Add effects to scene
	 *
	 * @param {vec3} position
	 */
	function spam(position, tick) {
		let mapEffect;
		let i,
			count = _list.length;

		for (i = 0; i < count; ++i) {
			mapEffect = _list[i];

			// distance need to be less than 25 cells (seems like it's
			// how the official client handle it).
			if (!mapEffect.isVisible && vec3.dist(mapEffect.pos, position) < 25) {
				let EF_Init_Par = {
					effectId: mapEffect.id,
					ownerAID: mapEffect.name,
					position: mapEffect.pos,
					startTick: tick,
					persistent: true
				};

				EffectManager.spam(EF_Init_Par);
				mapEffect.isVisible = true;
			} else if (mapEffect.isVisible && vec3.dist(mapEffect.pos, position) >= 25) {
				EffectManager.remove(null, mapEffect.name);
				mapEffect.isVisible = false;
			}
		}
	}

	/**
	 * Export 
	 */
	export default {
		add: add,
		free: free,
		get: get,
		remove: remove,
		spam: spam
	};