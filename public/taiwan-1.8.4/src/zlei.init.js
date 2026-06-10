$(function () {
	// 拖动行程
	$("#trips ul").sortable({handle: ".ui-li-aside", axis: "y"});
	// 全屏显示
//	if ("webkitRequestFullScreen" in document.documentElement) {
//		document.documentElement.webkitRequestFullScreen();
//	}
	// 载入数据
	sync();
});