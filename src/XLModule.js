;(function(global) {
var doc = document
var head = doc.head || doc.getElementsByTagName("head")[0] || doc.documentElement
var baseElement = head.getElementsByTagName("base")[0]

var IS_CSS_RE = /\.css(?:\?|$)/i
var currentlyAddingScript
var interactiveScript

// `onload` event is not supported in WebKit < 535.23 and Firefox < 9.0
// ref:
//  - https://bugs.webkit.org/show_activity.cgi?id=38995
//  - https://bugzilla.mozilla.org/show_bug.cgi?id=185236
//  - https://developer.mozilla.org/en/HTML/Element/link#Stylesheet_load_events
var isOldWebKit = +navigator.userAgent
    .replace(/.*AppleWebKit\/(\d+)\..*/, "$1") < 536


function request(url, callback, charset) {
  var isCSS = IS_CSS_RE.test(url)
  var node = doc.createElement(isCSS ? "link" : "script")

  if (charset) {
    var cs = isFunction(charset) ? charset(url) : charset
    if (cs) {
      node.charset = cs
    }
  }

  addOnload(node, callback, isCSS, url)

  if (isCSS) {
    node.rel = "stylesheet"
    node.href = url
  }
  else {
    node.async = true
    node.src = url
  }

  // For some cache cases in IE 6-8, the script executes IMMEDIATELY after
  // the end of the insert execution, so use `currentlyAddingScript` to
  // hold current node, for deriving url in `define` call
  currentlyAddingScript = node

  // ref: #185 & http://dev.jquery.com/ticket/2709
  baseElement ?
      head.insertBefore(node, baseElement) :
      head.appendChild(node)

  currentlyAddingScript = null
}

function addOnload(node, callback, isCSS, url) {
  var supportOnload = "onload" in node

  // for Old WebKit and Old Firefox
  if (isCSS && (isOldWebKit || !supportOnload)) {
    setTimeout(function() {
      pollCss(node, callback)
    }, 1) // Begin after node insertion
    return
  }

  if (supportOnload) {
    node.onload = onload
    node.onerror = function() {
      // emit("error", { uri: url, node: node })
      onload()
    }
  }
  else {
    node.onreadystatechange = function() {
      if (/loaded|complete/.test(node.readyState)) {
        onload()
      }
    }
  }

  function onload() {
    // Ensure only run once and handle memory leak in IE
    node.onload = node.onerror = node.onreadystatechange = null

    // Remove the script to reduce memory leak
    if (!isCSS) {
      head.removeChild(node)
    }

    // Dereference the node
    node = null

    callback()
  }
}

function pollCss(node, callback) {
  var sheet = node.sheet
  var isLoaded

  // for WebKit < 536
  if (isOldWebKit) {
    if (sheet) {
      isLoaded = true
    }
  }
  // for Firefox < 9.0
  else if (sheet) {
    try {
      if (sheet.cssRules) {
        isLoaded = true
      }
    } catch (ex) {
      // The value of `ex.name` is changed from "NS_ERROR_DOM_SECURITY_ERR"
      // to "SecurityError" since Firefox 13.0. But Firefox is less than 9.0
      // in here, So it is ok to just rely on "NS_ERROR_DOM_SECURITY_ERR"
      if (ex.name === "NS_ERROR_DOM_SECURITY_ERR") {
        isLoaded = true
      }
    }
  }

  setTimeout(function() {
    if (isLoaded) {
      // Place callback here to give time for style rendering
      callback()
    }
    else {
      pollCss(node, callback)
    }
  }, 20)
}

function getCurrentScript() {
  if (currentlyAddingScript) {
    return currentlyAddingScript
  }

  // For IE6-9 browsers, the script onload event may not fire right
  // after the script is evaluated. Kris Zyp found that it
  // could query the script nodes and the one that is in "interactive"
  // mode indicates the current script
  // ref: http://goo.gl/JHfFW
  if (interactiveScript && interactiveScript.readyState === "interactive") {
    return interactiveScript
  }

  var scripts = head.getElementsByTagName("script")

  for (var i = scripts.length - 1; i >= 0; i--) {
    var script = scripts[i]
    if (script.readyState === "interactive") {
      interactiveScript = script
      return interactiveScript
    }
  }
}

    var cachedMods = {};
    var fetchingList = {};
    var callbackList = {};
    
    var STATUS = {
        // 1 - The `module.uri` is being fetched
        FETCHING: 1,
        // 2 - The meta data has been saved to cachedMods
        SAVED: 2,
        // 3 - The `module.dependencies` are being loaded
        LOADING: 3,
        // 4 - The module are ready to execute
        LOADED: 4,
        // 5 - The module is being executed
        EXECUTING: 5,
        // 6 - The `module.exports` is available
        EXECUTED: 6
    };
    
    function Module(uri, deps) {
        this.uri = uri;
        this.dependencies = deps || [];
        this.exports = null;
        this.status = 0;
        this._waitings = {};
        this._remain = 0;
    };
    
    Module.prototype.load = function() {
        var mod = this;

        if (mod.status >= STATUS.LOADING) {
            return;
        }

        mod.status = STATUS.LOADING;
        var ids = mod.dependencies;
        var len = mod._remain = ids.length;
        var m;

        for (var i = 0; i < len; i++) {
            m = ModuleManager.get(ModuleManager.resolve(ids[i]));
            if (m.status < STATUS.LOADED) {
              m._waitings[mod.uri] = (m._waitings[mod.uri] || 0) + 1;
            }
            else {
              mod._remain--;
            }
        }

        if (mod._remain === 0) {
            mod.onload();
            return;
        }

        var requestCache = {};
        for (i = 0; i < len; i++) {
            m = cachedMods[ModuleManager.resolve(ids[i])];

            if (m.status < STATUS.FETCHING) {
                m.fetch(requestCache);
            }
            else if (m.status === STATUS.SAVED) {
                m.load()
            }
        }

        for (var requestUri in requestCache) {
            if (requestCache.hasOwnProperty(requestUri)) {
              requestCache[requestUri]();
            }
        }
    }
    
    Module.prototype.onload = function() {
        var mod = this;
        mod.status = STATUS.LOADED;

        if (mod.callback) {
            mod.callback();
        }

        var waitings = mod._waitings;
        var uri, m;

        for (uri in waitings) {
            if (waitings.hasOwnProperty(uri)) {
              m = cachedMods[uri];
              m._remain -= waitings[uri];
              if (m._remain === 0) {
                  m.onload();
              }
            }
        }

        delete mod._waitings;
        delete mod._remain;
    }

    Module.prototype.fetch = function(requestCache) {
        var mod = this;
        var uri = mod.uri;

        mod.status = STATUS.FETCHING;

        var emitData = { uri: uri };
        var requestUri = emitData.requestUri || uri;

        if (fetchingList[requestUri]) {
            callbackList[requestUri].push(mod);
            return;
        }

        fetchingList[requestUri] = true;
        callbackList[requestUri] = [mod];
        
        emitData = {
            uri: uri,
            requestUri: requestUri,
            onRequest: onRequest
        };

        if (!emitData.requested) {
            requestCache ? requestCache[emitData.requestUri] = sendRequest : sendRequest();
        }

        function sendRequest() {
            // ModuleManager.getScript(emitData.requestUri, emitData.onRequest);
            request(emitData.requestUri, emitData.onRequest, emitData.charset)
        }

        function onRequest() {
            delete fetchingList[requestUri];
            
            console.dir("onRequest");
            // Call callbacks
            var m, mods = callbackList[requestUri];
            delete callbackList[requestUri];
            while ((m = mods.shift())) {
                m.load();
            }
        }
    }
    
    Module.prototype.exec = function () {
        var mod = this;

        if (mod.status >= STATUS.EXECUTING) {
            return mod.exports;
        }

        mod.status = STATUS.EXECUTING;

        // Create require
        var uri = mod.uri

        function require(id) {
            return ModuleManager.get(ModuleManager.resolve(id)).exec();
        }

        var factory = mod.factory;
        var exports = typeof factory == "function" ? factory(require, mod.exports = {}, mod) : factory;

        if (exports === undefined) {
            exports = mod.exports;
        }

        delete mod.factory;
        mod.exports = exports;
        mod.status = STATUS.EXECUTED;

        return exports;
    }

    var ModuleManager = {
        config: {},
        
        get: function(uri, deps) {
            return cachedMods[uri] || (cachedMods[uri] = new Module(uri, deps));
        },
        
        save: function(uri, meta) {
            var mod = this.get(uri);
            
            if (mod.status < STATUS.SAVED) {
                mod.id = meta.id || uri;
                mod.dependencies = meta.deps || [];
                mod.factory = meta.factory;
                mod.status = STATUS.SAVED;
            }
        },
        
        resolve: function(id) {
            return this.config["base"] + id + ".js";
        },
        
        define: function(id, dependencies, factory) {
            console.dir("define");
            var self = this;
            var meta = {
                id: id,
                uri: ModuleManager.resolve(id),
                deps: dependencies,
                factory: factory
            };

            ModuleManager.save(meta.uri, meta);
           // ModuleManager.get(id, dependencies).load();
        },
        
        require: function(id) {
            var mod = this.exec(id);
            return mod.exports;
        },
        
        use: function(id) {
            var self = this;
            var uri = this.resolve(id);
            var mod = this.get("BeginModule", [id]);

            mod.callback = function() {
                var exports = [];
                var ids = mod.dependencies;
                for (var i = 0, len = ids.length; i < len; i++) {
                    exports[i] = cachedMods[self.resolve(ids[i])].exec();
                }
                delete mod.callback;
            }
            mod.load();
        },
        
        getScript: function(url, callback) {
            var head = document.getElementsByTagName('head')[0];
            var node = document.createElement('script');
            node.type = 'text/javascript';
            node.async = 'true';
            node.src = url;
            node.onload = callback.call(this);
            head.appendChild(node);
        }
    };
    
    global.XLModule = ModuleManager;
    global.define = ModuleManager.define;
})(this);