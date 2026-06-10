// 更新行程列表
$(document).on("update_trips", function (event) {
	var $ul = $("#trips .ui-content .ui-listview");
	var day = getDay(sessionStorage.dayID);
	// 清空历史
	$ul.empty();
	// 定义样式
	var toTime = getTimestamp();
	// 重绘内容
	for (var i in day.dayTrips) {
		// 计算进度
		var classItems = day.dayTrips[i].tripType + " ";
		var endTime = day.dayTrips[i].tripTimestamp + day.dayTrips[i].tripMinutes * 60;
		if (toTime > endTime) {
			classItems += "complete";
		} else if (toTime > day.dayTrips[i].tripTimestamp && toTime < endTime) {
			classItems += "progress";
		} else {
			classItems += "wait";
		}
		$ul.append("<li data-trip-id=\"" + day.dayTrips[i].tripID + "\" class=\"" + classItems + "\">"
				+ "<a href=\"#comments\" data-transition=\"slide\">"
				+ "<h2>" + day.dayTrips[i].tripSubject + "</h2>"
				+ "<p><span rel=\"type\"></span> about " + getStringDuration(day.dayTrips[i].tripMinutes) + "</p>"
				+ "<p class=\"ui-li-aside\">" + day.dayTrips[i].tripTime + "</p>"
				+ "</a>");
	}
	// 刷新标题
	$("#trips .ui-header h1 span").text(day.dayDate);
	// 刷新显示
	$ul.listview("refresh").trigger("updatelayout");
});

// 设置行程会话
$("#trips .ui-content").on("tap taphold swipeleft swiperight", "li", function (event) {
	sessionStorage.setItem("tripID", event.currentTarget.dataset.tripId);
});

// 清理行程会话
$("#trips a[name=new]").on("tap", function () {
	sessionStorage.removeItem("tripID");
});


// 行程更改顺序
$("#trips .ui-content ul").on("sortstop", function (event) {
	// 重新排序
	$(event.target).find("li").each(function (i) {
		setTripSort(sessionStorage.dayID, this.dataset.tripId, i);
	});
	// 保存数据
	save();
	// 刷新显示
	$(event.target).trigger("update_trips");
});

// 唤出日期选项
$("#trips .ui-content").on("swipeleft", "li", function (event) {
	var targetX = $(event.currentTarget).width();
	var targetY = $(event.currentTarget).position().top + $(event.currentTarget).height() * .5;
	$("#trip-options").popup("open", {x: targetX, y: targetY, transition: "slide"});
});

//
$("#trips").on("pagebeforeshow", function (event) {
	$(event.target).trigger("update_trips");
});

// 删除行程
$("#remove-trip a[name=delete]").on("tap", function () {
	// 删除数据
	removeTrip(sessionStorage.dayID, sessionStorage.tripID);
	// 刷新显示
	$(event.target).trigger("update_trips");
});

// 修改行程填写默认值
$("#set-trip").on("pagebeforeshow", function (event) {
	var trip = getTrip(sessionStorage.dayID, sessionStorage.tripID);
	if (trip) {
		$(event.target).find(":input[name=tripSubject]").val(trip.tripSubject).change();
		$(event.target).find(":input[name=tripType]").val(trip.tripType).change();
		$(event.target).find(":input[name=tripMinutes]").val(trip.tripMinutes).change();
		$(event.target).find(":input[name=tripContent]").val(trip.tripContent).change();
		$(event.target).removeClass("zlei-page-add").addClass("zlei-page-edit");
	} else {
		$(event.target).find(":input[name=tripSubject]").val("").change();
		$(event.target).find(":input[name=tripType]").val("").change();
		$(event.target).find(":input[name=tripMinutes]").val("").change();
		$(event.target).find(":input[name=tripContent]").val("").change();
		$(event.target).removeClass("zlei-page-edit").addClass("zlei-page-add");
	}
});

// 删除日期
$("#remove-trip").on("pagebeforeshow", function (event) {
	var trip = getTrip(sessionStorage.dayID, sessionStorage.tripID);
	if (trip) {
		$(event.currentTarget).find(".ui-title var").text(trip.tripSubject);
	} else {
		$(event.currentTarget).find(".ui-title var").text("");
	}
});

//
$("#set-trip a[name=save]").on("tap", function (event) {
	var $inputSubject = $(event.target).closest(".ui-page").find(":input[name=tripSubject]");
	var $inputType = $(event.target).closest(".ui-page").find(":input[name=tripType]");
	var $inputMinutes = $(event.target).closest(".ui-page").find(":input[name=tripMinutes]");
	var $inputContent = $(event.target).closest(".ui-page").find(":input[name=tripContent]");
	var subject = $.trim($inputSubject.val());
	var type = $inputType.val();
	var minutes = $inputMinutes.val().match(/^(\d+)(\.(\d+))?$/);
	var content = $.trim($inputContent.val());
	if (subject === "") {
		$inputSubject.focus();
		return false;
	}
	if (type === "") {
		$inputType.focus();
		return false;
	}
	if (minutes === null) {
		$inputMinutes.focus();
		return false;
	}
	var formatedMinutes = parseInt(minutes[1]);
	if (minutes[3]) {
		formatedMinutes *= 60;
		formatedMinutes += parseInt(minutes[3]);
	}
	// 定位记录
	var tripID = newID();
	if ("tripID" in sessionStorage) {
		tripID = sessionStorage.tripID;
	}
	// 添加数据
	setTrip(sessionStorage.dayID, tripID, subject, type, formatedMinutes, content);
	// 刷新显示
	$(event.target).trigger("update_trips");
});
