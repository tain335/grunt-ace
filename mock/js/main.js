(function() {
  define(function(require) {
    var a, tpl;
    console.log(1111);
    tpl = require('./main.tpl.html');
    return a = require('./a');
  });

}).call(this);
