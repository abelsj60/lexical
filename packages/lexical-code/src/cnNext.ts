/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

// eslint-disable-next-line simple-import-sort/imports
import {
  SerializedElementNode,
  Spread,
  ElementNode,
  $createParagraphNode,
  $createLineBreakNode,
  LexicalNode,
  NodeKey,
  EditorConfig,
  DOMConversionOutput,
} from 'lexical';

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

import * as Prism from 'prismjs';
import {addClassNamesToElement} from '../../lexical-utils/src';
import {DEFAULT_CODE_LANGUAGE} from './CodeHighlightNode';
import {$createCodeLineNode, CodeLineNodeN} from './clnNext';
import {CodeHighlightNodeN} from './chnNext';

type SerializedCodeNodeN = Spread<
  {
    language: string | null | undefined;
    type: 'code';
    version: 1;
  },
  SerializedElementNode
>;

const mapToPrismLanguage = (
  language: string | null | undefined,
): string | null | undefined => {
  // eslint-disable-next-line no-prototype-builtins
  return language != null && Prism.languages.hasOwnProperty(language)
    ? language
    : undefined;
};

const LANGUAGE_DATA_ATTRIBUTE = 'data-highlight-language';

export class CodeNodeN extends ElementNode {
  /** @internal */
  __language: string | null | undefined;

  static getType() {
    return 'code';
  }

  static clone(node: CodeNodeN): CodeNodeN {
    return new CodeNodeN(node.__language, node.__key);
  }

  constructor(language?: string | null | undefined, key?: NodeKey) {
    super(key);
    this.__language = mapToPrismLanguage(language);
  }

  // View

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('code');
    addClassNamesToElement(element, config.theme.code);
    element.setAttribute('spellcheck', 'false');
    const language = this.getLanguage();

    if (language) {
      element.setAttribute(LANGUAGE_DATA_ATTRIBUTE, language);
    }

    return element;
  }

  updateDOM(prevNode: CodeNodeN, dom: HTMLElement): boolean {
    const language = this.__language;
    const prevLanguage = prevNode.__language;

    if (language) {
      if (language !== prevLanguage) {
        dom.setAttribute(LANGUAGE_DATA_ATTRIBUTE, language);
      }
    } else if (prevLanguage) {
      dom.removeAttribute(LANGUAGE_DATA_ATTRIBUTE);
    }

    return false;
  }

  static importDOM() {
    return {
      // Typically <pre> is used for code blocks, and <code> for inline code styles
      // but if it's a multi line <code> we'll create a block. Pass through to
      // inline format handled by TextNode otherwise
      code: (node: Node) => {
        const isMultiLine =
          node.textContent != null && /\r?\n/.test(node.textContent);
        return isMultiLine
          ? {
              conversion: convertPreElement,
              priority: 1,
            }
          : null;
      },
      div: (node: Node) => ({
        conversion: convertDivElement,
        priority: 1,
      }),
      pre: (node: Node) => ({
        conversion: convertPreElement,
        priority: 0,
      }),
      table: (node: Node) => {
        const table = node; // domNode is a <table> since we matched it by nodeName

        if (isGitHubCodeTable(table as HTMLTableElement)) {
          return {
            conversion: convertTableElement,
            priority: 4,
          };
        }

        return null;
      },
      td: (node: Node) => {
        // element is a <td> since we matched it by nodeName
        const td = node as HTMLTableCellElement;
        const table: HTMLTableElement | null = td.closest('table');

        if (isGitHubCodeCell(td)) {
          return {
            conversion: convertTableCellElement,
            priority: 4,
          };
        }

        if (table && isGitHubCodeTable(table)) {
          // Return a no-op if it's a table cell in a code table, but not a code line.
          // Otherwise it'll fall back to the T
          return {
            conversion: convertCodeNoop,
            priority: 4,
          };
        }

        return null;
      },
      tr: (node: Node) => {
        // element is a <tr> since we matched it by nodeName
        const tr = node as HTMLTableCellElement;
        const table = tr.closest('table');

        if (table && isGitHubCodeTable(table)) {
          return {
            conversion: convertCodeNoop,
            priority: 4,
          };
        }

        return null;
      },
    };
  }

  static importJSON(serializedNode: SerializedCodeNodeN): CodeNodeN {
    const node = $createCodeNode(serializedNode.language);
    node.setFormat(serializedNode.format);
    node.setIndent(serializedNode.indent);
    node.setDirection(serializedNode.direction);
    return node;
  }

  exportJSON(): SerializedCodeNodeN {
    return {
      ...super.exportJSON(),
      language: this.getLanguage(),
      type: 'code',
      version: 1,
    };
  }

  // Mutation
  insertNewAfter() {
    const newElement = $createParagraphNode();

    this.insertAfter(newElement);
    newElement.selectStart();

    return newElement;
  }

  insertRawText(text: string) {
    if (typeof this.getLanguage() === 'undefined') {
      this.setLanguage(DEFAULT_CODE_LANGUAGE);
    }

    const lines = text.split(/\n/g).reduce((lineHolder, line) => {
      const newLine = $createCodeLineNode();
      const code = newLine.getHighlightNodes(line) as CodeHighlightNodeN[];

      newLine.append(...code);
      lineHolder.push(newLine);

      return lineHolder;
    }, [] as CodeLineNodeN[]);

    this.splice(0, lines.length, lines);
    const lastLine = this.getLastChild() as CodeLineNodeN;

    if (lastLine !== null) {
      lastLine.nextSelection(lastLine.getChildrenSize());
    }
  }

  canIndent() {
    return false;
  }

  collapseAtStart() {
    const paragraph = $createParagraphNode();
    const children = this.getChildren();
    children.forEach((child) => paragraph.append(child));
    this.replace(paragraph);
    return true;
  }

  setLanguage(language: string): void {
    const writable = this.getWritable();
    writable.__language = mapToPrismLanguage(language);
  }

  getLanguage() {
    return this.getLatest().__language;
  }
}
export function $createCodeNode(
  language?: string | null | undefined,
): CodeNodeN {
  return new CodeNodeN(language);
}
export function $isCodeNodeN(
  node: LexicalNode | null | undefined,
): node is CodeNodeN {
  return node instanceof CodeNodeN;
}

function convertPreElement(domNode: Node): DOMConversionOutput {
  return {
    node: $createCodeNode(),
    preformatted: true,
  };
}

function convertDivElement(domNode: Node): DOMConversionOutput {
  // domNode is a <div> since we matched it by nodeName
  const div = domNode as HTMLDivElement;
  const isCode = isCodeElement(div);
  return {
    after: (childLexicalNodes) => {
      const domParent = domNode.parentNode;

      if (domParent != null && domNode !== domParent.lastChild) {
        childLexicalNodes.push($createLineBreakNode());
      }

      return childLexicalNodes;
    },
    node: isCode ? $createCodeNode() : null,
    preformatted: isCode,
  };
}

function convertTableElement() {
  return {
    node: $createCodeNode(),
    preformatted: true,
  };
}

function convertCodeNoop() {
  return {
    node: null,
  };
}

function convertTableCellElement(domNode: Node): DOMConversionOutput {
  // domNode is a <td> since we matched it by nodeName
  const cell = domNode as HTMLDivElement;
  return {
    after: (childLexicalNodes) => {
      if (cell.parentNode && cell.parentNode.nextSibling) {
        // Append newline between code lines
        childLexicalNodes.push($createLineBreakNode());
      }

      return childLexicalNodes;
    },
    node: null,
  };
}

function isCodeElement(div: HTMLDivElement): boolean {
  return div.style.fontFamily.match('monospace') !== null;
}

function isGitHubCodeCell(
  cell: HTMLTableCellElement,
): cell is HTMLTableCellElement {
  return cell.classList.contains('js-file-line');
}

function isGitHubCodeTable(table: HTMLTableElement): table is HTMLTableElement {
  return table.classList.contains('js-file-line-container');
}
