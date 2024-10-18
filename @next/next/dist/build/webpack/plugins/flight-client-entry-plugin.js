"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "FlightClientEntryPlugin", {
    enumerable: true,
    get: function() {
        return FlightClientEntryPlugin;
    }
});
const _webpack = require("next/dist/compiled/webpack/webpack");
const _querystring = require("querystring");
const _path = /*#__PURE__*/ _interop_require_default(require("path"));
const _ondemandentryhandler = require("../../../server/dev/on-demand-entry-handler");
const _constants = require("../../../lib/constants");
const _constants1 = require("../../../shared/lib/constants");
const _utils = require("../loaders/utils");
const _utils1 = require("../utils");
const _normalizepathsep = require("../../../shared/lib/page-path/normalize-path-sep");
const _buildcontext = require("../../build-context");
const _pagetypes = require("../../../lib/page-types");
const _utils2 = require("../../utils");
const _getmodulebuildinfo = require("../loaders/get-module-build-info");
const _nextflightloader = require("../loaders/next-flight-loader");
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
const PLUGIN_NAME = "FlightClientEntryPlugin";
const pluginState = (0, _buildcontext.getProxiedPluginState)({
    // A map to track "action" -> "list of bundles".
    serverActions: {},
    edgeServerActions: {},
    actionModServerId: {},
    actionModEdgeServerId: {},
    // Mapping of resource path to module id for server/edge server.
    serverModuleIds: {},
    edgeServerModuleIds: {},
    // Collect modules from server/edge compiler in client layer,
    // and detect if it's been used, and mark it as `async: true` for react.
    // So that react could unwrap the async module from promise and render module itself.
    // Use an object to simulate Set lookup
    ASYNC_CLIENT_MODULES: {},
    injectedClientEntries: {}
});
function deduplicateCSSImportsForEntry(mergedCSSimports) {
    // If multiple entry module connections are having the same CSS import,
    // we only need to have one module to keep track of that CSS import.
    // It is based on the fact that if a page or a layout is rendered in the
    // given entry, all its parent layouts are always rendered too.
    // This can avoid duplicate CSS imports in the generated CSS manifest,
    // for example, if a page and its parent layout are both using the same
    // CSS import, we only need to have the layout to keep track of that CSS
    // import.
    // To achieve this, we need to first collect all the CSS imports from
    // every connection, and deduplicate them in the order of layers from
    // top to bottom. The implementation can be generally described as:
    // - Sort by number of `/` in the request path (the more `/`, the deeper)
    // - When in the same depth, sort by the filename (template < layout < page and others)
    // Sort the connections as described above.
    const sortedCSSImports = Object.entries(mergedCSSimports).sort((a, b)=>{
        const [aPath] = a;
        const [bPath] = b;
        const aDepth = aPath.split("/").length;
        const bDepth = bPath.split("/").length;
        if (aDepth !== bDepth) {
            return aDepth - bDepth;
        }
        const aName = _path.default.parse(aPath).name;
        const bName = _path.default.parse(bPath).name;
        const indexA = [
            "template",
            "layout"
        ].indexOf(aName);
        const indexB = [
            "template",
            "layout"
        ].indexOf(bName);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });
    const dedupedCSSImports = {};
    const trackedCSSImports = new Set();
    for (const [entryName, cssImports] of sortedCSSImports){
        for (const cssImport of cssImports){
            if (trackedCSSImports.has(cssImport)) continue;
            // Only track CSS imports that are in files that can inherit CSS.
            const filename = _path.default.parse(entryName).name;
            if ([
                "template",
                "layout"
            ].includes(filename)) {
                trackedCSSImports.add(cssImport);
            }
            if (!dedupedCSSImports[entryName]) {
                dedupedCSSImports[entryName] = [];
            }
            dedupedCSSImports[entryName].push(cssImport);
        }
    }
    return dedupedCSSImports;
}
class FlightClientEntryPlugin {
    constructor(options){
        this.dev = options.dev;
        this.appDir = options.appDir;
        this.isEdgeServer = options.isEdgeServer;
        this.assetPrefix = !this.dev && !this.isEdgeServer ? "../" : "";
        this.encryptionKey = options.encryptionKey;
    }
    apply(compiler) {
        compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation, { normalModuleFactory })=>{
            compilation.dependencyFactories.set(_webpack.webpack.dependencies.ModuleDependency, normalModuleFactory);
            compilation.dependencyTemplates.set(_webpack.webpack.dependencies.ModuleDependency, new _webpack.webpack.dependencies.NullDependency.Template());
        });
        compiler.hooks.finishMake.tapPromise(PLUGIN_NAME, (compilation)=>this.createClientEntries(compiler, compilation));
        compiler.hooks.afterCompile.tap(PLUGIN_NAME, (compilation)=>{
            const recordModule = (modId, mod)=>{
                var _mod_resourceResolveData, _mod_resourceResolveData1;
                // Match Resource is undefined unless an import is using the inline match resource syntax
                // https://webpack.js.org/api/loaders/#inline-matchresource
                const modPath = mod.matchResource || ((_mod_resourceResolveData = mod.resourceResolveData) == null ? void 0 : _mod_resourceResolveData.path);
                const modQuery = ((_mod_resourceResolveData1 = mod.resourceResolveData) == null ? void 0 : _mod_resourceResolveData1.query) || "";
                // query is already part of mod.resource
                // so it's only necessary to add it for matchResource or mod.resourceResolveData
                const modResource = modPath ? modPath.startsWith(_constants1.BARREL_OPTIMIZATION_PREFIX) ? (0, _utils1.formatBarrelOptimizedResource)(mod.resource, modPath) : modPath + modQuery : mod.resource;
                if (mod.layer !== _constants.WEBPACK_LAYERS.serverSideRendering) {
                    return;
                }
                // Check mod resource to exclude the empty resource module like virtual module created by next-flight-client-entry-loader
                if (typeof modId !== "undefined" && modResource) {
                    // Note that this isn't that reliable as webpack is still possible to assign
                    // additional queries to make sure there's no conflict even using the `named`
                    // module ID strategy.
                    let ssrNamedModuleId = _path.default.relative(compiler.context, modResource);
                    if (!ssrNamedModuleId.startsWith(".")) {
                        // TODO use getModuleId instead
                        ssrNamedModuleId = `./${(0, _normalizepathsep.normalizePathSep)(ssrNamedModuleId)}`;
                    }
                    if (this.isEdgeServer) {
                        pluginState.edgeServerModuleIds[ssrNamedModuleId.replace(/\/next\/dist\/esm\//, "/next/dist/")] = modId;
                    } else {
                        pluginState.serverModuleIds[ssrNamedModuleId] = modId;
                    }
                }
            };
            (0, _utils1.traverseModules)(compilation, (mod, _chunk, _chunkGroup, modId)=>{
                if (mod && mod.resource && !(0, _utils2.isWebpackServerOnlyLayer)(mod.layer)) {
                    if (compilation.moduleGraph.isAsync(mod)) {
                        // The module must has resolved resource path so it's not a new entry created with loader.
                        // Checking the module layer to make sure it's from client layers (SSR or browser, not RSC).
                        pluginState.ASYNC_CLIENT_MODULES[mod.resource] = true;
                    }
                }
                if (modId) recordModule(modId, mod);
            });
        });
        compiler.hooks.make.tap(PLUGIN_NAME, (compilation)=>{
            compilation.hooks.processAssets.tapPromise({
                name: PLUGIN_NAME,
                stage: _webpack.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH
            }, (assets)=>this.createActionAssets(compilation, assets));
        });
    }
    async createClientEntries(compiler, compilation) {
        const addClientEntryAndSSRModulesList = [];
        const createdSSRDependenciesForEntry = {};
        const addActionEntryList = [];
        const actionMapsPerEntry = {};
        const createdActions = new Set();
        // For each SC server compilation entry, we need to create its corresponding
        // client component entry.
        (0, _utils1.forEachEntryModule)(compilation, ({ name, entryModule })=>{
            const internalClientComponentEntryImports = {};
            const actionEntryImports = new Map();
            const clientEntriesToInject = [];
            const mergedCSSimports = {};
            for (const connection of (0, _utils1.getModuleReferencesInOrder)(entryModule, compilation.moduleGraph)){
                // Entry can be any user defined entry files such as layout, page, error, loading, etc.
                const entryRequest = connection.dependency.request;
                const { clientComponentImports, actionImports, cssImports } = this.collectComponentInfoFromServerEntryDependency({
                    entryRequest,
                    compilation,
                    resolvedModule: connection.resolvedModule
                });
                actionImports.forEach(([dep, names])=>actionEntryImports.set(dep, names));
                const isAbsoluteRequest = _path.default.isAbsolute(entryRequest);
                // Next.js internals are put into a separate entry.
                if (!isAbsoluteRequest) {
                    Object.keys(clientComponentImports).forEach((value)=>internalClientComponentEntryImports[value] = new Set());
                    continue;
                }
                // TODO-APP: Enable these lines. This ensures no entrypoint is created for layout/page when there are no client components.
                // Currently disabled because it causes test failures in CI.
                // if (clientImports.length === 0 && actionImports.length === 0) {
                //   continue
                // }
                const relativeRequest = isAbsoluteRequest ? _path.default.relative(compilation.options.context, entryRequest) : entryRequest;
                // Replace file suffix as `.js` will be added.
                const bundlePath = (0, _normalizepathsep.normalizePathSep)(relativeRequest.replace(/\.[^.\\/]+$/, "").replace(/^src[\\/]/, ""));
                Object.assign(mergedCSSimports, cssImports);
                clientEntriesToInject.push({
                    compiler,
                    compilation,
                    entryName: name,
                    clientComponentImports,
                    bundlePath,
                    absolutePagePath: entryRequest
                });
                // The webpack implementation of writing the client reference manifest relies on all entrypoints writing a page.js even when there is no client components in the page.
                // It needs the file in order to write the reference manifest for the path in the `.next/server` folder.
                // TODO-APP: This could be better handled, however Turbopack does not have the same problem as we resolve client components in a single graph.
                if (name === `app${_constants1.UNDERSCORE_NOT_FOUND_ROUTE_ENTRY}` && bundlePath === "app/not-found") {
                    clientEntriesToInject.push({
                        compiler,
                        compilation,
                        entryName: name,
                        clientComponentImports: {},
                        bundlePath: `app${_constants1.UNDERSCORE_NOT_FOUND_ROUTE_ENTRY}`,
                        absolutePagePath: entryRequest
                    });
                }
            }
            // Make sure CSS imports are deduplicated before injecting the client entry
            // and SSR modules.
            const dedupedCSSImports = deduplicateCSSImportsForEntry(mergedCSSimports);
            for (const clientEntryToInject of clientEntriesToInject){
                const injected = this.injectClientEntryAndSSRModules({
                    ...clientEntryToInject,
                    clientImports: {
                        ...clientEntryToInject.clientComponentImports,
                        ...(dedupedCSSImports[clientEntryToInject.absolutePagePath] || []).reduce((res, curr)=>{
                            res[curr] = new Set();
                            return res;
                        }, {})
                    }
                });
                // Track all created SSR dependencies for each entry from the server layer.
                if (!createdSSRDependenciesForEntry[clientEntryToInject.entryName]) {
                    createdSSRDependenciesForEntry[clientEntryToInject.entryName] = [];
                }
                createdSSRDependenciesForEntry[clientEntryToInject.entryName].push(injected[2]);
                addClientEntryAndSSRModulesList.push(injected);
            }
            // Create internal app
            addClientEntryAndSSRModulesList.push(this.injectClientEntryAndSSRModules({
                compiler,
                compilation,
                entryName: name,
                clientImports: {
                    ...internalClientComponentEntryImports
                },
                bundlePath: _constants1.APP_CLIENT_INTERNALS
            }));
            if (actionEntryImports.size > 0) {
                if (!actionMapsPerEntry[name]) {
                    actionMapsPerEntry[name] = new Map();
                }
                actionMapsPerEntry[name] = new Map([
                    ...actionMapsPerEntry[name],
                    ...actionEntryImports
                ]);
            }
        });
        for (const [name, actionEntryImports] of Object.entries(actionMapsPerEntry)){
            for (const [dep, actionNames] of actionEntryImports){
                for (const actionName of actionNames){
                    createdActions.add(name + "@" + dep + "@" + actionName);
                }
            }
            addActionEntryList.push(this.injectActionEntry({
                compiler,
                compilation,
                actions: actionEntryImports,
                entryName: name,
                bundlePath: name
            }));
        }
        // Invalidate in development to trigger recompilation
        const invalidator = (0, _ondemandentryhandler.getInvalidator)(compiler.outputPath);
        // Check if any of the entry injections need an invalidation
        if (invalidator && addClientEntryAndSSRModulesList.some(([shouldInvalidate])=>shouldInvalidate === true)) {
            invalidator.invalidate([
                _constants1.COMPILER_NAMES.client
            ]);
        }
        // Client compiler is invalidated before awaiting the compilation of the SSR client component entries
        // so that the client compiler is running in parallel to the server compiler.
        await Promise.all(addClientEntryAndSSRModulesList.map((addClientEntryAndSSRModules)=>addClientEntryAndSSRModules[1]));
        // Wait for action entries to be added.
        await Promise.all(addActionEntryList);
        const addedClientActionEntryList = [];
        const actionMapsPerClientEntry = {};
        // We need to create extra action entries that are created from the
        // client layer.
        // Start from each entry's created SSR dependency from our previous step.
        for (const [name, ssrEntryDependencies] of Object.entries(createdSSRDependenciesForEntry)){
            // Collect from all entries, e.g. layout.js, page.js, loading.js, ...
            // add aggregate them.
            const actionEntryImports = this.collectClientActionsFromDependencies({
                compilation,
                dependencies: ssrEntryDependencies
            });
            if (actionEntryImports.size > 0) {
                if (!actionMapsPerClientEntry[name]) {
                    actionMapsPerClientEntry[name] = new Map();
                }
                actionMapsPerClientEntry[name] = new Map([
                    ...actionMapsPerClientEntry[name],
                    ...actionEntryImports
                ]);
            }
        }
        for (const [name, actionEntryImports] of Object.entries(actionMapsPerClientEntry)){
            // If an action method is already created in the server layer, we don't
            // need to create it again in the action layer.
            // This is to avoid duplicate action instances and make sure the module
            // state is shared.
            let remainingClientImportedActions = false;
            const remainingActionEntryImports = new Map();
            for (const [dep, actionNames] of actionEntryImports){
                const remainingActionNames = [];
                for (const actionName of actionNames){
                    const id = name + "@" + dep + "@" + actionName;
                    if (!createdActions.has(id)) {
                        remainingActionNames.push(actionName);
                    }
                }
                if (remainingActionNames.length > 0) {
                    remainingActionEntryImports.set(dep, remainingActionNames);
                    remainingClientImportedActions = true;
                }
            }
            if (remainingClientImportedActions) {
                addedClientActionEntryList.push(this.injectActionEntry({
                    compiler,
                    compilation,
                    actions: remainingActionEntryImports,
                    entryName: name,
                    bundlePath: name,
                    fromClient: true
                }));
            }
        }
        await Promise.all(addedClientActionEntryList);
    }
    collectClientActionsFromDependencies({ compilation, dependencies }) {
        // action file path -> action names
        const collectedActions = new Map();
        // Keep track of checked modules to avoid infinite loops with recursive imports.
        const visitedModule = new Set();
        const visitedEntry = new Set();
        const collectActions = ({ entryRequest, resolvedModule })=>{
            const collectActionsInDep = (mod)=>{
                if (!mod) return;
                const modResource = getModuleResource(mod);
                if (!modResource || visitedModule.has(modResource)) return;
                visitedModule.add(modResource);
                const actions = (0, _utils.getActionsFromBuildInfo)(mod);
                if (actions) {
                    collectedActions.set(modResource, actions);
                }
                (0, _utils1.getModuleReferencesInOrder)(mod, compilation.moduleGraph).forEach((connection)=>{
                    collectActionsInDep(connection.resolvedModule);
                });
            };
            // Don't traverse the module graph anymore once hitting the action layer.
            if (entryRequest && !entryRequest.includes("next-flight-action-entry-loader")) {
                // Traverse the module graph to find all client components.
                collectActionsInDep(resolvedModule);
            }
        };
        for (const entryDependency of dependencies){
            const ssrEntryModule = compilation.moduleGraph.getResolvedModule(entryDependency);
            for (const connection of (0, _utils1.getModuleReferencesInOrder)(ssrEntryModule, compilation.moduleGraph)){
                const depModule = connection.dependency;
                const request = depModule.request;
                // It is possible that the same entry is added multiple times in the
                // connection graph. We can just skip these to speed up the process.
                if (visitedEntry.has(request)) continue;
                visitedEntry.add(request);
                collectActions({
                    entryRequest: request,
                    resolvedModule: connection.resolvedModule
                });
            }
        }
        return collectedActions;
    }
    collectComponentInfoFromServerEntryDependency({ entryRequest, compilation, resolvedModule }) {
        // Keep track of checked modules to avoid infinite loops with recursive imports.
        const visited = new Set();
        // Info to collect.
        const clientComponentImports = {};
        const actionImports = [];
        const CSSImports = new Set();
        const filterClientComponents = (mod, importedIdentifiers)=>{
            if (!mod) return;
            const isCSS = (0, _utils.isCSSMod)(mod);
            const modResource = getModuleResource(mod);
            if (!modResource) return;
            if (visited.has(modResource)) {
                if (clientComponentImports[modResource]) {
                    addClientImport(mod, modResource, clientComponentImports, importedIdentifiers, false);
                }
                return;
            }
            visited.add(modResource);
            const actions = (0, _utils.getActionsFromBuildInfo)(mod);
            if (actions) {
                actionImports.push([
                    modResource,
                    actions
                ]);
            }
            const webpackRuntime = this.isEdgeServer ? _constants1.EDGE_RUNTIME_WEBPACK : _constants1.DEFAULT_RUNTIME_WEBPACK;
            if (isCSS) {
                const sideEffectFree = mod.factoryMeta && mod.factoryMeta.sideEffectFree;
                if (sideEffectFree) {
                    const unused = !compilation.moduleGraph.getExportsInfo(mod).isModuleUsed(webpackRuntime);
                    if (unused) return;
                }
                CSSImports.add(modResource);
            } else if ((0, _utils.isClientComponentEntryModule)(mod)) {
                if (!clientComponentImports[modResource]) {
                    clientComponentImports[modResource] = new Set();
                }
                addClientImport(mod, modResource, clientComponentImports, importedIdentifiers, true);
                return;
            }
            (0, _utils1.getModuleReferencesInOrder)(mod, compilation.moduleGraph).forEach((connection)=>{
                var _connection_dependency;
                let dependencyIds = [];
                // `ids` are the identifiers that are imported from the dependency,
                // if it's present, it's an array of strings.
                if ((_connection_dependency = connection.dependency) == null ? void 0 : _connection_dependency.ids) {
                    dependencyIds.push(...connection.dependency.ids);
                } else {
                    dependencyIds = [
                        "*"
                    ];
                }
                filterClientComponents(connection.resolvedModule, dependencyIds);
            });
        };
        // Traverse the module graph to find all client components.
        filterClientComponents(resolvedModule, []);
        return {
            clientComponentImports,
            cssImports: CSSImports.size ? {
                [entryRequest]: Array.from(CSSImports)
            } : {},
            actionImports
        };
    }
    injectClientEntryAndSSRModules({ compiler, compilation, entryName, clientImports, bundlePath, absolutePagePath }) {
        let shouldInvalidate = false;
        const loaderOptions = {
            modules: Object.keys(clientImports).sort((a, b)=>_utils.regexCSS.test(b) ? 1 : a.localeCompare(b)).map((clientImportPath)=>({
                    request: clientImportPath,
                    ids: [
                        ...clientImports[clientImportPath]
                    ]
                })),
            server: false
        };
        // For the client entry, we always use the CJS build of Next.js. If the
        // server is using the ESM build (when using the Edge runtime), we need to
        // replace them.
        const clientBrowserLoader = `next-flight-client-entry-loader?${(0, _querystring.stringify)({
            modules: (this.isEdgeServer ? loaderOptions.modules.map(({ request, ids })=>({
                    request: request.replace(/[\\/]next[\\/]dist[\\/]esm[\\/]/, "/next/dist/".replace(/\//g, _path.default.sep)),
                    ids
                })) : loaderOptions.modules).map((x)=>JSON.stringify(x)),
            server: false
        })}!`;
        const clientSSRLoader = `next-flight-client-entry-loader?${(0, _querystring.stringify)({
            modules: loaderOptions.modules.map((x)=>JSON.stringify(x)),
            server: true
        })}!`;
        // Add for the client compilation
        // Inject the entry to the client compiler.
        if (this.dev) {
            const entries = (0, _ondemandentryhandler.getEntries)(compiler.outputPath);
            const pageKey = (0, _ondemandentryhandler.getEntryKey)(_constants1.COMPILER_NAMES.client, _pagetypes.PAGE_TYPES.APP, bundlePath);
            if (!entries[pageKey]) {
                entries[pageKey] = {
                    type: _ondemandentryhandler.EntryTypes.CHILD_ENTRY,
                    parentEntries: new Set([
                        entryName
                    ]),
                    absoluteEntryFilePath: absolutePagePath,
                    bundlePath,
                    request: clientBrowserLoader,
                    dispose: false,
                    lastActiveTime: Date.now()
                };
                shouldInvalidate = true;
            } else {
                const entryData = entries[pageKey];
                // New version of the client loader
                if (entryData.request !== clientBrowserLoader) {
                    entryData.request = clientBrowserLoader;
                    shouldInvalidate = true;
                }
                if (entryData.type === _ondemandentryhandler.EntryTypes.CHILD_ENTRY) {
                    entryData.parentEntries.add(entryName);
                }
                entryData.dispose = false;
                entryData.lastActiveTime = Date.now();
            }
        } else {
            pluginState.injectedClientEntries[bundlePath] = clientBrowserLoader;
        }
        // Inject the entry to the server compiler (__ssr__).
        const clientComponentEntryDep = _webpack.webpack.EntryPlugin.createDependency(clientSSRLoader, {
            name: bundlePath
        });
        return [
            shouldInvalidate,
            // Add the dependency to the server compiler.
            // This promise is awaited later using `Promise.all` in order to parallelize adding the entries.
            // It ensures we can parallelize the SSR and Client compiler entries.
            this.addEntry(compilation, // Reuse compilation context.
            compiler.context, clientComponentEntryDep, {
                // By using the same entry name
                name: entryName,
                // Layer should be client for the SSR modules
                // This ensures the client components are bundled on client layer
                layer: _constants.WEBPACK_LAYERS.serverSideRendering
            }),
            clientComponentEntryDep
        ];
    }
    injectActionEntry({ compiler, compilation, actions, entryName, bundlePath, fromClient }) {
        const actionsArray = Array.from(actions.entries());
        const actionLoader = `next-flight-action-entry-loader?${(0, _querystring.stringify)({
            actions: JSON.stringify(actionsArray),
            __client_imported__: fromClient
        })}!`;
        const currentCompilerServerActions = this.isEdgeServer ? pluginState.edgeServerActions : pluginState.serverActions;
        for (const [p, names] of actionsArray){
            for (const name of names){
                const id = (0, _utils.generateActionId)(p, name);
                if (typeof currentCompilerServerActions[id] === "undefined") {
                    currentCompilerServerActions[id] = {
                        workers: {},
                        layer: {}
                    };
                }
                currentCompilerServerActions[id].workers[bundlePath] = "";
                currentCompilerServerActions[id].layer[bundlePath] = fromClient ? _constants.WEBPACK_LAYERS.actionBrowser : _constants.WEBPACK_LAYERS.reactServerComponents;
            }
        }
        // Inject the entry to the server compiler
        const actionEntryDep = _webpack.webpack.EntryPlugin.createDependency(actionLoader, {
            name: bundlePath
        });
        return this.addEntry(compilation, // Reuse compilation context.
        compiler.context, actionEntryDep, {
            name: entryName,
            layer: fromClient ? _constants.WEBPACK_LAYERS.actionBrowser : _constants.WEBPACK_LAYERS.reactServerComponents
        });
    }
    addEntry(compilation, context, dependency, options) /* Promise<module> */ {
        return new Promise((resolve, reject)=>{
            const entry = compilation.entries.get(options.name);
            entry.includeDependencies.push(dependency);
            compilation.hooks.addEntry.call(entry, options);
            compilation.addModuleTree({
                context,
                dependency,
                contextInfo: {
                    issuerLayer: options.layer
                }
            }, (err, module)=>{
                if (err) {
                    compilation.hooks.failedEntry.call(dependency, options, err);
                    return reject(err);
                }
                compilation.hooks.succeedEntry.call(dependency, options, module);
                return resolve(module);
            });
        });
    }
    async createActionAssets(compilation, assets) {
        const serverActions = {};
        const edgeServerActions = {};
        (0, _utils1.traverseModules)(compilation, (mod, _chunk, chunkGroup, modId)=>{
            // Go through all action entries and record the module ID for each entry.
            if (chunkGroup.name && mod.request && modId && /next-flight-action-entry-loader/.test(mod.request)) {
                const fromClient = /&__client_imported__=true/.test(mod.request);
                const mapping = this.isEdgeServer ? pluginState.actionModEdgeServerId : pluginState.actionModServerId;
                if (!mapping[chunkGroup.name]) {
                    mapping[chunkGroup.name] = {};
                }
                mapping[chunkGroup.name][fromClient ? "client" : "server"] = modId;
            }
        });
        for(let id in pluginState.serverActions){
            const action = pluginState.serverActions[id];
            for(let name in action.workers){
                const modId = pluginState.actionModServerId[name][action.layer[name] === _constants.WEBPACK_LAYERS.actionBrowser ? "client" : "server"];
                action.workers[name] = modId;
            }
            serverActions[id] = action;
        }
        for(let id in pluginState.edgeServerActions){
            const action = pluginState.edgeServerActions[id];
            for(let name in action.workers){
                const modId = pluginState.actionModEdgeServerId[name][action.layer[name] === _constants.WEBPACK_LAYERS.actionBrowser ? "client" : "server"];
                action.workers[name] = modId;
            }
            edgeServerActions[id] = action;
        }
        const serverManifest = {
            node: serverActions,
            edge: edgeServerActions,
            encryptionKey: this.encryptionKey
        };
        const edgeServerManifest = {
            ...serverManifest,
            encryptionKey: "process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY"
        };
        const json = JSON.stringify(serverManifest, null, this.dev ? 2 : undefined);
        const edgeJson = JSON.stringify(edgeServerManifest, null, this.dev ? 2 : undefined);
        assets[`${this.assetPrefix}${_constants1.SERVER_REFERENCE_MANIFEST}.js`] = new _webpack.sources.RawSource(`self.__RSC_SERVER_MANIFEST=${JSON.stringify(edgeJson)}`);
        assets[`${this.assetPrefix}${_constants1.SERVER_REFERENCE_MANIFEST}.json`] = new _webpack.sources.RawSource(json);
    }
}
function addClientImport(mod, modRequest, clientComponentImports, importedIdentifiers, isFirstVisitModule) {
    var _getModuleBuildInfo_rsc;
    const clientEntryType = (_getModuleBuildInfo_rsc = (0, _getmodulebuildinfo.getModuleBuildInfo)(mod).rsc) == null ? void 0 : _getModuleBuildInfo_rsc.clientEntryType;
    const isCjsModule = clientEntryType === "cjs";
    const assumedSourceType = (0, _nextflightloader.getAssumedSourceType)(mod, isCjsModule ? "commonjs" : "auto");
    const clientImportsSet = clientComponentImports[modRequest];
    if (importedIdentifiers[0] === "*") {
        // If there's collected import path with named import identifiers,
        // or there's nothing in collected imports are empty.
        // we should include the whole module.
        if (!isFirstVisitModule && [
            ...clientImportsSet
        ][0] !== "*") {
            clientComponentImports[modRequest] = new Set([
                "*"
            ]);
        }
    } else {
        const isAutoModuleSourceType = assumedSourceType === "auto";
        if (isAutoModuleSourceType) {
            clientComponentImports[modRequest] = new Set([
                "*"
            ]);
        } else {
            // If it's not analyzed as named ESM exports, e.g. if it's mixing `export *` with named exports,
            // We'll include all modules since it's not able to do tree-shaking.
            for (const name of importedIdentifiers){
                // For cjs module default import, we include the whole module since
                const isCjsDefaultImport = isCjsModule && name === "default";
                // Always include __esModule along with cjs module default export,
                // to make sure it work with client module proxy from React.
                if (isCjsDefaultImport) {
                    clientComponentImports[modRequest].add("__esModule");
                }
                clientComponentImports[modRequest].add(name);
            }
        }
    }
}
function getModuleResource(mod) {
    var _mod_resourceResolveData, _mod_resourceResolveData1, _mod_matchResource;
    const modPath = ((_mod_resourceResolveData = mod.resourceResolveData) == null ? void 0 : _mod_resourceResolveData.path) || "";
    const modQuery = ((_mod_resourceResolveData1 = mod.resourceResolveData) == null ? void 0 : _mod_resourceResolveData1.query) || "";
    // We have to always use the resolved request here to make sure the
    // server and client are using the same module path (required by RSC), as
    // the server compiler and client compiler have different resolve configs.
    let modResource = modPath + modQuery;
    // Context modules don't have a resource path, we use the identifier instead.
    if (mod.constructor.name === "ContextModule") {
        modResource = mod.identifier();
    }
    // For the barrel optimization, we need to use the match resource instead
    // because there will be 2 modules for the same file (same resource path)
    // but they're different modules and can't be deduped via `visitedModule`.
    // The first module is a virtual re-export module created by the loader.
    if ((_mod_matchResource = mod.matchResource) == null ? void 0 : _mod_matchResource.startsWith(_constants1.BARREL_OPTIMIZATION_PREFIX)) {
        modResource = mod.matchResource + ":" + modResource;
    }
    return modResource;
}

//# sourceMappingURL=flight-client-entry-plugin.js.map