// 刷新日期列表
$(document).on("update_days", function (event) {
	var $ul = $("#days .ui-content .ui-listview");
	var days = getDays();
	// 重绘内容
	$ul.empty();
	// 定义样式
	var toDate = getStringDate();
	var toTime = getTimestamp(new Date(toDate));
	// 生成代码
	var d = 1;
	for (var i in days) {
		// 计算进度
		var classItems = "";
		if (toDate === days[i].dayDate) {
			classItems += "progress";
		} else if (toTime > days[i].dayTimestamp) {
			classItems += "complete";
		} else {
			classItems += "wait";
		}
		$ul.append("<li data-day-id='" + days[i].dayID + "'\" class=\"" + classItems + "\">"
				+ "<a href=\"#trips\" data-transition=\"slide\">"
				+ "<h2>" + days[i].dayDate + "</h2>"
				+ "<p>" + days[i].dayComments + "</p>"
				+ "<p class=\"ui-li-aside\">" + (d++) + " DAY</p></a>");
	}
	// 刷新显示
	$ul.listview("refresh").trigger("updatelayout");
	console.log("refresh days");
});

// 设置日期会话
$("#days .ui-content").on("tap taphold swipeleft swiperight", "li", function (event) {
	sessionStorage.setItem("dayID", event.currentTarget.dataset.dayId);
});

// 清理日期会话
$("#days a[name=new]").on("tap", function (event) {
	sessionStorage.removeItem("dayID");
});

// 删除日期
$("#remove-day").on("pagebeforeshow", function (event) {
	var day = getDay(sessionStorage.dayID);
	if (day) {
		$(event.currentTarget).find(".ui-title var").text(day.dayDate);
	}
});

// 删除日期
$("#remove-day a[name=delete]").on("tap", function () {
	// 删除数据
	removeDay(sessionStorage.dayID);
	// 刷新列表
	$(event.target).trigger("update_days");
});

// 进入日期列表界面触发
$("#days").on("pagebeforeshow", function (event) {
	$(event.target).trigger("update_days");
});

// 唤出日期选项
$("#days .ui-content").on("swipeleft", "li", function (event) {
	var targetX = $(event.currentTarget).width();
	var targetY = $(event.currentTarget).position().top + $(event.currentTarget).height() * .5;
	$("#day-options").popup("open", {x: targetX, y: targetY, transition: "slide"});
});

// 修改日期填写默认值
$("#set-day").on("pagebeforeshow", function (event) {
	var day = getDay(sessionStorage.dayID);
	if (day) {
		var datetime = day.dayDate + "T" + day.dayTime.substring(0, 5) + ":00";
		$(event.target).find(":input[name=dayDatetime]").val(datetime);
		$(event.target).removeClass("zlei-page-add").addClass("zlei-page-edit");
	} else {
		$(event.target).find(":input[name=dayDatetime]").val("");
		$(event.target).removeClass("zlei-page-edit").addClass("zlei-page-add");
	}
});

// 修改创建日期
$("#set-day a[name=save]").on("tap", function (event) {
	var $input = $(event.target).closest(".ui-page").find(":input[name=dayDatetime]");
	var datetime = $input.val();
	if (datetime === "") {
		$input.focus();
		return false;
	}
	// 定位记录
	var dayID = newID();
	if ("dayID" in sessionStorage) {
		dayID = sessionStorage.dayID;
	}
	// 添加数据
	setDay(dayID, datetime);
	// 刷新列表
	$(event.target).trigger("update_days");

});

// 同步数据
$("#days a[name=sync]").on("tap", function () {
	sync();
	// 终止事件
	return false;
});

// 载入动画
$(document).ajaxStart(function () {
	$.mobile.loading("show");
});

// 刷新界面
$(document).ajaxStop(function () {
	// 刷新内容
	$(":mobile-pagecontainer").pagecontainer("getActivePage").trigger("pagebeforeshow");
	// 隐藏动画
	$.mobile.loading("hide");
});