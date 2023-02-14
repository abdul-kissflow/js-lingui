"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _babelPluginMacros = require("babel-plugin-macros");
var _conf = require("@lingui/conf");
var _macroJs = _interopRequireDefault(require("./macroJs"));
var _macroJsx = _interopRequireDefault(require("./macroJsx"));
var _types = require("@babel/types");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const config = (0, _conf.getConfig)({
  configPath: process.env.LINGUI_CONFIG
});
const getSymbolSource = name => {
  if (Array.isArray(config.runtimeConfigModule)) {
    if (name === "i18n") {
      return config.runtimeConfigModule;
    } else {
      return ["@lingui/react", name];
    }
  } else {
    if (config.runtimeConfigModule[name]) {
      return config.runtimeConfigModule[name];
    } else {
      return ["@lingui/react", name];
    }
  }
};
const [i18nImportModule, i18nImportName = "i18n"] = getSymbolSource("i18n");
const [TransImportModule, TransImportName = "Trans"] = getSymbolSource("Trans");
const jsMacroTags = new Set(["defineMessage", "arg", "t", "plural", "select", "selectOrdinal"]);
const jsxMacroTags = new Set(["Trans", "Plural", "Select", "SelectOrdinal"]);
function macro({
  references,
  state,
  babel
}) {
  const jsxNodes = [];
  const jsNodes = [];
  let needsI18nImport = false;
  Object.keys(references).forEach(tagName => {
    const nodes = references[tagName];
    if (jsMacroTags.has(tagName)) {
      nodes.forEach(node => {
        jsNodes.push(node.parentPath);
      });
    } else if (jsxMacroTags.has(tagName)) {
      nodes.forEach(node => {
        // identifier.openingElement.jsxElement
        jsxNodes.push(node.parentPath.parentPath);
      });
    } else {
      throw nodes[0].buildCodeFrameError(`Unknown macro ${tagName}`);
    }
  });
  jsNodes.filter(isRootPath(jsNodes)).forEach(path => {
    if (alreadyVisited(path)) return;
    const macro = new _macroJs.default(babel, {
      i18nImportName
    });
    if (macro.replacePath(path)) needsI18nImport = true;
  });
  jsxNodes.filter(isRootPath(jsxNodes)).forEach(path => {
    if (alreadyVisited(path)) return;
    const macro = new _macroJsx.default(babel);
    macro.replacePath(path);
  });
  if (needsI18nImport) {
    addImport(babel, state, i18nImportModule, i18nImportName);
  }
  if (jsxNodes.length) {
    addImport(babel, state, TransImportModule, TransImportName);
  }
  if (process.env.LINGUI_EXTRACT === "1") {
    return {
      keepImports: true
    };
  }
}
function addImport(babel, state, module, importName) {
  const {
    types: t
  } = babel;
  const linguiImport = state.file.path.node.body.find(importNode => t.isImportDeclaration(importNode) && importNode.source.value === module &&
  // https://github.com/lingui/js-lingui/issues/777
  importNode.importKind !== "type");
  const tIdentifier = t.identifier(importName);
  // Handle adding the import or altering the existing import
  if (linguiImport) {
    if (linguiImport.specifiers.findIndex(specifier => (0, _types.isImportSpecifier)(specifier) && (0, _types.isIdentifier)(specifier.imported, {
      name: importName
    })) === -1) {
      linguiImport.specifiers.push(t.importSpecifier(tIdentifier, tIdentifier));
    }
  } else {
    state.file.path.node.body.unshift(t.importDeclaration([t.importSpecifier(tIdentifier, tIdentifier)], t.stringLiteral(module)));
  }
}
function isRootPath(allPath) {
  return node => function traverse(path) {
    if (!path.parentPath) {
      return true;
    } else {
      return !allPath.includes(path.parentPath) && traverse(path.parentPath);
    }
  }(node);
}
const alreadyVisitedCache = new WeakSet();
const alreadyVisited = path => {
  if (alreadyVisitedCache.has(path)) {
    return true;
  } else {
    alreadyVisitedCache.add(path);
    return false;
  }
};
[...jsMacroTags, ...jsxMacroTags].forEach(name => {
  Object.defineProperty(module.exports, name, {
    get() {
      throw new Error(`The macro you imported from "@lingui/macro" is being executed outside the context of compilation with babel-plugin-macros. ` + `This indicates that you don't have the babel plugin "babel-plugin-macros" configured correctly. ` + `Please see the documentation for how to configure babel-plugin-macros properly: ` + "https://github.com/kentcdodds/babel-plugin-macros/blob/main/other/docs/user.md");
    }
  });
});
var _default = (0, _babelPluginMacros.createMacro)(macro);
exports.default = _default;