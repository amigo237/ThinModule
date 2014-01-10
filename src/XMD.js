;(function(global) {
    var cachedMods = {};
    var cachedFiles = [];
    var callbackList = [];
    var noop = function() {};
    
    function isType(type) {
      return function(obj) {
        return {}.toString.call(obj) == "[object " + type + "]";
      }
    }

    var isObject = isType("Object");
    var isString = isType("String");
    var isArray = Array.isArray || isType("Array");
    var isFunction = isType("Function");
        
    var _cid = 0;
    function cid() {
        return _cid++;
    }
    
    var STATUS = {
        //还未从服务器获取文件
        FETCHING: 0,
        
        //已经发送请求获取文件请求
        LOADING: 1,
        
        //已经获取到文件
        LOADED: 2,
        
        //模块的factory已经执行
        EXECUTED: 3
    };
    
    function Module(uri, deps, factory) {
        this.uri = uri;
        this.dependencies = deps || [];
        this.status = 0;
        this.exports = null;
        this.factory = factory || noop;
    };
    
    Module.prototype = {
        constructor: Module,
        
        load: function(callback, context) {
            if (this.status >= STATUS.LOADING) {
                return;
            }
            
            context = context || global;
            this.status = STATUS.LOADING;
            
            ModuleManager.getScript(this.uri, function() {
                this.status = STATUS.LOADED;
                callback && callback.call(context);
            }, this);
        },
        
        exec: function() {
            var mod = this;
            if (mod.status >= STATUS.EXECUTED) {
                return;
            }
            
            mod.status = STATUS.EXECUTED;
            
            function require(id) {
                var mod = ModuleManager.get(ModuleManager.resolve(id));
                return mod.exports;
            }
            
            var factory = mod.factory;
            var exports = isFunction(factory) ? factory(require, mod.exports = {}, mod) : factory;
            if (exports === undefined) {
                exports = mod.exports;
            }
            mod.exports = exports;
        }
    };
    
    var ModuleManager = {
        base: "",
        
        alias: {},
        
        paths: {},
        
        merge: function (a, b){
            if (a && b) {
                for (var key in b) {
                    a[key] = b[key];
                }
            }
            return a;
        },
        
        config: function(conf) {
            for (var key in conf) {
                if (this[key] !== undefined) {
                    key === "base" ? this.base = conf[key] : (this[key] = this.merge(this[key], conf[key]));
                }
            }
        },
        
        get: function(uri, deps) {
            if (!cachedMods[uri]) {
                cachedMods[uri] = new Module(uri, deps);
            }
            return cachedMods[uri];
        },
        
        define: function(id, dependencies, factory) {
            var uri = ModuleManager.resolve(id);
            var mod = ModuleManager.get(uri);
            mod.dependencies = dependencies;
            mod.factory = factory;
            
            //文件获取回来，解析依赖
            var ids = dependencies;
            for (var i = 0, j = ids.length; i < j; i++) {
                var depsUri = ModuleManager.resolve(ids[i]);
                cachedFiles.push(depsUri);
            }
        },
        
        use: function(id, callback) {
            var deps = isArray(id) ? id : [id];
            var mod = this.get("anonymousModule" + cid(), deps);
            mod.status = STATUS.EXECUTED;
            
            if (isFunction(callback)) {
                mod.callback = callback;
                callbackList.push(mod);
            }
            
            for (var i = 0, j = deps.length; i < j; i++) {
                var uri = this.resolve(id[i]);
                cachedFiles.push(uri);
                this.load(uri);
            }
        },
        
        load: function(uri) {
            var mod = this.get(uri);
            
            mod.load(function() {
                if (!this.checkModulesDone()) {
                    var deps = this.get(uri).dependencies;
                    var ids = deps;
                    for (var i = 0, j = ids.length; i < j; i++) {
                        this.load(this.resolve(ids[i]));
                    }
                }
                else {
                    this.done();
                }
            }, this);
        },
        
        done: function() {
            for (var i = 0, j = cachedFiles.length - 1; j >= i; j--) {
                var mod = this.get(cachedFiles[j]);
                mod.exec();
            }
            
            for (var i = 0, j = callbackList.length; i < j; i++) {
                var mod = callbackList[i];
                var exports = [];
                
                for (var m = 0, n = mod.dependencies.length; m < n; m++) {
                    exports.push(this.get(this.resolve(mod.dependencies[m])).exports);
                }

                if (mod.callback) {
                    mod.callback.apply(global, exports);
                    delete mod.callback;
                }
            }
            
            cachedFiles = [];
            callbackList = [];
        },
        
        checkModulesDone: function() {
            for (var i = 0, j = cachedFiles.length - 1; j >= i; j--) {
                var mod = this.get(cachedFiles[j]);
                if (mod.status < STATUS.LOADED) {
                    return false;
                }
            }
            return true;
        },
        
        resolve: function(id) {
            var alias = this["alias"],
                paths = this["paths"],
                base  = this["base"],
                name = alias[id] || id,
                realpath = "";
            
            if (paths[id]) {
                realpath = paths[id] + name + ".js";
            }
            else {
                realpath = base + name + ".js";
            }
            
            return realpath;
        },
        
        getScript: function(url, callback, context) {
            context = context || global;
            var head = document.getElementsByTagName('head')[0];
            var node = document.createElement('script');
            node.type = 'text/javascript';
            node.async = 'true';
            node.src = url;
            node.onload = function() {callback.call(context)};
            head.appendChild(node);
        }
    };
    
    global.XMD = ModuleManager;
    ModuleManager.define.amd = {};
    global.define = ModuleManager.define;
})(this);