
;define("./main.tpl.html",["require","exports","module"],function(require) {var escape = function(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/`/g, '&#96;').replace(/'/g, '&#39;').replace(/"/g, '&quot;')};return {render: function(locals) {var buf = [];
with (locals || {}) { (function(){ 
 buf.push('<h1>ddd</h1>\n', escape((2, user.name)), '\n' + (function(){var buf = [];
 buf.push('<h2>aaaaa</h2>\n', escape((2, user.id)), '');
return buf.join('');})() + '\n'); })();
} 
return buf.join('');}}})
;define("./a",["require","exports","module"],function (require) {
	console.log(1111);
})
;define("js\main",["require","exports","module","./main.tpl.html","./a"],function (require) {
    var a, tpl;
    console.log(1111);
    tpl = require('./main.tpl.html');
    return a = require('./a');
  })