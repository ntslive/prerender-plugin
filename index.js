const nodeEval = require('eval');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const PLUGIN_NAME = 'PrerenderPlugin';
const PRERENDER_REGEX = /\s*{{\s?prerender\s?}}\s*/;
const BAD_OPTIONS_ERROR_MESSAGE = `${PLUGIN_NAME} requires the option prerender passed to HtmlWebpackPlugin to be a string or an object`;
const NO_FUNCTION_ERROR_MESSAGE = `The prerender entry must export a function that returns an HTML string. To do this, Webpack must be configured to output a UMD library.`
// For Webpack config see https://webpack.js.org/guides/author-libraries/

function parseOptions(prerenderOptions) {
    if (typeof prerenderOptions === 'string') {
        return { entry: prerenderOptions };
    }

    return prerenderOptions;
}

function isJsAsset(assetName) {
    return assetName.endsWith(('.js'));
}

function findAssets(compilation, entryName) {
    const statsJson = compilation.getStats().toJson();
    const entry = statsJson.entrypoints[entryName];
    if (!entry) return [];

    const assetNames = entry.assets.map(asset => {
        return asset.name;
    });
    return assetNames.reduce((acc, assetName) => {
        if (!isJsAsset(assetName)
            || !(assetName in compilation.assets)) return acc;

        acc.push(compilation.assets[assetName]);
        return acc;
    }, []);
}

function globalsScript(optionsMap) {
    const options = JSON.stringify(optionsMap);
    return `<script>Object.assign(window, ${options})</script>`;
}

function evaluatePrerender(assets) {
    const source = assets.reduce((acc, asset) => {
        return acc.concat(asset.source());
    }, '');
    return nodeEval(source, { self: {} }, true);
}

class PrerenderPlugin {
    apply(compiler) {
        compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
            HtmlWebpackPlugin.getHooks(compilation).beforeEmit.tapAsync(
                PLUGIN_NAME,
                (data, cb) => {
                    const prerenderOptions = data.plugin.options.prerender;
                    if (!prerenderOptions) {
                        return cb(null, data);
                    }

                    const options = parseOptions(prerenderOptions);
                    if (typeof options !== 'object') {
                        return cb(new Error(BAD_OPTIONS_ERROR_MESSAGE));
                    }

                    const assets = findAssets(compilation, options.entry);
                    const prerender = evaluatePrerender(assets);
                    if (typeof prerender !== 'function') {
                        return cb(new Error(NO_FUNCTION_ERROR_MESSAGE));
                    }

                    const result = prerender(options)
                        .concat(globalsScript(options));
                    data.html = data.html.replace(PRERENDER_REGEX, result);
                    return cb(null, data);
                }
            );
        });
    }
}

module.exports = PrerenderPlugin;
