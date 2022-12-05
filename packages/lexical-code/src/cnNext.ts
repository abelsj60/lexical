/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

// eslint-disable-next-line simple-import-sort/imports
import {
  $createLineBreakNode,
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  DOMConversionOutput,
  EditorConfig,
  ElementNode,
  LexicalNode,
  NodeKey,
  ParagraphNode,
  SerializedElementNode,
  Spread,
  TextNode,
} from 'lexical';
import * as Prism from 'prismjs';

import {addClassNamesToElement} from '../../lexical-utils/src';
import {
  $createCodeLineNode,
  $isCodeLineNodeN,
  CodeLineNodeN,
  Tokenizer,
} from './clnNext';
import {DEFAULT_CODE_LANGUAGE} from './CodeHighlightNode';

import 'prismjs/components/prism-c';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-objectivec';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-swift';

import * as Prism from 'prismjs';
import {addClassNamesToElement} from '../../lexical-utils/src';
import {DEFAULT_CODE_LANGUAGE} from './CodeHighlightNode';
import {$createCodeLineNode, CodeLineNodeN} from './clnNext';
import {CodeHighlightNodeN} from './chnNext';

type SerializedCodeNodeN = Spread<
  {
    __language: string | null | undefined;
    __options: SerializableCodeNodeOptions;
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
  __options: CodeNodeOptions;

  static getType() {
    return 'code';
  }

  static clone(node: CodeNodeN): CodeNodeN {
    return new CodeNodeN(node.__language, node.__key);
  }

  constructor(
    language?: string | null | undefined,
    options?: Partial<CodeNodeOptions>,
    key?: NodeKey,
  ) {
    super(key);
    this.__language = mapToPrismLanguage(
      language || (options && options.defaultLanguage),
    );
    this.__options = {
      codeOnly: (options && options.codeOnly) || false,
      defaultLanguage:
        (options && options.defaultLanguage) || DEFAULT_CODE_LANGUAGE,
      tokenizer: null, // unserializable, updated via plugin
    };
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
    node.setDirection(serializedNode.direction); // TODO: remove?
    return node;
  }

  exportJSON(): SerializedCodeNodeN {
    return {
      ...super.exportJSON(),
      __language: this.getLanguage(),
      __options: this.getSerializableConfig(),
      type: 'code',
      version: 1,
    };
  }

  hasBreakOutLine(): boolean {
    const self = this.getLatest();

    if (!self.getConfig().codeOnly) {
      const selection = $getSelection();

      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        const lastLine = self.getLastChild<CodeLineNodeN>();
        const isLastLineSelected =
          lastLine !== null && anchorNode.getKey() === lastLine.getKey();
        const isSelectedLastLineEmpty =
          isLastLineSelected && lastLine.isEmptyLine();

        if (isSelectedLastLineEmpty) {
          const previousLine = lastLine.getPreviousSibling<CodeLineNodeN>();
          return previousLine !== null && previousLine.isEmptyLine();
        }
      }
    }

    return false;
  }

  // Mutation
  insertNewAfter() {
    const self = this.getLatest();
    const lastLine = self.getLastChild() as CodeLineNodeN;
    const prevLine = lastLine.getPreviousSibling() as CodeLineNodeN;
    const paragraph = $createParagraphNode();

    paragraph.setDirection(this.getDirection());

    prevLine.remove();
    lastLine.remove();

    self.insertAfter(paragraph);
    paragraph.selectStart();

    return paragraph;
  }

  insertRawText(text: string) {
    const self = this.getLatest();

    if (typeof self.getLanguage() === 'undefined') {
      self.setLanguage(DEFAULT_CODE_LANGUAGE);
    }

    const lines = text.split(/\r?\n/g).reduce((lineHolder, line) => {
      const newLine = $createCodeLineNode();
      const code = newLine.getHighlightNodes(line);

      newLine.append(...code);
      lineHolder.push(newLine);

      return lineHolder;
    }, [] as CodeLineNodeN[]);

    self.splice(0, lines.length, lines);
    const lastLine = self.getLastChild();

    if ($isCodeLineNodeN(lastLine)) {
      lastLine.nextSelection(lastLine.getChildrenSize());
    }
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

  convertToDiv() {
    const self = this.getLatest();
    self.replace($createCodeNodeNConverter());
  }

  getPlainTextNodes() {
    const self = this.getLatest();

    self.convertToDiv(); // cancels overrides

    return self.getChildren().reduce((lineHolder, line) => {
      const paragraph = $createParagraphNode();
      const lineText = line.getTextContent();
      const textNode = new TextNode(lineText);

      paragraph.append(textNode);
      lineHolder.push(paragraph);

      return lineHolder;
    }, [] as ParagraphNode[]);
  }

  convertToPlainText() {
    const self = this.getLatest();
    const parent = self.getParent();

    if (parent !== null) {
      const index = self.getIndexWithinParent();
      const deleteCount = self.getChildrenSize();
      const plainTextNodes = self.getPlainTextNodes();

      parent.splice(index, deleteCount, plainTextNodes);

      return true;
    }

    return false;
  }

  collapseAtStart() {
    const self = this.getLatest();

    if (!this.getConfig().codeOnly) {
      return self.convertToPlainText();
    }

    return false;
  }

  setLanguage(language: string): void {
    const self = this.getLatest();
    const writable = self.getWritable();
    writable.__language = mapToPrismLanguage(language);
    self.updateLines(); // keep kids current
  }

  getLanguage() {
    return this.getLatest().__language;
  }

  setTokenizer(tokenizer: Tokenizer): void {
    const self = this.getLatest();
    const writable = self.getWritable();
    const currentConfig = writable.__options;

    writable.__options = {
      ...currentConfig,
      tokenizer,
    };
  }

  setConfig(options: Partial<CodeNodeOptions>) {
    const self = this.getLatest();
    const writable = self.getWritable();
    const currentConfig = self.getConfig();

    writable.__options = {
      codeOnly:
        typeof options.codeOnly !== 'undefined'
          ? options.codeOnly
          : currentConfig.codeOnly,
      defaultLanguage:
        typeof options.defaultLanguage !== 'undefined'
          ? options.defaultLanguage
          : currentConfig.defaultLanguage,
      tokenizer:
        typeof options.tokenizer !== 'undefined'
          ? options.tokenizer
          : currentConfig.tokenizer,
    };
  }

  getConfig(): CodeNodeOptions {
    return this.getLatest().__options;
  }

  getSerializableConfig(): SerializableCodeNodeOptions {
    return {
      ...this.getLatest().__options,
      tokenizer: null,
    };
  }

  updateLines(): void {
    const self = this.getLatest();

    self.getChildren().forEach((line) => {
      if ($isCodeLineNodeN(line)) {
        line.updateLineCode();
      }
    });
  }
}

export function $createCodeNodeN(
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
    node: $createCodeNodeN(),
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
    node: isCode ? $createCodeNodeN() : null,
    preformatted: isCode,
  };
}

function convertTableElement() {
  return {
    node: $createCodeNodeN(),
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

export class CodeNodeConverter extends ElementNode {
  static getType() {
    return 'code-node-converter';
  }

  static clone(): CodeNodeConverter {
    return new CodeNodeConverter();
  }

  constructor(key?: NodeKey) {
    super(key);
  }

  static importJSON() {
    return $createCodeNodeNConverter();
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'code-node-converter',
      version: 1,
    };
  }

  createDOM(): HTMLElement {
    const element = document.createElement('div');
    return element;
  }
}

export function $createCodeNodeNConverter(): CodeNodeConverter {
  return new CodeNodeConverter();
}

export function $isCodeNodeConverter(node: LexicalNode | null | undefined) {
  return node instanceof CodeNodeConverter;
}
