/**
 * 生成标识
 * @returns {String}
 */
function newID() {
	var value = "";
	var chars = "0123456789abcdef";
	for (var i = 0; i < 8; i++) {
		var o = Math.random() * chars.length;
		value += chars.substr(o, 1);
	}
	value += "-";
	for (var i = 0; i < 4; i++) {
		var o = Math.random() * chars.length;
		value += chars.substr(o, 1);
	}
	value += "-";
	for (var i = 0; i < 4; i++) {
		var o = Math.random() * chars.length;
		value += chars.substr(o, 1);
	}
	value += "-";
	for (var i = 0; i < 4; i++) {
		var o = Math.random() * chars.length;
		value += chars.substr(o, 1);
	}
	value += "-";
	var time = "00000000000" + (new Date()).getTime().toString(16);
	value += time.slice(-12);

	return value;
}