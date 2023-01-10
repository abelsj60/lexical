/* eslint-disable header/header */
// eslint-disable-next-line simple-import-sort/imports
import {ParagraphNode, TextNode} from 'lexical';
import {PrismTokenizer} from '..';
import {LinedCodeTextNode} from './LinedCodeTextNode';

import {LinedCodeLineNode} from './LinedCodeLineNode';
import {
  $isLinedCodeNode,
  LinedCodeNode,
  LinedCodeNodeOptions,
} from './LinedCodeNode';
import {DEFAULT_CODE_LANGUAGE, mapToPrismLanguage} from './Prism';
import {$getLinedCodeNode, addOptionOrDefault} from './utils';

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
      const defaults = defaultOptions || {};
      const settings = node.getSettings();
      const finalOptions = {
        activateTabs: addOptionOrDefault(
          settings.activateTabs,
          defaults.activateTabs || false,
        ),
        defaultLanguage: addOptionOrDefault(
          mapToPrismLanguage(
            settings.defaultLanguage ||
              defaults.defaultLanguage ||
              DEFAULT_CODE_LANGUAGE,
          ),
          DEFAULT_CODE_LANGUAGE,
        ),
        initialLanguage: addOptionOrDefault(
          mapToPrismLanguage(
            settings.language ||
              defaults.initialLanguage ||
              DEFAULT_CODE_LANGUAGE,
          ),
          DEFAULT_CODE_LANGUAGE,
        ),
        isLockedBlock: addOptionOrDefault(
          settings.isLockedBlock,
          defaults.isLockedBlock || false,
        ),
        lineNumbers: addOptionOrDefault(
          settings.lineNumbers,
          defaults.lineNumbers || true,
        ),
        theme: addOptionOrDefault(settings.theme, defaults.theme || {}),
        tokenizer: addOptionOrDefault(
          settings.tokenizer,
          defaults.tokenizer || PrismTokenizer,
        ),
      };

      return new LinedCodeNode(finalOptions);
    },
  };
}

function swapParagraphForLinedCodeLine() {
  return {
    replace: ParagraphNode,
    with: (node: ParagraphNode) => {
      const codeNode = $getLinedCodeNode();

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
      if ($isLinedCodeNode($getLinedCodeNode())) {
        return new LinedCodeTextNode(node.__text || '');
      }

      return node;
    },
  };
}

export function getLinedCodeNodes(defaultOptions?: LinedCodeNodeOptions) {
  return [
    LinedCodeTextNode,
    LinedCodeLineNode,
    LinedCodeNode,
    swapLinedCodeNodeForFullyConfiguredVersion(defaultOptions),
    swapParagraphForLinedCodeLine(),
    swapTextForLinedCodeHighlight(),
  ];
}
