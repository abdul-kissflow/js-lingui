"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var R = _interopRequireWildcard(require("ramda"));
var _types = require("@babel/types");
var _icu = _interopRequireDefault(require("./icu"));
var _utils = require("./utils");
var _constants = require("./constants");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
const keepSpaceRe = /(?:\\(?:\r\n|\r|\n))+\s+/g;
const keepNewLineRe = /(?:\r\n|\r|\n)+\s+/g;
function normalizeWhitespace(text) {
  return text.replace(keepSpaceRe, " ").replace(keepNewLineRe, "\n").trim();
}
class MacroJs {
  // Babel Types

  // Identifier of i18n object

  // Positional expressions counter (e.g. for placeholders `Hello {0}, today is {1}`)
  _expressionIndex = (0, _utils.makeCounter)();
  constructor({
    types
  }, {
    i18nImportName
  }) {
    this.types = types;
    this.i18nImportName = i18nImportName;
  }
  replacePathWithMessage = (path, {
    message,
    values
  }, linguiInstance) => {
    const args = [];
    args.push(isString(message) ? this.types.stringLiteral(message) : message);
    if (Object.keys(values).length) {
      const valuesObject = Object.keys(values).map(key => this.types.objectProperty(this.types.identifier(key), values[key]));
      args.push(this.types.objectExpression(valuesObject));
    }
    const newNode = this.types.callExpression(this.types.memberExpression(linguiInstance ?? this.types.identifier(this.i18nImportName), this.types.identifier("_")), args);

    // preserve line number
    newNode.loc = path.node.loc;
    path.addComment("leading", _constants.EXTRACT_MARK);
    path.replaceWith(newNode);
  };

  // Returns a boolean indicating if the replacement requires i18n import
  replacePath = path => {
    // reset the expression counter
    this._expressionIndex = (0, _utils.makeCounter)();
    if (this.isDefineMessage(path.node)) {
      this.replaceDefineMessage(path);
      return true;
    }

    // t(i18nInstance)`Message` -> i18nInstance._('Message')
    if (this.types.isCallExpression(path.node) && this.types.isTaggedTemplateExpression(path.parentPath.node) && this.types.isIdentifier(path.node.arguments[0]) && this.isIdentifier(path.node.callee, "t")) {
      // Use the first argument as i18n instance instead of the default i18n instance
      const i18nInstance = path.node.arguments[0];
      const tokens = this.tokenizeNode(path.parentPath.node);
      const messageFormat = new _icu.default();
      const {
        message: messageRaw,
        values
      } = messageFormat.fromTokens(tokens);
      const message = normalizeWhitespace(messageRaw);
      this.replacePathWithMessage(path.parentPath, {
        message,
        values
      }, i18nInstance);
      return false;
    }

    // t(i18nInstance)(messageDescriptor) -> i18nInstance._(messageDescriptor)
    if (this.types.isCallExpression(path.node) && this.types.isCallExpression(path.parentPath.node) && this.types.isIdentifier(path.node.arguments[0]) && this.isIdentifier(path.node.callee, "t")) {
      const i18nInstance = path.node.arguments[0];
      this.replaceTAsFunction(path.parentPath, i18nInstance);
      return false;
    }
    if (this.types.isCallExpression(path.node) && this.isIdentifier(path.node.callee, "t")) {
      this.replaceTAsFunction(path);
      return true;
    }
    const tokens = this.tokenizeNode(path.node);
    const messageFormat = new _icu.default();
    const {
      message: messageRaw,
      values
    } = messageFormat.fromTokens(tokens);
    const message = normalizeWhitespace(messageRaw);
    this.replacePathWithMessage(path, {
      message,
      values
    });
    return true;
  };

  /**
   * macro `defineMessage` is called with MessageDescriptor or string. The only
   * thing that happens is that any macros used in `message` property or string
   * are replaced with formatted message.
   *
   * import { defineMessage, plural } from '@lingui/macro';
   * const message = defineMessage({
   *   id: "msg.id",
   *   comment: "Description",
   *   message: plural(value, { one: "book", other: "books" })
   * })
   *
   * ↓ ↓ ↓ ↓ ↓ ↓
   *
   * const message = {
   *   id: "msg.id",
   *   comment: "Description",
   *   message: "{value, plural, one {book} other {books}}"
   * }
   *
   * or 
   * 
   * const message = defineMessage("initiate success")
   *
   * ↓ ↓ ↓ ↓ ↓ ↓
   *
   * const message = {
   *   id: "initiate success"
   * }
   * 
   */
  replaceDefineMessage = path => {
    // reset the expression counter
    this._expressionIndex = (0, _utils.makeCounter)();
    const argValue = path.node.arguments[0];
    const newNode = this.types.isTemplateLiteral(argValue) || this.types.isStringLiteral(argValue) ? this.types.objectExpression([this.types.objectProperty(this.types.identifier(_constants.MESSAGE), argValue)]) : argValue;
    const descriptor = this.processDescriptor(newNode);
    path.replaceWith(descriptor);
  };

  /**
   * macro `t` is called with MessageDescriptor, after that
   * we create a new node to append it to i18n._
   */
  replaceTAsFunction = (path, linguiInstance) => {
    let descriptor = this.processDescriptor(path.node.arguments[0]);
    const newNode = this.types.callExpression(this.types.memberExpression(linguiInstance ?? this.types.identifier(this.i18nImportName), this.types.identifier("_")), [descriptor]);
    path.replaceWith(newNode);
  };

  /**
   * `processDescriptor` expand macros inside message descriptor.
   * Message descriptor is used in `defineMessage`.
   *
   * {
   *   comment: "Description",
   *   message: plural("value", { one: "book", other: "books" })
   * }
   *
   * ↓ ↓ ↓ ↓ ↓ ↓
   *
   * {
   *   comment: "Description",
   *   id: "{value, plural, one {book} other {books}}"
   * }
   *
   */
  processDescriptor = descriptor_ => {
    const descriptor = descriptor_;
    this.types.addComment(descriptor, "leading", _constants.EXTRACT_MARK);
    const messageIndex = descriptor.properties.findIndex(property => (0, _types.isObjectProperty)(property) && this.isIdentifier(property.key, _constants.MESSAGE));
    if (messageIndex === -1) {
      return descriptor;
    }

    // if there's `message` property, replace macros with formatted message
    const node = descriptor.properties[messageIndex];

    // Inside message descriptor the `t` macro in `message` prop is optional.
    // Template strings are always processed as if they were wrapped by `t`.
    const tokens = this.types.isTemplateLiteral(node.value) ? this.tokenizeTemplateLiteral(node.value) : this.tokenizeNode(node.value, true);
    let messageNode = node.value;
    if (tokens != null) {
      const messageFormat = new _icu.default();
      const {
        message: messageRaw,
        values
      } = messageFormat.fromTokens(tokens);
      const message = normalizeWhitespace(messageRaw);
      messageNode = this.types.stringLiteral(message);
      this.addValues(descriptor.properties, values);
    }

    // Don't override custom ID
    const hasId = descriptor.properties.findIndex(property => (0, _types.isObjectProperty)(property) && this.isIdentifier(property.key, _constants.ID)) !== -1;
    descriptor.properties[messageIndex] = this.types.objectProperty(this.types.identifier(hasId ? _constants.MESSAGE : _constants.ID), messageNode);
    if (process.env.NODE_ENV === "production") {
      descriptor.properties = descriptor.properties.filter(property => (0, _types.isObjectProperty)(property) && !this.isIdentifier(property.key, _constants.MESSAGE) && (0, _types.isObjectProperty)(property) && !this.isIdentifier(property.key, _constants.COMMENT));
    }
    return descriptor;
  };
  addValues = (obj, values) => {
    const valuesObject = Object.keys(values).map(key => this.types.objectProperty(this.types.identifier(key), values[key]));
    if (!valuesObject.length) return;
    obj.push(this.types.objectProperty(this.types.identifier("values"), this.types.objectExpression(valuesObject)));
  };
  tokenizeNode = (node, ignoreExpression = false) => {
    if (this.isI18nMethod(node)) {
      // t
      return this.tokenizeTemplateLiteral(node);
    } else if (this.isChoiceMethod(node)) {
      // plural, select and selectOrdinal
      return [this.tokenizeChoiceComponent(node)];
      // } else if (isFormatMethod(node.callee)) {
      //   // date, number
      //   return transformFormatMethod(node, file, props, root)
    } else if (!ignoreExpression) {
      return this.tokenizeExpression(node);
    }
  };

  /**
   * `node` is a TemplateLiteral. node.quasi contains
   * text chunks and node.expressions contains expressions.
   * Both arrays must be zipped together to get the final list of tokens.
   */
  tokenizeTemplateLiteral = node => {
    const tokenize = R.pipe(R.evolve({
      quasis: R.map(text => {
        // Don't output tokens without text.
        // if it's an unicode we keep the cooked value because it's the parsed value by babel (without unicode chars)
        // This regex will detect if a string contains unicode chars, when they're we should interpolate them
        // why? because platforms like react native doesn't parse them, just doing a JSON.parse makes them UTF-8 friendly
        const value = /\\u[a-fA-F0-9]{4}|\\x[a-fA-F0-9]{2}/g.test(text.value.raw) ? text.value.cooked : text.value.raw;
        if (value === "") return null;
        return {
          type: "text",
          value: this.clearBackslashes(value)
        };
      }),
      expressions: R.map(exp => this.types.isCallExpression(exp) ? this.tokenizeNode(exp) : this.tokenizeExpression(exp))
    }), exp => (0, _utils.zip)(exp.quasis, exp.expressions), R.flatten, R.filter(Boolean));
    return tokenize(this.types.isTaggedTemplateExpression(node) ? node.quasi : node);
  };
  tokenizeChoiceComponent = node => {
    const format = node.callee.name.toLowerCase();
    const token = {
      ...this.tokenizeExpression(node.arguments[0]),
      format,
      options: {
        offset: undefined
      }
    };
    const props = node.arguments[1].properties;
    for (const attr of props) {
      const {
        key,
        value: attrValue
      } = attr;

      // name is either:
      // NumericLiteral => convert to `={number}`
      // StringLiteral => key.value
      // Identifier => key.name
      const name = this.types.isNumericLiteral(key) ? `=${key.value}` : key.name || key.value;
      if (format !== "select" && name === "offset") {
        token.options.offset = attrValue.value;
      } else {
        let value;
        if (this.types.isTemplateLiteral(attrValue)) {
          value = this.tokenizeTemplateLiteral(attrValue);
        } else if (this.types.isCallExpression(attrValue)) {
          value = this.tokenizeNode(attrValue);
        } else {
          value = attrValue.value;
        }
        token.options[name] = value;
      }
    }
    return token;
  };
  tokenizeExpression = node => {
    if (this.isArg(node) && this.types.isCallExpression(node)) {
      return {
        type: "arg",
        name: node.arguments[0].value,
        value: undefined
      };
    }
    return {
      type: "arg",
      name: this.expressionToArgument(node),
      value: node
    };
  };
  expressionToArgument = exp => {
    if (this.types.isIdentifier(exp)) {
      return exp.name;
    } else if (this.types.isStringLiteral(exp)) {
      return exp.value;
    } else {
      return String(this._expressionIndex());
    }
  };

  /**
   * We clean '//\` ' to just '`'
   */
  clearBackslashes(value) {
    // if not we replace the extra scaped literals
    return value.replace(/\\`/g, "`");
  }

  /**
   * Custom matchers
   */
  isIdentifier = (node, name) => {
    return this.types.isIdentifier(node, {
      name
    });
  };
  isDefineMessage = node => {
    return this.types.isCallExpression(node) && this.isIdentifier(node.callee, "defineMessage");
  };
  isArg = node => {
    return this.types.isCallExpression(node) && this.isIdentifier(node.callee, "arg");
  };
  isI18nMethod = node => {
    return this.types.isTaggedTemplateExpression(node) && (this.isIdentifier(node.tag, "t") || this.types.isCallExpression(node.tag) && this.isIdentifier(node.tag.callee, "t"));
  };
  isChoiceMethod = node => {
    return this.types.isCallExpression(node) && (this.isIdentifier(node.callee, "plural") || this.isIdentifier(node.callee, "select") || this.isIdentifier(node.callee, "selectOrdinal"));
  };
}
exports.default = MacroJs;
const isString = s => typeof s === "string";