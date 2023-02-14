"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _types = require("@babel/types");
const metaOptions = ["id", "comment", "props"];
const escapedMetaOptionsRe = new RegExp(`^_(${metaOptions.join("|")})$`);
class ICUMessageFormat {
  fromTokens(tokens) {
    return (Array.isArray(tokens) ? tokens : [tokens]).map(token => this.processToken(token)).filter(Boolean).reduce((props, message) => ({
      ...message,
      message: props.message + message.message,
      values: {
        ...props.values,
        ...message.values
      },
      jsxElements: {
        ...props.jsxElements,
        ...message.jsxElements
      }
    }), {
      message: "",
      values: {},
      jsxElements: {}
    });
  }
  processToken(token) {
    const jsxElements = {};
    if (token.type === "text") {
      return {
        message: token.value
      };
    } else if (token.type === "arg") {
      if (token.value !== undefined && (0, _types.isJSXEmptyExpression)(token.value)) {
        return null;
      }
      const values = token.value !== undefined ? {
        [token.name]: token.value
      } : {};
      switch (token.format) {
        case "plural":
        case "select":
        case "selectordinal":
          const formatOptions = Object.keys(token.options).filter(key => token.options[key] != null).map(key => {
            let value = token.options[key];
            key = key.replace(escapedMetaOptionsRe, "$1");
            if (key === "offset") {
              // offset has special syntax `offset:number`
              return `offset:${value}`;
            }
            if (typeof value !== "string") {
              // process tokens from nested formatters
              const {
                message,
                values: childValues,
                jsxElements: childJsxElements
              } = this.fromTokens(value);
              Object.assign(values, childValues);
              Object.assign(jsxElements, childJsxElements);
              value = message;
            }
            return `${key} {${value}}`;
          }).join(" ");
          return {
            message: `{${token.name}, ${token.format}, ${formatOptions}}`,
            values,
            jsxElements
          };
        default:
          return {
            message: `{${token.name}}`,
            values
          };
      }
    } else if (token.type === "element") {
      let message = "";
      let elementValues = {};
      Object.assign(jsxElements, {
        [token.name]: token.value
      });
      token.children.forEach(child => {
        const {
          message: childMessage,
          values: childValues,
          jsxElements: childJsxElements
        } = this.fromTokens(child);
        message += childMessage;
        Object.assign(elementValues, childValues);
        Object.assign(jsxElements, childJsxElements);
      });
      return {
        message: token.children.length ? `<${token.name}>${message}</${token.name}>` : `<${token.name}/>`,
        values: elementValues,
        jsxElements
      };
    }
    throw new Error(`Unknown token type ${token.type}`);
  }
}
exports.default = ICUMessageFormat;