// 初始数据
var DATABASE = null;
var DATANAME = "HTML5APP-Plan-v1";

try {
	DATABASE = JSON.parse(localStorage.getItem(DATANAME));
} catch (err) {
	DATABASE = null;
}

function importData(val) {
	DATABASE = val;
	save();
}

function exportData() {
	if (!DATABASE) {
		return "";
	}
	var days = new Object();
	for (var d in DATABASE) {
		var trips = new Object();
		for (var t in DATABASE[d].dayTrips) {
			var comments = new Object();
			for (var c in DATABASE[d].dayTrips[t].tripComments) {
				comments[c] = {
					commentContent: DATABASE[d].dayTrips[t].tripComments[c].commentContent,
					commentCurrency: DATABASE[d].dayTrips[t].tripComments[c].commentCurrency,
					commentFees: parseFloat(DATABASE[d].dayTrips[t].tripComments[c].commentFees),
					commentID: DATABASE[d].dayTrips[t].tripComments[c].commentID,
					commentLastAltered: DATABASE[d].dayTrips[t].tripComments[c].commentLastAltered,
					commentType: DATABASE[d].dayTrips[t].tripComments[c].commentType
				};
			}
			trips[t] = {
				tripComments: comments,
				tripContent: DATABASE[d].dayTrips[t].tripContent,
				tripID: DATABASE[d].dayTrips[t].tripID,
				tripLastAltered: DATABASE[d].dayTrips[t].tripLastAltered,
				tripMinutes: parseInt(DATABASE[d].dayTrips[t].tripMinutes),
				tripSort: parseInt(DATABASE[d].dayTrips[t].tripSort),
				tripSubject: DATABASE[d].dayTrips[t].tripSubject,
				tripType: DATABASE[d].dayTrips[t].tripType
			};
		} // End Trips
		days[d] = {
			dayID: DATABASE[d].dayID,
			dayLastAltered: parseInt(DATABASE[d].dayLastAltered),
			dayTimestamp: parseInt(DATABASE[d].dayTimestamp),
			dayTrips: trips
		};
	} // End Days
	return JSON.stringify(days);
}


function pushClear(val) {
	if (typeof (val) !== "string") {
		return;
	}
	if (val.length !== 36) {
		return;
	}
	var queue = localStorage.getItem(DATANAME + "(clearObjects)");
	queue || localStorage.removeItem(DATANAME + "(clearObjects)");
	queue || (queue = "");
	localStorage.setItem(DATANAME + "(clearObjects)", queue + val);
}

function popClears() {
	var objects = localStorage.getItem(DATANAME + "(clearObjects)");
	if (objects) {
		localStorage.removeItem(DATANAME + "(clearObjects)");
		return objects;
	}
	return "";
}

function sync() {
	$.ajax({
		cache: false,
		data: {module: "HTML5APP.Plans", data: exportData(), clears: popClears()},
		dataType: "json",
		success: function (val) {
			importData(val);
		},
		timeout: 5000,
		// type: "post",
		url: "data.json"
	});
}

/**
 *
 * @returns {undefined}
 */
function save() {
	if (!DATABASE) {
		return null;
	}
	// 优化数据
	sort();
	// 本地保存
	localStorage.removeItem(DATANAME);
	localStorage.setItem(DATANAME, JSON.stringify(DATABASE));
//	console.log(JSON.stringify(DATABASE, "\r\n", "    "));
//	console.info("Saved");
}

/**
 *
 * @param {String} datetime
 * @returns {undefined}
 */
function setDay(dayID, datetime) {
	if (!DATABASE) {
		return;
	}
	// 实例数据
	var item = new Object();
	item.dayID = dayID;
	item.dayDate = null;
	item.dayTime = null;
	item.dayTimestamp = getTimestamp(datetime);
	item.dayComments = "";
	item.dayTrips = new Object();
	item.dayLastAltered = getTimestamp();
	// 还原数据
	if (item.dayID in DATABASE) {
		var old = DATABASE[dayID];
		item.dayTrips = old.dayTrips;
	}
	// 保存数据
	DATABASE[dayID] = item;
	// 重新排序
	save();
	// 输出结果
	console.log(item);
}

/**
 *
 * @param {String} dayID
 * @returns {undefined}
 */
function removeDay(dayID) {
	if (dayID && dayID in DATABASE) {
		delete DATABASE[sessionStorage.dayID];
		// 记录清理 & 保存数据
		pushClear(dayID) || save();
	}
}

function getDay(dayID) {
	if (dayID && dayID in DATABASE) {
		return DATABASE[dayID];
	}
	return false;
}

function getDays() {
	return DATABASE;
}

function setTrip(dayID, tripID, subject, type, minutes, content) {
	// 实例数据
	var item = new Object();
	item.tripID = tripID;
	item.tripSubject = subject;
	item.tripContent = content;
	item.tripType = type;
	item.tripMinutes = minutes;
	item.tripTimestamp = 0;
	item.tripSort = getTimestamp();
	item.tripComments = new Object();
	item.tripLastAltered = getTimestamp();
	// 还原数据
	if (item.tripID in DATABASE[dayID].dayTrips) {
		var old = DATABASE[dayID].dayTrips[tripID];
		item.tripSort = old.tripSort;
		item.tripComments = old.tripComments;
	}
	// 保存数据
	DATABASE[dayID].dayTrips[tripID] = item;
	// 保存数据
	save();
	// 输出结果
	console.log(item);
}

function setTripSort(dayID, tripID, sort) {
	if (typeof (sort) !== "number") {
		return;
	}
	if (dayID && dayID in DATABASE) {
		if (tripID && tripID in DATABASE[dayID].dayTrips) {
			if (DATABASE[dayID].dayTrips[tripID].tripSort === sort) {
				return;
			}
			DATABASE[dayID].dayTrips[tripID].tripSort = sort;
			DATABASE[dayID].dayTrips[tripID].tripLastAltered = getTimestamp();
		}
	}
}

function removeTrip(dayID, tripID) {
	if (dayID && dayID in DATABASE) {
		if (tripID && tripID in DATABASE[dayID].dayTrips) {
			delete DATABASE[dayID].dayTrips[tripID];
			// 记录清理 & 保存数据
			pushClear(tripID) || save();
		}
	}
}

function getTrip(dayID, tripID) {
	if (dayID && dayID in DATABASE) {
		if (tripID && tripID in DATABASE[dayID].dayTrips) {
			return DATABASE[dayID].dayTrips[tripID];
		}
	}
	return false;
}

function setComment(dayID, tripID, commentID, type, content, fees, currency) {
	// 实例数据
	var item = new Object();
	item.commentID = commentID;
	item.commentType = type;
	item.commentContent = content;
	item.commentFees = fees;
	item.commentCurrency = currency;
	item.commentLastAltered = getTimestamp();
	// 保存数据
	DATABASE[dayID].dayTrips[tripID].tripComments[commentID] = item;
	// 保存数据
	save();
	// 输出结果
	console.log(item);
}

function getComment(dayID, tripID, commentID) {
	if (dayID && dayID in DATABASE) {
		if (tripID && tripID in DATABASE[dayID].dayTrips) {
			if (commentID && commentID in DATABASE[dayID].dayTrips[tripID].tripComments) {
				return DATABASE[dayID].dayTrips[tripID].tripComments[commentID];
			}
		}
	}
	return false;
}

function removeComment(dayID, tripID, commentID) {
	if (dayID && dayID in DATABASE) {
		if (tripID && tripID in DATABASE[dayID].dayTrips) {
			if (commentID && commentID in DATABASE[dayID].dayTrips[tripID].tripComments) {
				delete DATABASE[dayID].dayTrips[tripID].tripComments[commentID];
				// 记录清理 & 保存数据
				pushClear(commentID) || save();
			}
		}
	}
}

function sort() {
	// 导出日期
	var days = new Array();
	for (var d in DATABASE) {
		// 导出行程
		var trips = new Array();
		for (var t in DATABASE[d].dayTrips) {
			trips.push(DATABASE[d].dayTrips[t]);
		}
		// 排序行程
		trips.sort(function (l, r) {
			return l.tripSort - r.tripSort;
		});
		// 调整字段
		var startTime = DATABASE[d].dayTimestamp;
		var sortdTrips = new Object();
		var tripPoints = new Array();
		for (var i in trips) {
			trips[i].tripSumFees = sumCommentFees(trips[i].tripComments);
			trips[i].tripSort = i;
			trips[i].tripTimestamp = startTime;
			trips[i].tripTime = getStringTime(startTime);
			if (trips[i].tripType !== "交通" && "住宿" !== trips[i].tripType) {
				tripPoints.push(trips[i].tripSubject);
			}
			sortdTrips[trips[i].tripID] = trips[i];
			startTime += trips[i].tripMinutes * 60;
		}
		// 重写数据
		DATABASE[d].dayTime = getStringTime(DATABASE[d].dayTimestamp);
		DATABASE[d].dayDate = getStringDate(DATABASE[d].dayTimestamp);
		DATABASE[d].dayComments = tripPoints.join(", ");
		DATABASE[d].dayTrips = sortdTrips;
		// 重构数据
		days.push(DATABASE[d]);
	}
	days.sort(function (l, r) {
		return l.dayTimestamp - r.dayTimestamp;
	});
	var sortdDays = new Object();
	for (var i in days) {
		days[i].dayDate = getStringDate(days[i].dayTimestamp);
		days[i].dayTime = getStringTime(days[i].dayTimestamp);
		sortdDays[days[i].dayID] = days[i];
	}
	DATABASE = sortdDays;
}

function getStringTime(timestamp) {
	if (typeof (timestamp) !== "number") {
		timestamp = getTimestamp();
	}
	var pointTime = new Date(timestamp * 1000);
	var h = pointTime.getHours();
	var m = pointTime.getMinutes();
	var val = "";
	val += ("0" + h).slice(-2);
	val += ":";
	val += ("0" + m).slice(-2);
	val += " ";
	val += (h > 12) ? "PM" : "AM";
	return val;
}

function getStringDate(timestamp) {
	if (typeof (timestamp) !== "number") {
		timestamp = getTimestamp();
	}
	var pointTime = new Date(timestamp * 1000);
	var f = pointTime.getFullYear();
	var m = pointTime.getMonth() + 1;
	var d = pointTime.getDate();
	var val = "" + f;
	val += "-";
	val += ("0" + m).slice(-2);
	val += "-";
	val += ("0" + d).slice(-2);
	return val;
}

function getTimestamp(val) {
	if (typeof (val) === "string") {
		var matches = val.match(/(\d+)-(\d+)-(\d+)T(\d+):(\d+)/);
		if (matches) {
			var datetime = new Date(
					parseInt(matches[1]), parseInt(matches[2]) - 1, parseInt(matches[3]),
					parseInt(matches[4]), parseInt(matches[5]), 0, 0);
			return Math.round(datetime.getTime() / 1000);
		}
	}
	return Math.round(new Date().getTime() / 1000);
}

function getStringDuration(val) {
	if (typeof (val) !== "number") {
		return "";
	}
	var minutes = parseInt(val);
	if (minutes === 0 && isNaN(minutes)) {
		return "";
	}
	var hours = Math.floor(minutes / 60);
	minutes = Math.ceil(minutes % 60);
	var value = "";
	if (hours > 0) {
		value += hours.toString();
		value += (hours > 1) ? " hours" : " hour";
	}
	if (minutes > 0) {
		value += hours ? " " : "";
		value += minutes.toString();
		value += (minutes > 1) ? " minutes" : " minute";
	}
	return value;
}

function text2html(val) {
	if (typeof (val) !== "string") {
		return "";
	}
	var code = "";
	var sections = val.replace(/^\s+$/m, "").split(/\n{2,}/);
	for (var s in sections) {
		code += "<p>";
		var rows = sections[s].split(/\r?\n/);
		var parts = new Array();
		for (var r in rows) {
			parts.push($("<div/>").text(rows[r]).html());
		}
		code += parts.join("<br/>");
		code += "</p>";
	}
	return code;
}

function formatMoney(val) {
	if (typeof (val) !== "number") {
		return "0.00";
	}
	var matches = (val).toFixed(2).match(/(\d+)\.(\d+)$/);
	var numbers = new Array();
	var o = matches[1].length % 3;
	var g = Math.floor(matches[1].length / 3);
	(o > 0) && numbers.push(matches[1].slice(0, o));
	for (var i = 0; i < g; i++) {
		numbers.push(matches[1].slice(o + i * 3, o + i * 3 + 3));
	}
	return numbers.join(",") + "." + matches[2];
}

function sumCommentFees(comments) {
	var fees = new Object();
	var currencies = new Array();
	for (var c in comments) {
		if (currencies.indexOf(comments[c].commentCurrency) < 0) {
			fees[comments[c].commentCurrency] = 0;
			currencies.push(comments[c].commentCurrency);
		}
		fees[comments[c].commentCurrency] += comments[c].commentFees;
	}
	currencies.sort();
	var parts = new Array();
	for (var c in currencies) {
		(fees[currencies[c]] === 0.0)
				|| parts.push(formatMoney(fees[currencies[c]]) + " " + currencies[c]);
	}
	return parts.length > 0 ? parts.join(", ") : "nothing";
}