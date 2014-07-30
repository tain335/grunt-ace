var fs = require('fs');
var path = require('path');
var vm =  require('vm');
var util = require('util');
var cp = require('child_process');
var utils = require('./lib/utils');
var config = require('./lib/config');
var grunt = require('grunt');
var async =  require('async');
var mkdirp = require('mkdirp');
var glob = require('glob');
var minimatch = require('minimatch');
var beautify = require('js-beautify');
var CleanCSS = require('clean-css');
var CoffeeScript = require('coffee-script');
var Less = require('less');
var linefeed = grunt.util.linefeed;
var multiCommentRegExp = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/g;
var siglCommentRegExp = /\/\/.*$/mg;
var cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g;
var srcRegExp = /<!--\s*(require|include)\s+(['"])([^'"]+)(['"])\s*-->/g;
//var importRegExp = /^\s*@import\s+["']([^"']+)['"]\s*;$/mg
var fnwrap = ['(function(define){','})(define)'];
var tplwrap = ['(function(define){define(function(require){', '});})(define)'];
var scriptwrap = [linefeed + '<script type="text/javascript">' + linefeed, linefeed + '</script>' + linefeed];
var stylewrap = [linefeed + '<style type="text/css">' + linefeed, linefeed + '</style>' + linefeed];
var moduleCache = {};
var opts = {};
var requireCfg = {};
var requireMock = {
	define: function (name, deps, callback) {
		var _path = requireMock.path;
        //Allow for anonymous modules
        if (typeof name !== 'string') {
            //Adjust args appropriately
            callback = deps;
            deps = name;
            name = null;
        }

        //This module may not have dependencies
        if (!utils._isArray(deps)) {
            callback = deps;
            deps = null;
        }

        //If no name, and callback is a function, then figure out 
        //CommonJS thing with dependencies.
        if (!deps && utils._isFunction(callback)) {
            deps = [];
            if (callback.length) {
                callback
                    .toString()
                    .replace(multiCommentRegExp, '')
                    .replace(siglCommentRegExp, '')
                    .replace(cjsRequireRegExp, function (match, dep) {
                    	var _depath = _resolveDependency(_path, dep, '.js');
                    	moduleCache[_path].deps.push({path: _depath, dep: dep});
                    });
            }
        }
        if (path.extname(_path) === '.js') {
        	moduleCache[_path].fn = callback;
        }
    },
    requirejs: {
    	config: function (cfg) {
    		requireCfg = cfg;
    	}
    }
}

function log() {
	grunt.log.writeln(_joint(arguments));
}

function warn() {
	grunt.log.warn(_joint(arguments));
}

function _joint(obj){
	var args = [];
	var msg = '';
	if (obj.length == 1) {		
		msg = obj[0];
	} else {		
		args = utils._getArray(obj).slice(1);
		msg = obj[0].replace(/(%s)+/g, function(){
			return args.shift();
		})
	}
	return msg;
}

function _isRelativePath(path) {
	return /^\.\.?\//.test(path);
}

function _wrapMod(content) {
	return fnwrap[0] + content + fnwrap[1];
}

function _wrapScript(content) {
	return scriptwrap[0] + content + scriptwrap[1];
}

function _wrapStyle(content) {
	return stylewrap[0] + content + stylewrap[1];
}

function _resolveDependency(main, dep, suffix) {
	var _depath;
	if (requireCfg.paths && requireCfg.paths[dep]) {
		return dep;
	}
	if (!path.extname(dep)) {
		dep += suffix;
	}
	if (_isRelativePath(dep)) {
		_depath = path.join(path.dirname(main), dep);
	} else {
		_depath = path.join(opts.root, dep);
	}
	if (!fs.existsSync(_depath)) {
		throw new Error('Error! File not exists: ' + _depath);
	}
	return _depath; 
}

function _wrapTpl(content) {
	return tplwrap[0] + content + tplwrap[1];
}

function _readFile(_path) {
	if (!fs.existsSync(_path)) {
		throw new Error('Error! File not exists: ' + _path);
	}
	return fs.readFileSync(_path, opts.encoding);
}

function _checkIngoreList(_path) {
	if (opts.ignores) {
		for (var i = opts.ignores.length; i--;) {
			if (minimatch(_path, path.join(opts.root, opts.ignores[i]), {dot: true})) {
				return true;
			}
		}
	}
	return false;
}

function _resolveSrcRequire(_path) {
	moduleCache[_path].fn.replace(srcRegExp, function(m, $1, $2, $3, $4) {
		if (path.extname($3) && (/\.js$/.test($3) || /\.tpl\.html$/.test($3))) {
			return '';
		}
		var _depath = _resolveDependency(_path, $3, '.js');
		if ($1 == 'require') {
			moduleCache[_path].deps.push({path: _depath, dep: $3, indeep:true});
		} else {
			moduleCache[_path].deps.push({path: _depath, dep: $3, indeep:false});
		}
		return '';
	})
}

function _resolveRequire(_path) {
	var content = '';
	if (!(path.extname(_path) == '.js'|| path.extname(_path) == '.css' || /\.tpl\.html$/.test(_path) || /\.src\.html$/.test(_path))) {
		return;
	}
	if (_checkIngoreList(_path)) {
		return;
	}
	content = _readFile(_path);
	requireMock.path = _path;
	if (path.extname(_path) == '.js') {
		if (!moduleCache[_path]) {
			moduleCache[_path] = {fn:function(){}, deps:[]};
		}
		content = _wrapMod(content);
	} else if (/\.tpl\.html$/.test(_path)) {
		if (!moduleCache[_path]) {
			moduleCache[_path] = {fn:'function(require){}',deps:[]};
		}
		content = praseTpl(content, {filename:_path, compileDebug: false,_with:true, consumeEOL: true, encoding: opts.encoding});
		moduleCache[_path].fn = 'function(require){return {render: function(locals) {' + content + '}}}';
		content = _wrapTpl(content);
	} else if (/\.src\.html$/.test(_path)) {
		if (!moduleCache[_path]) {
			moduleCache[_path] = {fn: content, deps: []};
		}
		_resolveSrcRequire(_path);
		return;
	} else {
		if (!moduleCache[_path]) {
			moduleCache[_path] = {fn: function(){}, deps:[]};
		}
		return;
	}
	vm.runInNewContext(content, requireMock);
}

function _compileFile(_path, callback) {
	var ext = path.extname(_path);
	var content = fs.readFileSync(_path, opts.encoding);
	if (ext === '.coffee') {
		fs.writeFile(_path.replace('.coffee', '.js'), CoffeeScript.compile(content), {encoding: opts.encoding}, function(err) {
			callback(err);
		});
	} else if (ext === '.less') {
		/*
		var paths = [];
		content.replace(importRegExp, function(m, $1) {
			paths.push(path.join(path.dirname(_path), $1));
			return m;
		});*/
		Less.render(content, {
			paths: ['/home/paul/tain335/ace/modMock'],
			filename: _path
		}, function(err, css) {
			if (err) {
				callback(err);
			} else {
				fs.writeFileSync(_path.replace('.less', '.css'), css, opts.encoding);
				callback();
			}	
		});
	} else {
		callback();
	}
}

function scanFile(path, excutor, tasks) {
	var stats = fs.statSync(path);
	if (stats.isDirectory()) {
		var files = fs.readdirSync(path);
		for(var i = files.length; i--;) {
			scanFile(path + '/' + files[i], excutor, tasks);
		}
	} else {
		if (tasks) {
			tasks.push(function(callback) {
				excutor(path, callback);
			});
		} else {
			excutor(path);
		}
	}
}

function scanRoot(root, excutor, asynCallback) {
	var tasks = []
	if (fs.existsSync(root)) {
		if (fs.statSync(root).isDirectory()) {
			if (asynCallback) {
				scanFile(root, excutor, tasks);		
				async.parallel(tasks, function(err, results) {
					if (err) {
						warn(err);
					} else {
						asynCallback();
					}
				});
			} else {
				scanFile(root, excutor);
			}
		} else {
			warn('root:%s isn\'t a directory', root);
		}
	} else {
		warn('root path:%s not exist', root);
	} 
}

function combineJs() {
	for(var prop in moduleCache) {
		if (moduleCache.hasOwnProperty(prop)) {	
			var content = '';
			_combineJs.trace = {};
			_combineJs.trace[prop] = true;
			buildMainWrap.main = prop;
			for(var i = 0 ; i < moduleCache[prop].deps.length; i++) {
				var mod = moduleCache[prop].deps[i];
				if (requireCfg.paths && requireCfg.paths[mod.dep]) {
					continue;
				}
				content += _combineJs(mod.path, opts.encoding, !!mod.indeep) + buildMainWrap(mod.path, moduleCache[mod.path].deps, moduleCache[mod.path].fn, mod.dep);
			}
			moduleCache[prop].buildContent = content;
		}
	}
}

function buildDepWrap(depath, fn, name) {
	return buildMainWrap(depath, moduleCache[depath].deps, moduleCache[depath].fn, name)
}

function buildMainWrap(prop, deps, fn, name) {
	var _deps = [];
	var mod = moduleCache[prop];
	deps = deps || [];
	for(var i = 0; i < deps.length; i++) {
		_deps.push('\"' + deps[i].dep + '\"');
	}
	return beautify.js_beautify(';define(' + (name ? '\"'+ name +'\",' : "") + '[' + (mod.fn.length === 1 ? ['\"require\"'] : ['\"require\"', '\"exports\"', '\"module\"']).concat(_deps) + '],' + fn.toString() + ')', {indent_size: 2}); 
}

function _combineJs(_path, indeep) {
	var deps = moduleCache[_path].deps;
	var content = '';
	if (!deps) {
		warn('No This Module:%s', _path);
		return '';
	}
	if (!indeep) {
		return '';
	}
	for(var i = deps.length; i--;) {
		if (_combineJs.trace[deps[i].path]) {
			continue;
		} else {
			_combineJs.trace[deps[i].path] = true;
		}
		if (requireCfg.paths && requireCfg.paths[deps[i].dep]) {
			continue;
		}
		content += _combineJs(deps[i].path, true) + buildDepWrap(deps[i].path, moduleCache[deps[i].path].fn
				, _isRelativePath(deps[i].dep) ? path.relative(path.dirname(buildMainWrap.main), deps[i].path).split('.js')[0] : deps[i].dep);
	}
	return content;
}

function circleReferenceCheck() {
	if (!_depsTrace.trace) {
		_depsTrace.trace = [];
	}
	for(var prop in moduleCache) {
		if (moduleCache.hasOwnProperty(prop)) {		
			_circleReferenCheck(prop);		
		}
	}
}

function _circleReferenCheck(prop) {
	if (requireCfg.paths && requireCfg.paths[prop]) {
		return;
	}
	if (!moduleCache[prop]) {
		throw new Error('Error! Module Canot Found: ' + prop);
	}
	var deps = moduleCache[prop].deps;
	_depsTrace.trace.unshift(prop);
	for(var j = deps.length; j--;) {
		_depsTrace(deps[j].path);
	}
	_depsTrace.trace.shift();
}

function _depsTrace(mod) {
	for(var i = _depsTrace.trace.length; i-- ;) {
		if (_depsTrace.trace[i] == mod) {
			throw new Error('Error! Circle Reference: ' + mod + linefeed + _depsTrace.trace.join(linefeed));
		}
	}
	_circleReferenCheck(mod);
}

function praseTpl(str, options) {
	var options = options || {}
	, open = options.open || exports.open || '<%'
	, close = options.close || exports.close || '%>'
	, filename = options.filename
	, compileDebug = options.compileDebug !== false
	, buf = ""
	, included = !!options.included
	, consumeEOL = !!options.consumeEOL
	, encodeHtmlFn = "var $encodeHtml = function(str) { return (str + '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/`/g, '&#96;').replace(/\'/g, '&#39;').replace(/\"/g, '&quot;');}";
  	buf += ';var buf = [];';
  	if (false !== options._with) buf += 'with (locals || {}) {(function(){';
  	buf += 'buf.push(\'';
  	var lineno = 1;
  	for (var i = 0, len = str.length; i < len; ++i) {
    	var stri = str[i];
    	if (str.slice(i, open.length + i) == open) {
	      	i += open.length
	      	var prefix, postfix;
	      	switch (str[i]) {
	        	case '=':
	        		if (str[i+1] == '=') {
	        			prefix = "', $encodeHtml(";
			        	postfix = "), '";
			        	i += 2;
	        		} else {
	        			prefix = "',";
			        	postfix = ",'";
			        	++i;
	        		}        
		        	break;
	        	default:
	          		prefix = "');";
	          		postfix = "buf.push('";
	          		break;
	      	}
	      	var end = str.indexOf(close, i)
	        , js = str.substring(i, end)
	        , start = i
	        , include = null
	        , n = 0;
	      	if (0 == js.trim().indexOf('include')) {
	        	var dep = js.trim().slice(7).trim();
	        	if (!filename) throw new Error('filename option is required for tpl includes');
	        	//var _path = _resolveRefference(name, '.tpl.html');
	        	var _path = _resolveDependency(filename, dep, '.tpl.html');
	        	include = _readFile(_path);
	        	if (/\.tpl\.html$/.test(_path)) {
		        	include = arguments.callee(include, {filename: _path, _with: false, open: open, close: close, compileDebug: compileDebug, consumeEOL: consumeEOL, included: true});
		        	if (!moduleCache[_path]) {
						moduleCache[_path] = {fn:'function(require){ return { render: function(locals){' + include + '}}',deps:[]};
						requireMock.path = _path;
		        		vm.runInNewContext( _wrapTpl(include), requireMock);
					}
		        	requireMock.path = filename;
		        	buf += "' + (function(){" + include  + "})() + '";
		        } else if (/\.css$/.test(_path)) {
		        	buf += new CleanCSS().minify(stylewrap[0] + include + stylewrap[1]);
		        }
		        js = '';
	      	}
	      	while (~(n = js.indexOf("\n", n))) n++, lineno++;
	      	if (js) {
	        	buf += prefix;
	        	buf += js.trim();
	        	buf += postfix;
	      	}
	      	i += end - start + close.length - 1;
    	} else if (stri == "\\") {
      		buf += "\\\\";
    	} else if (stri == "'") {
      		buf += "\\'";
    	} else if (stri == "\r") {
      		// ignore
      		buf += "\r";
    	} else if (stri == "\n") {
      		if (!consumeEOL) {
        		buf += "\\n";
        		lineno++;
      		}
    	} else if (stri == " ") {
      		// ignore
    	} else if (stri == "\t"){
      		// ignore
    	} else {
    		buf += stri;
    	}
  	}
	if (false !== options._with) buf += "');})();}";
	else buf += "');";
	if (!included) {
		buf = encodeHtmlFn + buf;
	}
	return buf += "return buf.join('');"
};

function copyFiles(from, dest, opts) {
	var prop, _path, _dirname, _content, _insertContent = '', files; 
	for(prop in moduleCache) {
		if (moduleCache.hasOwnProperty(prop)) {
			_insertContent = '';
			_path = prop.replace(from, dest);
			_dirname = path.dirname(_path);
			if (!fs.existsSync(_dirname)) {
				mkdirp.sync(_dirname);
			}
			if (/\.src\.html$/.test(prop)) {
				_content = fs.readFileSync(prop, opts.encoding);
				opts.inserts.forEach(function(insert) {
					var file = path.join(opts.root, insert);
					file += !path.extname(file) ? '.js' : '';
					if (fs.existsSync(file)) {
						if (path.extname(file) == '.js') {
							_insertContent += scriptwrap[0] + fs.readFileSync(file, opts.encoding) + scriptwrap[1];
						} else if(path.extname(file) == '.css') {
							_insertContent += stylewrap[0] + fs.readFileSync(file, opts.encoding) + stylewrap[1];
						}
					} else {
						warn('No This File:%s', file);
					}
				})
				//.* 无法匹配换行符 [\s\S]*可以匹配包括换行符内所有字符
				_content = _content.replace(srcRegExp, function(m, $1, $2, $3, $4) {
					if (path.extname($3) && !(/\.js$/.test($3) || /\.tpl\.html$/.test($3))) {
						if ($1 !== 'require') {
							if(/\.css$/.test($3)) {
								return _wrapStyle(_readFile(_resolveDependency(prop, $3, '.css')));
							} else {
								return _readFile(_resolveDependency(prop, $3, '.css'));
							}
						} else {
							throw new Error('Only js or template file can be required! please check: ' + m);
						}
					}
					return '';
				});
				_content = _content.replace(/<body[^>]*>([\s\S]*)<\/body>/, function(match, $1) {
					return match.replace($1, _insertContent + _wrapScript(moduleCache[prop].buildContent) + $1);
				});
				fs.writeFileSync(_path.replace(/\.src\.html$/, '.html'), _content, {encoding: opts.encoding});
			} else if (/(-main|^main)\.css$/.test(path.basename(prop))) {
				fs.writeFileSync(_path, fs.readFileSync(prop, opts.encoding), {encoding: opts.encoding});
			} else if (/(-main|^main)\.js$/.test(path.basename(prop))) {
				fs.writeFileSync(_path, moduleCache[prop].buildContent + buildMainWrap(prop, moduleCache[prop].deps, moduleCache[prop].fn.toString(), path.relative(opts.root, prop).split('.js')[0]));
			}
		}
	}
	if (opts.reserves) {
		for (var i = opts.reserves.length; i--;) {
			files = glob.sync(path.join(opts.root, opts.reserves[i]));
			for (var j = files.length; j--;) {
				if (fs.statSync(files[j]).isFile()) {
					_path = files[j].replace(from, dest);
					_dirname = path.dirname(_path);
					_content = fs.readFileSync(files[j], opts.encoding);
					if (!fs.existsSync(_dirname)) {
						mkdirp.sync(_dirname);
					}
					fs.writeFileSync(_path, _content, opts.encoding);
				}
			}
		}
	}
}

function initProj(dest) {
	var _dirname;
	if (config.initDirs) {
		for(var i = config.initDirs.length; i--;) {
			_dirname = path.join(dest, config.initDirs[i]);
			if (!fs.existsSync(_dirname)) {
				mkdirp.sync(_dirname);
			}
		}
	}
}

function loadRequireCfg() {
	var content;
	if (opts.requireCfg) {
		opts.requireCfg += !path.extname(opts.requireCfg) ? '.js' : '';
		content = fs.readFileSync(path.join(opts.root, opts.requireCfg), opts.encoding);
		vm.runInNewContext(content, requireMock);
	}
}

function startTiming() {
	var time;
	log('Started at %s', grunt.template.today('yyyy-mm-dd HH:MM:ss'));
	time = process.hrtime();
	return function() {
		time = process.hrtime(time);
		log('Finshed! used %sms', time[0] * 1000 + time[1]/1e6);
	}
}

module.exports = function(grunt) {
	grunt.registerMultiTask('ace', 'ACE for package', function() {
		var stopTiming;
		opts = this.options({});
		if (!opts.root) {
			throw new Error('Root required!');
		} else if (!opts.encoding) {
			opts.encoding = 'utf-8';
		}
		var taskType = this.target.split('-')[0];
		switch(taskType) {
			case 'init':
				stopTiming = startTiming();
				initAll();
				stopTiming();
				break;
			case 'compile':
				var done = this.async();
				stopTiming = startTiming();
				compileAll(function() {
					done();
					stopTiming();
				});
				break;
			case 'build':
				this.requires('ace:compile-all');
				stopTiming = startTiming()
				buildAll();
				stopTiming();
				break;
			case 'copy':
				this.requires('ace:build-all');
				stopTiming = startTiming();
				copyAll();
				stopTiming();
				break;
			default: 
			 	break;				
		}
	});

	function initAll() {
		initProj(opts.output);
	}

	function compileAll(done) {
		scanRoot(opts.root, _compileFile, done);
	}

	function buildAll() {
		loadRequireCfg();
		scanRoot(opts.root, _resolveRequire);
		circleReferenceCheck();
	}

	function copyAll() {
		combineJs();
		copyFiles(opts.root, opts.output, opts);
	}
}