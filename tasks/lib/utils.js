 var _ots = Object.prototype.toString;
 
 module.exports = {
  _isFunction: function(obj) {
    return _ots.call(obj) == '[object Function]';
  },

  _isArray: function(obj) {
    return _ots.call(obj) == '[object Array]';
  },

  _getArray: function(arr) {
    return Array.prototype.slice.call(arr);
  },

  _each: function(arr, callback) {
    for(var i = arr.length; i--;) {
      callback(arr[i], i, arr);
    }
  },

  _trim: function(str){
    return str.replace(/(^\s*)|(\s*$)/g, '');
  },

  _clone: function(obj, deep, level) {
    var res = obj;
    deep = deep || 0;
    level = level || 0;
    if (level > deep) {
      return res;
    }
    if (typeof obj == 'object' && obj) {
      if (_isArray(obj)) {
        res = [];
        _each(obj, function(item){
          res.push(item);
        });
      } else {
        res = {};
        for(var p in obj) {
          if (obj.hasOwnProperty(p)) {
            res[p] = deep ? _clone(obj[p], deep, ++level) : obj[p];
          }
        }
      }
    }
  }
}