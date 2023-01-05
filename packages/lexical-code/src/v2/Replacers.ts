/* eslint-disable header/header */
// eslint-disable-next-line simple-import-sort/imports
import {ParagraphNode, TextNode} from 'lexical';
import {LinedCodeHighlightNode} from './LinedCodeHighlightNode';

import {
  DEFAULT_CODE_LANGUAGE,
  LinedCodeLineNode,
  PrismTokenizer,
  Tokenizer,
} from './LinedCodeLineNode';
import {
  $isLinedCodeNode,
  LinedCodeNode,
  LinedCodeNodeOptions,
} from './LinedCodeNode';
import {getLinedCodeNode} from './utils';

function setOption(
  initVal: boolean | string | object | undefined | null,
  fallback: boolean | string | object | null | Tokenizer,
) {
  const hasInitialValue = initVal !== null && typeof initVal !== 'undefined';
  return hasInitialValue ? initVal : fallback;
}

export function swapLinedCodeNodeForFullyConfiguredVersion(
  defaultOptions?: LinedCodeNodeOptions,
) {
  // You may be wondering why not .replace the unconfigured CodeNode via the 'created'
  // mutation. Because the .replace() method doesn't work in this case, as the newly
  // created node has no parent yet. Further, the CodeLineNodes have already been
  // created, so, we'd have to swim upstream to reset their initial options.

  // By contrast, the replacement API gives us a quick-n-easy way to
  // properly set all options at once without any backtracking.

  return {
    replace: LinedCodeNode,
    with: (node: LinedCodeNode) => {
      const initialOptions = node.getOptions();
      const defaults = defaultOptions || {};
      const finalOptions = {
        activateTabs: setOption(
          initialOptions.activateTabs,
          defaults.activateTabs || false,
        ),
        addPreOnExportDOM: setOption(
          initialOptions.addPreOnExportDOM,
          defaults.addPreOnExportDOM || false,
        ),
        defaultLanguage: setOption(
          initialOptions.defaultLanguage,
          defaults.defaultLanguage || DEFAULT_CODE_LANGUAGE,
        ),
        initialLanguage: setOption(
          initialOptions.initialLanguage,
          defaults.defaultLanguage || DEFAULT_CODE_LANGUAGE,
        ),
        isLockedBlock: setOption(
          initialOptions.isLockedBlock,
          defaults.isLockedBlock || false,
        ),
        lineNumbers: setOption(
          initialOptions.lineNumbers,
          defaults.lineNumbers || true,
        ),
        theme: setOption(initialOptions.theme, defaults.theme || {}),
        tokenizer: setOption(
          initialOptions.tokenizer,
          defaults.tokenizer || PrismTokenizer,
        ),
      } as Required<LinedCodeNodeOptions>;

      return new LinedCodeNode(finalOptions);
    },
  };
}

function swapParagraphForLinedCodeLine() {
  return {
    replace: ParagraphNode,
    with: (node: ParagraphNode) => {
      const codeNode = getLinedCodeNode();

      if ($isLinedCodeNode(codeNode)) {
        if (!codeNode.hasBreakOutLine()) {
          return new LinedCodeLineNode();
        }
      }

      return node;
    },
  };
}

function swapTextForLinedCodeHighlight() {
  return {
    replace: TextNode,
    with: (node: TextNode) => {
      if ($isLinedCodeNode(getLinedCodeNode())) {
        return new LinedCodeHighlightNode(node.__text || '');
      }

      return node;
    },
  };
}

export function getLinedCodeNodes(defaultOptions?: LinedCodeNodeOptions) {
  return [
    LinedCodeHighlightNode,
    LinedCodeLineNode,
    LinedCodeNode,
    swapLinedCodeNodeForFullyConfiguredVersion(defaultOptions),
    swapParagraphForLinedCodeLine(),
    swapTextForLinedCodeHighlight(),
  ];
}
