/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

// eslint-disable-next-line simple-import-sort/imports
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-objectivec';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-swift';

import {
  $getSelection,
  $isRangeSelection,
  EditorConfig,
  EditorThemeClasses,
  LexicalNode,
  NodeKey,
  SerializedTextNode,
  Spread,
  TextNode,
} from 'lexical';
import * as Prism from 'prismjs';
import {
  addClassNamesToElement,
  removeClassNamesFromElement,
} from 'packages/lexical-utils/src';
import {
  $createCodeLineNode,
  getLinesFromSelection,
  handleMultiLineDelete,
} from './clnNext';

export const DEFAULT_CODE_LANGUAGE = 'javascript';

type SerializedCodeHighlightNode = Spread<
  {
    highlightType: string | null | undefined;
    type: 'code-highlight';
    version: 1;
  },
  SerializedTextNode
>;

export const CODE_LANGUAGE_FRIENDLY_NAME_MAP: Record<string, string> = {
  c: 'C',
  clike: 'C-like',
  css: 'CSS',
  html: 'HTML',
  js: 'JavaScript',
  markdown: 'Markdown',
  objc: 'Objective-C',
  plain: 'Plain Text',
  py: 'Python',
  rust: 'Rust',
  sql: 'SQL',
  swift: 'Swift',
  xml: 'XML',
};

export const CODE_LANGUAGE_MAP: Record<string, string> = {
  javascript: 'js',
  md: 'markdown',
  plaintext: 'plain',
  python: 'py',
  text: 'plain',
};

export function normalizeCodeLang(lang: string) {
  return CODE_LANGUAGE_MAP[lang] || lang;
}

export function getLanguageFriendlyName(lang: string) {
  const _lang = normalizeCodeLang(lang);
  return CODE_LANGUAGE_FRIENDLY_NAME_MAP[_lang] || _lang;
}

export const getDefaultCodeLanguage = (): string => DEFAULT_CODE_LANGUAGE;

export const getCodeLanguages = (): Array<string> =>
  Object.keys(Prism.languages)
    .filter(
      // Prism has several language helpers mixed into languages object
      // so filtering them out here to get langs list
      (language) => typeof Prism.languages[language] !== 'function',
    )
    .sort();

/** @noInheritDoc */

export class CodeHighlightNode extends TextNode {
  /** @internal */
  __highlightType: string | null | undefined;

  constructor(
    text: string,
    highlightType?: string | null | undefined,
    key?: NodeKey,
  ) {
    super(text, key);
    this.__highlightType = highlightType;
  }

  static getType() {
    return 'code-highlight';
  }

  static clone(node: CodeHighlightNode): CodeHighlightNode {
    return new CodeHighlightNode(
      node.__text,
      node.__highlightType || undefined,
      node.__key,
    );
  }

  deleteLine() {
    const selection = $getSelection();

    if (selection !== null && $isRangeSelection(selection)) {
      const isCollapsed = selection.isCollapsed();

      const {
        topPoint,
        topLine: line,
        lineRangeFromSelection: linesForUpdate,
      } = getLinesFromSelection(selection);

      if (typeof line !== 'undefined' && Array.isArray(linesForUpdate)) {
        if (isCollapsed) {
          if (selection.anchor.offset === 0) {
            // delete one empty CodeLine
            const prevLine = line.getPreviousSibling();

            if (prevLine !== null) {
              const isStartOfLine = line.isStartOfLine();
              const isPreviousLineEmpty = prevLine.isEmptyLine();

              if (isPreviousLineEmpty || isStartOfLine) {
                if (isPreviousLineEmpty) {
                  prevLine.remove();
                } else if (isStartOfLine) {
                  const children = line.getChildren();
                  const nextOffset = prevLine.getChildrenSize();

                  prevLine.append(children);
                  prevLine.select(nextOffset, nextOffset);
                }

                return true;
              }
            }
          }
        } else {
          // delete ranges: CodeHighlight-to-CodeHighlight, CodeLine-to-CodeHighlight
          handleMultiLineDelete(line, linesForUpdate, topPoint);
          return true;
        }
      }
    }

    return false;
  }

  insertNewAfter() {
    const selection = $getSelection();

    if (selection !== null && $isRangeSelection(selection)) {
      const {
        topPoint,
        splitText,
        topLine: line,
        lineRangeFromSelection: linesForUpdate,
      } = getLinesFromSelection(selection);

      if (typeof line !== 'undefined' && Array.isArray(linesForUpdate)) {
        const newLine = $createCodeLineNode();

        const lineOffset = line.getLineOffset(topPoint);
        const textToOffset = line.getTextContent().slice(0, lineOffset);
        const firstCharacterIndex = line.getFirstCharacterIndex(textToOffset);
        const lineSpacers =
          firstCharacterIndex > 0 ? line.makeSpace(firstCharacterIndex) : '';

        if (Array.isArray(splitText)) {
          const [textBeforeSplit, textAfterSplit] = splitText;
          const leavingTextPlusLineSpacers = `${lineSpacers}${textAfterSplit}`;
          const code = line.getHighlightNodes(
            leavingTextPlusLineSpacers,
          ) as CodeHighlightNode[];

          newLine.append(...code);

          line.insertAfter(newLine);
          line.replaceLineCode(textBeforeSplit);
          linesForUpdate.slice(1).forEach((ln) => ln.remove());

          const hasChildren = newLine.getChildrenSize() > 0;
          newLine.nextSelection(hasChildren ? lineSpacers.length : 0);

          return newLine;
        }
      }
    }
  }

  getHighlightType() {
    const self = this.getLatest();
    return self.__highlightType;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    const className = getHighlightThemeClass(
      config.theme,
      this.__highlightType,
    );
    addClassNamesToElement(element, className);
    return element;
  }

  updateDOM(
    prevNode: CodeHighlightNode,
    dom: HTMLElement,
    config: EditorConfig,
  ) {
    const update = super.updateDOM(prevNode, dom, config);
    const prevClassName = getHighlightThemeClass(
      config.theme,
      prevNode.__highlightType,
    );
    const nextClassName = getHighlightThemeClass(
      config.theme,
      this.__highlightType,
    );

    if (prevClassName !== nextClassName) {
      if (prevClassName) {
        removeClassNamesFromElement(dom, prevClassName);
      }

      if (nextClassName) {
        addClassNamesToElement(dom, nextClassName);
      }
    }

    return update;
  }

  // exportDOM(editor: LexicalEditor) {
  //   const test = super.exportDOM(editor);
  //   return { element: test.element };
  // }

  static importJSON(
    serializedNode: SerializedCodeHighlightNode,
  ): CodeHighlightNode {
    const node = $createCodeHighlightNode(
      serializedNode.text,
      serializedNode.highlightType,
    );
    node.setFormat(serializedNode.format);
    node.setDetail(serializedNode.detail);
    node.setMode(serializedNode.mode);
    node.setStyle(serializedNode.style);

    // TODO: insert into line here (splice or replace), then return the node
    // TODO: should work without selection
    // TODO: what about full lines?
    // console.log('-----> 1. importJSON CHN:', serializedNode, node, selection.anchor.getNode(), selection.anchor.getNode().getParent(), lexical.$getNodeByKey(node.__key), selection)
    return node;
  }

  exportJSON() {
    const node = {
      ...super.exportJSON(),
      highlightType: this.getHighlightType(),
      type: 'code-highlight',
      version: 1,
    };
    return node;
  }

  // Prevent formatting (bold, underline, etc)
  setFormat(format: number) {
    return this;
  }

  // canInsertTab() {
  //   return true;
  // }
}

export function $createCodeHighlightNode(
  text: string,
  highlightType?: string | null | undefined,
): CodeHighlightNode {
  return new CodeHighlightNode(text, highlightType);
}

export function $isCodeHighlightNode(
  node: LexicalNode | CodeHighlightNode | null | undefined,
): node is CodeHighlightNode {
  return node instanceof CodeHighlightNode;
}

function getHighlightThemeClass(
  theme: EditorThemeClasses,
  highlightType: string | null | undefined,
): string | null | undefined {
  return (
    highlightType &&
    theme &&
    theme.codeHighlight &&
    theme.codeHighlight[highlightType]
  );
}
