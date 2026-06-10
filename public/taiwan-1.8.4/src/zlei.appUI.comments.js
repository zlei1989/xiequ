// 刷新日期列表
$(document).on("update_comments", function (event) {
	var $ul = $("#comments .ui-content .ui-listview");
	var trip = getTrip(sessionStorage.dayID, sessionStorage.tripID);
	// 重绘内容
	$ul.empty();
	// 生成代码
	for (var i in trip.tripComments) {
		var commentFees = "";
		if (trip.tripComments[i].commentFees > 0) {
			commentFees += ", " + formatMoney(trip.tripComments[i].commentFees) + " " + trip.tripComments[i].commentCurrency;
		}
		$ul.append("<li data-comment-id=\"" + trip.tripComments[i].commentID + "\" class=\"" + trip.tripComments[i].commentType + "\">"
				+ "<p><span rel=\"type\"></span>" + commentFees + "</p>"
				+ text2html(trip.tripComments[i].commentContent));
	}
	// 刷新显示
	$("#comments .trip-sum-fees").text(trip.tripSumFees);
	$("#comments .trip-date").text(getStringDate(trip.tripTimestamp));
	$("#comments .trip-duration").text(getStringDuration(trip.tripMinutes));
	$("#comments .trip-summaries").html(text2html(trip.tripContent));
	$("#comments>.ui-content h3").text(trip.tripSubject);
	$("#comments>.ui-header h1").text(getStringTime(trip.tripTimestamp) + ", " + trip.tripType);
	// 刷新显示
	$ul.listview("refresh").trigger("updatelayout");
});

// 设置行程会话
$("#comments .ui-content").on("tap taphold", "li", function (event) {
	sessionStorage.setItem("commentID", event.currentTarget.dataset.commentId);
});

// 清理行程会话
$("#comments a[name=new]").on("tap", function () {
	sessionStorage.removeItem("commentID");
});

// 唤出注释选项
$("#comments .ui-content").on("taphold", "li", function (event) {
	$("#comment-options").popup("open", {transition: "pop", positionTo: event.currentTarget});
});

// 唤出行程选项
$("#comments .ui-content .ui-body").on("taphold", function (event) {
	$("#trip2-options").popup("open", {transition: "pop", positionTo: event.currentTarget});
});

// 进入注释列表界面触发
$("#comments").on("pagebeforeshow", function (event) {
	$(event.target).trigger("update_comments");
});

// 删除注释
$("#remove-comment a[name=delete]").on("tap", function () {
	// 删除数据
	removeComment(sessionStorage.dayID, sessionStorage.tripID, sessionStorage.commentID);
	// 刷新显示
	$(event.target).trigger("update_comments");
});

// 修改行程填写默认值
$("#set-comment").on("pagebeforeshow", function (event) {
	var comment = getComment(sessionStorage.dayID, sessionStorage.tripID, sessionStorage.commentID);
	if (comment) {
		$(event.currentTarget).find(":input[name=commentFees]").val(parseFloat(comment.commentFees).toFixed(2)).change();
		$(event.currentTarget).find(":input[name=commentContent]").val(comment.commentContent).change();
		$(event.currentTarget).find(":input[name=commentCurrency]").val(comment.commentCurrency).change();
		$(event.currentTarget).find(":input[name=commentType]").val(comment.commentType).change();
		$(event.currentTarget).removeClass("zlei-page-add").addClass("zlei-page-edit");
	} else {
		$(event.currentTarget).find(":input[name=commentFees]").val("0.00").change();
		$(event.currentTarget).find(":input[name=commentContent]").val("").change();
		$(event.currentTarget).find(":input[name=commentType]").val("").change();
		$(event.currentTarget).removeClass("zlei-page-edit").addClass("zlei-page-add");
	}
});

// 删除日期
$("#remove-comment").on("pagebeforeshow", function (event) {
	var comment = getComment(sessionStorage.dayID, sessionStorage.tripID, sessionStorage.commentID);
	if (comment) {
		$(event.currentTarget).find(".ui-title var").text(comment.commentType);
	} else {
		$(event.currentTarget).find(".ui-title var").text("");
	}
});














$("#set-comment a[name=save]").on("tap", function (event) {
	var $inputType = $(event.target).closest(".ui-page").find(":input[name=commentType]");
	var $inputContent = $(event.target).closest(".ui-page").find(":input[name=commentContent]");
	var $inputFees = $(event.target).closest(".ui-page").find(":input[name=commentFees]");
	var $inputCurrency = $(event.target).closest(".ui-page").find(":input[name=commentCurrency]");
	var type = $inputType.val();
	var content = $.trim($inputContent.val());
	var fees = parseFloat($inputFees.val());
	var currency = $inputCurrency.val();
	if (type === "") {
		$inputType.focus();
		return false;
	}
	if (content === "") {
		$inputContent.focus();
		return false;
	}
	// 参数修正
	isNaN(fees) && (fees = 0);
	// 定位记录
	var commentID = newID();
	if ("commentID" in sessionStorage) {
		commentID = sessionStorage.commentID;
	}
	// 添加数据
	setComment(sessionStorage.dayID, sessionStorage.tripID, commentID, type, content, fees, currency);
	// 刷新显示
	$(event.target).trigger("update_comments");
});