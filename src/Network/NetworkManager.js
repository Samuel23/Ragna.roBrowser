/**
 * Network/NetworkManager.js
 *
 * Network Manager
 * Manage sockets and packets
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */

define(function (require) {
	'use strict';

	// Load dependencies
	var Configs = require('Core/Configs');
	var BinaryReader = require('Utils/BinaryReader');
	var PACKETVER = require('./PacketVerManager');
	var PacketVersions = require('./PacketVersions');
	var PacketRegister = require('./PacketRegister');
	var PacketCrypt = require('./PacketCrypt');
	var PacketLength = require('./PacketLength');
	var WebSocket = require('./SocketHelpers/WebSocket');
	var NodeSocket = require('./SocketHelpers/NodeSocket');
	var getModule = require;

	/**
	 * Sockets list
	 * @var Socket[]
	 */
	var _sockets = [];

	/**
	 * Custom socket factory for plugins
	 * @var function|null
	 */
	var _socketFactory = null;

	/**
	 * Default socket factory - creates NodeSocket or WebSocket based on environment.
	 * Custom factories can call this as a fallback.
	 *
	 * @param {string} host
	 * @param {number} port
	 * @return {Socket}
	 */
	function defaultSocketFactory(host, port) {
		var proxy = Configs.get('socketProxy', null);

		if (NodeSocket.isSupported()) {
			return new NodeSocket(host, port, proxy);
		}
		return new WebSocket(host, port, proxy);
	}

	/**
	 * Current Socket
	 * @var Socket
	 */
	var _socket = null;

	/**
	 * Buffer to use to read packets
	 * @var buffer
	 */
	var _save_buffer = null;

	/**
	 * Defines if dump packets as hex string
	 * @var packetDump
	 */
	var packetDump = Configs.get('packetDump', false);

	/**
	 * Packets definition
	 *
	 * @param {string} name
	 * @param {callback} struct - callback to parse the packet
	 * @param {number} size - packet size
	 */
	function Packets(name, Struct, size) {
		this.name = name;
		this.Struct = Struct;
		this.size = size;
		this.callbacks = [];
	}

	/**
	 * List of supported packets
	 * @var Packets[]
	 */
	Packets.list = [];

	/**
	 * Connect to a server
	 *
	 * @param {string} host
	 * @param {number} port
	 * @param {function} callback once connected or not
	 * @param {boolean} is zone server ?
	 */
	function connect(host, port, callback, isZone) {
		var socket = _socketFactory ? _socketFactory(host, port) : defaultSocketFactory(host, port);

		socket.isZone = !!isZone;
		socket.onClose = onClose;
		socket.onComplete = function onComplete(success) {
			var msg = 'Fail';
			var color = 'red';

			if (success) {
				msg = 'Success';
				color = 'green';

				// If current socket has ping, remove it
				if (_socket && _socket.ping) {
					clearInterval(_socket.ping);
				}

				socket.onMessage = receive;
				_sockets.push((_socket = socket));

				// Map server encryption
				if (isZone) {
					PacketCrypt.init();
				}
			}

			console.log(
				'%c[Network] ' + msg + ' to connect to ' + host + ':' + port,
				'font-weight:bold;color:' + color
			);
			callback.call(this, success);
		};
	}

	/**
	 * Send a packet to the server
	 *
	 * @param Packet
	 */
	function sendPacket(Packet) {
		var pkt = Packet.build();

		if (packetDump) {
			let fp = new BinaryReader(pkt.buffer);
			let id = fp.readUShort();
			console.log(
				'%c[Network] Dump Send: \n%cPacket ID: 0x%s\nPacket Name: %s\nLength: %d\nContent:\n%s',
				'color:#007070',
				'color:inherit',
				id.toString(16),
				Packet.constructor.name,
				pkt.buffer.byteLength,
				utilsBufferToHexString(pkt.buffer).toUpperCase()
			);
		}

		console.log('%c[Network] Send:', 'color:#007070', Packet);

		// Encrypt packet
		if (_socket && _socket.isZone) {
			PacketCrypt.process(pkt.view);
		}

		send(pkt.buffer);
	}

	/**
	 * Send buffer to the server
	 *
	 * @param {ArrayBuffer} buffer
	 */
	function send(buffer) {
		if (_socket) {
			_socket.send(buffer);
		}
	}

	/**
	 * Register a Packet
	 *
	 * @param {number} id - packet UID
	 * @param {function} struct - packet structure callback
	 */
	function registerPacket(id, Struct) {
		Struct.id = id;
		Packets.list[id] = new Packets(Struct.name, Struct, Struct.size);
	}

	/**
	 * Hook a Packet - adds a callback descriptor to the packet's callback list.
	 * Multiple callbacks can be registered for the same packet (e.g. from plugins).
	 * Callbacks are called in priority order (default 0).
	 *
	 * @param {object} packet
	 * @param {function} callback - handler function
	 * @param {object} [meta] - optional metadata: { source: 'core'|'plugin', name: string, priority: number }
	 */
	function hookPacket(packet, callback, meta) {
		if (!packet) {
			throw new Error('NetworkManager::HookPacket() - Invalid packet structure "' + JSON.stringify(packet) + '"');
		}

		if (!packet.id) {
			throw new Error('NetworkManager::HookPacket() - Packet not yet register "' + packet.name + '"');
		}

		var source   = (meta && meta.source)   || 'core';
		var name     = (meta && meta.name)     || 'core';
		var priority = (meta && meta.priority) || 0;

		// Automagically detect source if not provided
		if (!meta) {
			try {
				var err = new Error();
				var stack = err.stack || '';
				var lines = stack.split('\n');
				// Looking for the caller (usually lines[2] or lines[3] depending on browser/engine)
				// We search for the first path that isn't NetworkManager.js
				for (var i = 1; i < lines.length; i++) {
					if (lines[i].indexOf('NetworkManager.js') === -1 && lines[i].indexOf('at ') !== -1) {
						var match = lines[i].match(/([^\/\\]+)\.js/);
						if (match) {
							name = match[1];
							source = lines[i].indexOf('Plugins/') !== -1 ? 'plugin' : 'core';
							break;
						}
					}
				}
			} catch (e) {
				// Fallback to core:core if stack parsing fails
			}
		}

		var list = Packets.list[packet.id].callbacks;

		// Avoid duplicate callbacks
		for (var j = 0; j < list.length; j++) {
			if (list[j].fn === callback) {
				return;
			}
		}

		list.push({
			fn: callback,
			source: source,
			name: name,
			priority: priority
		});

		// Sort by priority desc
		list.sort(function (a, b) {
			return b.priority - a.priority;
		});
	}

	/**
	 * Unhook a Packet - removes a previously registered callback by function reference.
	 * Useful for plugins that need to clean up their handlers.
	 *
	 * @param {object} packet
	 * @param {function} callback - the exact function reference originally passed to hookPacket
	 */
	function unhookPacket(packet, callback) {
		if (!packet || !packet.id) {
			return;
		}

		var list = Packets.list[packet.id];
		if (!list) {
			return;
		}

		var idx = -1;
		for (var i = 0; i < list.callbacks.length; i++) {
			if (list.callbacks[i].fn === callback) {
				idx = i;
				break;
			}
		}

		if (idx !== -1) {
			list.callbacks.splice(idx, 1);
		}
	}

	/**
	 * Force to read from a used version for the next receive data
	 *
	 * @param callback
	 */
	function read(callback) {
		read.callback = callback;
	}

	/**
	 * Callback used for reading the data for the next buffer received from server
	 * @var callback
	 */
	read.callback = null;

	/**
	 * Received data from server
	 *
	 * @param {Uint8Array} buffer
	 */
	function receive(buf) {
		var id, packet, fp;
		var length = 0;
		var offset = 0;
		var buffer;

		// Waiting for data ? concat the buffer
		if (_save_buffer) {
			var _data = new Uint8Array(_save_buffer.length + buf.byteLength);
			_data.set(_save_buffer, 0);
			_data.set(new Uint8Array(buf), _save_buffer.length);
			buffer = _data.buffer;
		} else {
			buffer = buf;
		}

		fp = new BinaryReader(buffer);

		// Read hook
		if (read.callback) {
			read.callback(fp);
			read.callback = null;
		}

		// Read and parse packets
		while (fp.tell() < fp.length) {
			offset = fp.tell();

			// Not enough bytes...
			if (offset + 2 > fp.length) {
				_save_buffer = new Uint8Array(buffer, offset, fp.length - offset);
				return;
			}

			id = fp.readUShort();
			let packet_len = PacketLength.getPacketLength(id);
			packet_len = packet_len ? packet_len : fp.length - offset;
			// Packet not defined ?

			if (packet_len < 0) {
				// Not enough bytes...
				if (offset + 4 > fp.length) {
					_save_buffer = new Uint8Array(buffer, offset, fp.length - offset);
					return;
				}
				length = fp.readUShort();
			} else {
				length = packet_len;
			}

			offset += length;

			// Not enough bytes, need to wait for new buffer to read more.
			if (offset > fp.length) {
				offset = fp.tell() - (packet_len < 0 ? 4 : 2);
				_save_buffer = new Uint8Array(buffer, offset, fp.length - offset);
				return;
			}

			if (Packets.list[id]) {
				packet = Packets.list[id];

				if (packetDump) {
					let buffer_console = new Uint8Array(buffer, 0, length);
					console.log(
						'%c[Network] Dump Recv:\n%cPacket ID: 0x%s\nPacket Name: %s\nLength: %d\nContent:\n%s',
						'color:#900090',
						'color:inherit',
						id.toString(16),
						packet.name,
						length,
						utilsBufferToHexString(buffer_console).toUpperCase()
					);
				}

				// Parse packet
				//if (!packet.instance) {
				packet.instance = new packet.Struct(fp, offset);
				//}
				//else {
				//	packet.Struct.call(packet.instance, fp, offset); //this causes packet conflicts where the same type of packets following eachother copy the previous packet's variables with the previous values
				//}

				var callbackNames = packet.callbacks.map(function (c) {
					return c.source + ':' + c.name;
				}).join(', ');

				console.log(
					'%c[Network] Recv:',
					'color:#900090',
					packet.instance,
					packet.callbacks.length === 0 ? '(no callback)' : '[' + callbackNames + ']'
				);

				// Call all registered controllers/plugins in priority order
				for (var ci = 0; ci < packet.callbacks.length; ++ci) {
					try {
						// Return false to stop propagation to other callbacks
						if (packet.callbacks[ci].fn(packet.instance) === false) {
							break;
						}
					} catch (e) {
						console.error('[Network] Error in callback for packet "%s" from source "%s:%s":', packet.name, packet.callbacks[ci].source, packet.callbacks[ci].name, e);
					}
				}
			} else {
				if (packetDump) {
					let unknown_buffer = new Uint8Array(buffer, 0, length);
					console.log(
						'%c[Network] Dump Recv:\n%cPacket ID: 0x%s\nPacket Name: [UNKNOWN]\nLength: %d\nContent:\n%s',
						'color:#900090',
						'color:inherit',
						id.toString(16),
						length,
						utilsBufferToHexString(unknown_buffer).toUpperCase()
					);
				}
				console.error(
					'[Network] Packet "%c0x%s%c" not registered, skipping %d bytes.',
					'font-weight:bold',
					id.toString(16),
					'font-weight:normal',
					length
				);
			}

			// Support for "0" type
			if (length) {
				fp.seek(offset, SEEK_SET);
			}
		}

		_save_buffer = null;
	}

	/**
	 * Communication end
	 * Server ask to close the socket
	 */
	function onClose() {
		var idx = _sockets.indexOf(this);

		if (this === _socket) {
			console.warn('[Network] Disconnect from server');

			if (_socket.ping) {
				clearInterval(_socket.ping);
			}

			getModule('UI/UIManager').showErrorBox('Disconnected from Server.');
		}

		if (idx !== -1) {
			_sockets.splice(idx, 1);
		}
	}

	/**
	 * Close connection with server
	 * Is this needed ?
	 */
	function close() {
		var idx;

		if (_socket) {
			_socket.close();

			if (_socket.izZone) {
				PacketCrypt.reset();
			}

			if (_socket.ping) {
				clearInterval(_socket.ping);
			}

			idx = _sockets.indexOf(_socket);
			_socket = null;

			if (idx !== -1) {
				_sockets.splice(idx, 1);
			}
		}
	}

	/**
	 * Define a ping
	 *
	 * @param callback
	 */
	function setPing(callback) {
		if (_socket) {
			if (_socket.ping) {
				clearInterval(_socket.ping);
			}
			_socket.ping = setInterval(callback, 10000);

			while (_sockets.length > 1) {
				if (_socket !== _sockets[0]) {
					_sockets[0].close();
					_sockets.splice(0, 1);
				}
			}
		}
	}

	/**
	 * Set a custom socket factory for plugins.
	 * The factory receives (host, port) and returns a socket.
	 * Call defaultSocketFactory(host, port) inside your factory as a fallback.
	 *
	 * @param {function|null} factory
	 */
	function setSocketFactory(factory) {
		_socketFactory = factory;
	}

	/**
	 * Get back ip from long
	 *
	 * @param {number} long ip
	 * @return {string} ip
	 */
	function utilsLongToIP(long) {
		var buf = new ArrayBuffer(4);
		var uint8 = new Uint8Array(buf);
		var uint32 = new Uint32Array(buf);
		uint32[0] = long;

		return Array.prototype.join.call(uint8, '.');
	}

	/**
	 * Convert ArryBuffer into a hex string
	 *
	 * @param {ArrayBuffer} buffer
	 */
	function utilsBufferToHexString(buffer) {
		return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0') + ' ').join('');
	}

	/**
	 * Export
	 */
	return (function Network() {
		var keys;
		var i, count;

		// Add packet version
		keys = Object.keys(PacketVersions);
		count = keys.length;

		for (i = 0; i < count; ++i) {
			PACKETVER.addSupport(keys[i], PacketVersions[keys[i]]);
		}

		// Register packets
		keys = Object.keys(PacketRegister);
		count = keys.length;

		for (i = 0; i < count; ++i) {
			registerPacket(keys[i], PacketRegister[keys[i]]);
		}

		return {
			sendPacket: sendPacket,
			send: send,
			setPing: setPing,
			connect: connect,
			hookPacket: hookPacket,
			unhookPacket: unhookPacket,
			close: close,
			read: read,
			setSocketFactory: setSocketFactory,
			defaultSocketFactory: defaultSocketFactory,
			registerPacket: registerPacket,
			utils: {
				longToIP: utilsLongToIP
			}
		};
	})();
});
