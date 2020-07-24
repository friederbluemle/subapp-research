import Fs = require("fs");
import _ = require("lodash");

const pluginName = "SubAppPlugin";

const findWebpackVersion = (): number => {
  const webpackPkg = JSON.parse(
    Fs.readFileSync(require.resolve("webpack/package.json")).toString()
  );
  const webpackVersion = parseInt(webpackPkg.version.split(".")[0]);
  return webpackVersion;
};

const assert = (ok: boolean, fail: string | Function) => {
  if (!ok) {
    const x = typeof fail === "function" ? fail() : fail;
    if (typeof x === "string") {
      throw new Error(x);
    }
    throw x;
  }
};

const SHIM_parseCommentOptions = Symbol("parseCommentOptions");

class SubAppWebpackPlugin {
  _declareApiName: string;
  _subApps: Record<string, any>;
  _wVer: number;
  _makeIdentifierBEE: Function;
  _tapAssets: Function;

  constructor({
    declareApiName = "declareSubApp",
    webpackVersion = findWebpackVersion()
  } = {}) {
    this._declareApiName = declareApiName;
    this._subApps = {};
    this._wVer = webpackVersion;

    const { makeIdentifierBEE, tapAssets } = this[
      `initWebpackVer${this._wVer}`
    ]();

    this._makeIdentifierBEE = makeIdentifierBEE;
    this._tapAssets = tapAssets;

    console.log("webpack version", this._wVer);
  }

  initWebpackVer4() {
    console.log("init webpack version 4");
    const BEE = require("webpack/lib/BasicEvaluatedExpression");
    return {
      BasicEvaluatedExpression: BEE,
      makeIdentifierBEE: expr => {
        return new BEE().setIdentifier(expr.name).setRange(expr.range);
      },
      tapAssets: compiler => {
        compiler.hooks.emit.tap(pluginName, compilation =>
          this.updateAssets(compilation.assets)
        );
      }
    };
  }

  initWebpackVer5() {
    console.log("init webpack version 5");
    const BEE = require("webpack/lib/javascript/BasicEvaluatedExpression");
    return {
      BasicEvaluatedExpression: BEE,
      makeIdentifierBEE: expr => {
        return new BEE()
          .setIdentifier(expr.name, {}, () => [])
          .setRange(expr.range)
          .setExpression(expr);
      },
      tapAssets: compiler => {
        compiler.hooks.compilation.tap(pluginName, compilation => {
          compilation.hooks.processAssets.tap(pluginName, assets =>
            this.updateAssets(assets)
          );
        });
      }
    };
  }

  updateAssets(assets) {
    if (Object.keys(this._subApps).length > 0) {
      const subapps = JSON.stringify(this._subApps, null, 2) + "\n";
      assets["subapps.json"] = {
        source: () => subapps,
        size: () => subapps.length
      };
    }
  }

  apply(compiler) {
    const apiName = this._declareApiName;

    this._tapAssets(compiler);

    const findGetModule = props => {
      const prop = props.find(p => p.key.name === "getModule");
      const funcBody = prop.value.body;
      return funcBody;
    };

    compiler.hooks.normalModuleFactory.tap(pluginName, factory => {
      debugger;
      factory.hooks.parser
        .for("javascript/auto")
        .tap(pluginName, (parser, options) => {
          parser[SHIM_parseCommentOptions] = parser.parseCommentOptions;

          assert(
            parser.parseCommentOptions,
            `webpack parser doesn't have method 'parseCommentOptions' - not compatible with this plugin`
          );

          const xl = parser.parseCommentOptions.length;
          assert(
            xl === 1,
            `webpack parser.parseCommentOptions takes ${xl} arguments - but expecting 1 so not compatible with this plugin`
          );

          parser.parseCommentOptions = range => {
            for (const k in this._subApps) {
              const subapp = this._subApps[k];
              const gmod = subapp.getModule;
              if (range[0] >= gmod.range[0] && gmod.range[1] >= range[1]) {
                return {
                  options: {
                    webpackChunkName: `subapp-${subapp.name.toLowerCase()}`
                  },
                  errors: []
                };
              }
            }
            return parser[SHIM_parseCommentOptions](range);
          };

          const noCwd = x => x.replace(process.cwd(), ".");

          const where = (source, loc) => {
            return `${source}:${loc.start.line}:${loc.start.column + 1}`;
          };

          parser.hooks.call.for(apiName).tap(pluginName, expression => {
            const currentSource = _.get(parser, "state.current.resource", "");
            const props = _.get(expression, "arguments[0].properties");
            const cw = () => where(noCwd(currentSource), expression.loc);

            assert(
              props,
              () =>
                `${cw()}: you must pass an Object literal as argument to ${apiName}`
            );

            const nameProp = props.find(p => p.key.name === "name");
            assert(
              nameProp,
              () =>
                `${cw()}: argument for ${apiName} doesn't have a name property`
            );

            const nameVal = nameProp.value.value;
            assert(
              nameVal && typeof nameVal === "string",
              () =>
                `${cw()}: subapp name must be specified as an inlined literal string`
            );
            // the following breaks hot recompiling in dev mode
            // const exist = this._subApps[nameVal];
            // assert(
            //   !exist,
            //   () =>
            //     `${cw()}: subapp '${nameVal}' is already declared at ${where(
            //       noCwd(exist.source),
            //       exist.loc
            //     )}`
            // );
            const getModule = findGetModule(props);
            this._subApps[nameVal] = {
              name: nameVal,
              source: currentSource,
              loc: expression.loc,
              range: expression.range,
              getModule: {
                loc: getModule.loc,
                range: getModule.range
              }
            };
          });

          parser.hooks.evaluate
            .for("Identifier")
            .tap({ name: pluginName, before: "Parser" }, expression => {
              if (expression.name === apiName) {
                return this._makeIdentifierBEE(expression);
              }

              return undefined;
            });

          // parser.hooks.importCall.tap(pluginName, (expr) => {
          //   debugger;
          // });
        });
    });
  }
}

module.exports = SubAppWebpackPlugin;
