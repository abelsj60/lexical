/* eslint-disable header/header */
// eslint-disable-next-line simple-import-sort/imports
import {
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  EditorConfig,
  LexicalNode,
  NodeKey,
  ParagraphNode,
  Point,
  SerializedParagraphNode,
  Spread,
} from 'lexical';
import * as Prism from 'prismjs';

import {
  addClassNamesToElement,
  removeClassNamesFromElement,
} from '../../../lexical-utils/src';
import {
  $createLinedCodeHighlightNode,
  LinedCodeHighlightNode,
} from './LinedCodeHighlightNode';
import {$isLinedCodeNode} from './LinedCodeNode';
import {getLinesFromSelection, getNormalizedTokens} from './utils';

export const DEFAULT_CODE_LANGUAGE = 'javascript';

type TokenContent = string | Token | (string | Token)[];

export interface Token {
  type: string;
  content: TokenContent;
}

export interface NormalizedToken {
  type: string | undefined;
  content: string;
}

export interface Tokenizer {
  tokenize(text: string, language?: string): (string | Token)[];
}

export const PrismTokenizer: Tokenizer = {
  tokenize(text: string, language: string): (string | Token)[] {
    return Prism.tokenize(text, language as Prism.Grammar);
  },
};

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
  ts: 'TypeScript',
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

export const mapToPrismLanguage = (
  language: string | undefined,
): string | undefined => {
  // eslint-disable-next-line no-prototype-builtins
  return language != null && Prism.languages.hasOwnProperty(language)
    ? language
    : undefined;
};

type SerializedLinedCodeLineNode = Spread<
  {
    discreteLineClasses: string | undefined;
    type: 'code-line';
    version: 1;
  },
  SerializedParagraphNode
>;

// Do we want to avoid a 'type'-mismatch error for ParagraphNode. We do!
// re: complicated subclass types: https://stackoverflow.com/a/57211915
const TypelessParagraphNode: (new (key?: NodeKey) => ParagraphNode) &
  Omit<ParagraphNode, 'type'> = ParagraphNode;

export class LinedCodeLineNode extends TypelessParagraphNode {
  /** @internal */
  __discreteLineClasses: string | undefined;

  static getType() {
    return 'code-line';
  }

  static clone(node: LinedCodeLineNode): LinedCodeLineNode {
    return new LinedCodeLineNode(node.__discreteLineClasses, node.__key);
  }

  constructor(discreteLineClasses?: string, key?: NodeKey) {
    super(key);
    // Generally speaking, you'll only set this in response to user interaction
    // right now. As a result, you'll never set this during initialization.
    // It is included and updated via .clone and .update to ensure
    // changes survie reconciliation...
    this.__discreteLineClasses = discreteLineClasses;
  }

  getDiscreteLineClasses() {
    return this.getLatest().__discreteLineClasses;
  }

  addDiscreteLineClasses(lineClasses: string): boolean {
    const self = this.getLatest();
    const writable = this.getWritable();
    const discreteLineClasses = self.getDiscreteLineClasses();

    if (discreteLineClasses) {
      const splitDiscreteLineClasses = discreteLineClasses.split(' ');
      const splitLineClasses = lineClasses.split(' ');
      const nextClasses = splitLineClasses.reduce((list, nextLineClass) => {
        const hasLineClass = splitDiscreteLineClasses.some(
          (currentLineClass) => {
            return currentLineClass === nextLineClass;
          },
        );

        if (!hasLineClass) {
          list.push(nextLineClass);
          return list;
        }

        return list;
      }, splitDiscreteLineClasses);

      writable.__discreteLineClasses = nextClasses.join(' ');

      return true;
    }

    return false;
  }

  removeDiscreteLineClasses(lineClasses: string): boolean {
    const self = this.getLatest();
    const writable = this.getWritable();
    const discreteLineClasses = self.getDiscreteLineClasses();

    if (discreteLineClasses) {
      const splitDiscreteLineClasses = discreteLineClasses.split(' ');
      const splitLineClasses = lineClasses.split(' ');
      const nextClasses = splitLineClasses.reduce((list, nextLineClass) => {
        // use toggle to remove line numbers, don't do it manually...
        if (nextLineClass === 'show-line-numbers') {
          return list;
        }

        const hasLineClass = list.some((currentLineClass) => {
          return currentLineClass === nextLineClass;
        });

        if (hasLineClass) {
          return list.filter((currentLineClass) => {
            return currentLineClass !== nextLineClass;
          });
        }

        return list;
      }, splitDiscreteLineClasses);

      writable.__discreteLineClasses = nextClasses.join(' ');

      return true;
    }

    return false;
  }

  splitLineText(lineOffset: number) {
    const self = this.getLatest();
    const lineText = self.getTextContent();

    const textBeforeSplit = lineText.slice(0, lineOffset);
    const textAfterSplit = lineText.slice(lineOffset, lineText.length);

    return [textBeforeSplit, textAfterSplit];
  }

  tokenizePlainText(plainText: string): (string | Token)[] {
    const self = this.getLatest();
    const codeNode = self.getParent();

    let language = Prism.languages[DEFAULT_CODE_LANGUAGE];
    let tokenize = PrismTokenizer.tokenize;

    if ($isLinedCodeNode(codeNode)) {
      const config = codeNode.getOptions();
      const configLanguage = codeNode.getLanguage() || config.defaultLanguage;
      const configTokenizer = config.tokenizer;

      if (configLanguage) {
        language = Prism.languages[configLanguage];
      }

      if (configTokenizer) {
        tokenize = configTokenizer.tokenize;
      }
    }

    return tokenize(plainText, language as string);
  }

  getNormalizedTokens(plainText: string): NormalizedToken[] {
    // this allows for diffing w/o wasting node keys
    if (plainText.length === 0) return [];

    const self = this.getLatest();
    const tokens = self.tokenizePlainText(plainText);

    return getNormalizedTokens(tokens);
  }

  getHighlightNodes(text: string): LinedCodeHighlightNode[] {
    if (text.length === 0) return [];

    const self = this.getLatest();
    const normalizedTokens = self.getNormalizedTokens(text);

    return normalizedTokens.map((token) => {
      return $createLinedCodeHighlightNode(token.content, token.type);
    });
  }

  nextSelection(aOffset: number, bOffset?: number) {
    const self = this.getLatest();
    const selectStart = aOffset === 0 || self.isEmptyLine();

    if (selectStart) {
      self.selectStart();
    } else {
      const {childFromLineOffset: nextChildA, updatedOffset: nextOffsetA} =
        self.getChildFromLineOffset(aOffset);

      if (typeof bOffset === 'undefined' && typeof nextChildA !== 'undefined') {
        nextChildA.select(nextOffsetA, nextOffsetA);
      }
    }
  }

  // nextSelection(lineOffset: number) {
  //   const self = this.getLatest();
  //   const selectStart = lineOffset === 0 || self.isEmptyLine();

  //   if (selectStart) {
  //     self.selectStart();
  //   } else {
  //     const {childFromLineOffset, updatedOffset} =
  //       self.getChildFromLineOffset(lineOffset);

  //     if (
  //       $isLinedCodeLineNode(childFromLineOffset) &&
  //       typeof updatedOffset !== 'undefined'
  //     ) {
  //       childFromLineOffset.select(updatedOffset, updatedOffset);
  //     }
  //   }
  // }

  isLineCurrent(): boolean {
    const self = this.getLatest();
    const text = self.getTextContent();
    const children = self.getChildren<LinedCodeHighlightNode>();
    const normalizedTokens = self.getNormalizedTokens(text);

    // why? empty text strings can cause length mismatch on paste
    if (children.length !== normalizedTokens.length) return false;

    return children.every((child, idx) => {
      const expected = normalizedTokens[idx];

      return (
        child.__highlightType === expected.type &&
        child.__text === expected.content
      );
    });
  }

  updateLineCode(): boolean {
    // call .isCurrent() first!
    const self = this.getLatest();
    const text = self.getTextContent();

    if (text.length > 0) {
      self.replaceLineCode(text);
      return true;
    }

    return false;
  }

  replaceLineCode(text: string): LinedCodeHighlightNode[] {
    const self = this.getLatest();
    const code = self.getHighlightNodes(text);

    self.splice(0, self.getChildrenSize(), code);

    return self.getChildren();
  }

  getLineOffset(point: Point) {
    const pointNode = point.getNode();
    const isEmptyLine =
      $isLinedCodeLineNode(pointNode) && pointNode.isEmptyLine();

    if (isEmptyLine) {
      return 0;
    }

    const previousSiblings = point.getNode().getPreviousSiblings();

    return (
      point.offset +
      previousSiblings.reduce((offset, _node) => {
        return (offset += _node.getTextContentSize());
      }, 0)
    );
  }

  getChildFromLineOffset(lineOffset: number) {
    const self = this.getLatest();
    const children = self.getChildren();
    let updatedOffset = lineOffset;

    const childFromLineOffset = children.find((_node) => {
      const textContentSize = _node.getTextContentSize();

      if (textContentSize >= updatedOffset) {
        return true;
      }

      updatedOffset -= textContentSize;

      return false;
    });

    return {
      childFromLineOffset,
      updatedOffset: typeof updatedOffset === 'number' ? updatedOffset : null,
    };
  }

  isEndOfLine() {
    const selection = $getSelection();

    if ($isRangeSelection(selection)) {
      const self = this.getLatest();
      const anchor = selection.anchor;
      const lastChild = self.getLastChild();

      // null = empty line
      if (lastChild !== null) {
        const isLastChild = anchor.key === lastChild.getKey();
        const isLastOffset = anchor.offset === lastChild.getTextContentSize();

        return isLastChild && isLastOffset;
      }
    }

    return false;
  }

  isTabOrSpace(char: string) {
    const isString = typeof char === 'string';
    const isMultipleCharacters = char.length > 1;

    if (!isString || isMultipleCharacters) return false;

    return /[\t ]/.test(char);
  }

  isEmptyLine() {
    // TODO: replace w/just isEmpty()
    const self = this.getLatest();
    return self.isEmpty();
    // return self.getChildrenSize() === 0;
  }

  isStartOfLine() {
    const selection = $getSelection();

    if (selection !== null && !$isNodeSelection(selection)) {
      const isCollapsed = selection.isCollapsed();
      const isOffsetZero = isCollapsed && selection.anchor.offset === 0;

      return isOffsetZero;
    }

    return false;
  }

  isStartOfFirstLine() {
    const self = this.getLatest();
    const isStartOfLine = self.isStartOfLine();
    const isFirstLine = self.getIndexWithinParent() === 0;

    return isStartOfLine && isFirstLine;
  }

  isEndOfLastLine() {
    const self = this.getLatest();
    const codeNode = self.getParent();

    if ($isLinedCodeNode(codeNode)) {
      const childrenSize = codeNode.getChildrenSize();

      const isEndOfLine = self.isEndOfLine();
      const isLastLine = self.getIndexWithinParent() === childrenSize - 1;

      return isEndOfLine && isLastLine;
    }

    return false;
  }

  getFirstCharacterIndex(lineOffset: number): number {
    const self = this.getLatest();
    const text = self.getTextContent();
    const splitText = text.slice(0, lineOffset).split('');
    const allSpaces = splitText.every((char) => {
      return self.isTabOrSpace(char);
    });

    if (allSpaces) return splitText.length;

    return splitText.findIndex((char) => {
      return !self.isTabOrSpace(char);
    });
  }

  // TODO: still needed?
  collapseAtStart(): boolean {
    const self = this.getLatest();
    const parent = self.getParent();

    if ($isLinedCodeNode(parent)) {
      return parent.collapseAtStart();
    }

    return false;
  }

  insertNewAfter(): LinedCodeLineNode | ParagraphNode {
    const self = this.getLatest();

    const codeNode = self.getParent();
    const hasBreakOutLine =
      $isLinedCodeNode(codeNode) && codeNode.hasBreakOutLine();

    if (hasBreakOutLine) {
      return codeNode.insertNewAfter();
    }

    const selection = $getSelection();

    if ($isRangeSelection(selection)) {
      const {
        topPoint,
        splitText = [],
        topLine: line,
        lineRange: linesForUpdate,
      } = getLinesFromSelection(selection);

      if ($isLinedCodeLineNode(line) && Array.isArray(linesForUpdate)) {
        const newLine = $createLinedCodeLineNode();

        const lineOffset = line.getLineOffset(topPoint);
        const firstCharacterIndex = line.getFirstCharacterIndex(lineOffset);
        const lineSpacers =
          firstCharacterIndex > 0
            ? line.getTextContent().slice(0, firstCharacterIndex)
            : '';
        const [beforeSplit, afterSplit] = splitText;
        const trimEnd = afterSplit
          .slice(0, lineSpacers.length)
          .split('')
          .every((char) => {
            return line.isTabOrSpace(char);
          });
        const afterSplitAndSpacers = `${lineSpacers}${
          trimEnd ? afterSplit.trimEnd() : afterSplit
        }`;
        const code = line.getHighlightNodes(afterSplitAndSpacers);

        newLine.append(...code);

        line.insertAfter(newLine);
        line.replaceLineCode(beforeSplit);
        linesForUpdate.slice(1).forEach((ln) => ln.remove());

        const hasChildren = newLine.getChildrenSize() > 0;

        newLine.setDirection(self.getDirection());
        newLine.nextSelection(hasChildren ? lineSpacers.length : 0);

        return newLine;
      }
    }

    return $createLinedCodeLineNode();
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement('div');

    const self = this.getLatest();
    const codeNode = self.getParent();

    let lineClasses = self.getDiscreteLineClasses() || '';

    if ($isLinedCodeNode(codeNode)) {
      const {lineNumbers, theme} = codeNode.getOptions();
      const direction = self.getDirection();

      if (theme && theme.codeLine && theme.codeLine.classes) {
        lineClasses = `${lineClasses} ${theme.codeLine.classes}`;
      }

      if (lineNumbers) {
        if (theme && theme.codeLine && theme.codeLine.numberClasses) {
          lineClasses = `${lineClasses} ${theme.codeLine.numberClasses}`;
        } else {
          console.error(
            'Line numbers require a numberClass on the LinedCodeNode theme.',
          );
        }
      }

      if (direction !== null && config.theme[direction]) {
        lineClasses = `${lineClasses} ${config.theme[direction]}`;
      }

      addClassNamesToElement(dom, lineClasses);
      dom.setAttribute('line-number', String(self.getLineNumber()));
    }

    return dom;
  }

  updateDOM(
    prevNode: LinedCodeLineNode,
    dom: HTMLElement,
    config: EditorConfig,
  ): boolean {
    const update = super.updateDOM(prevNode, dom);

    const self = this.getLatest();
    const codeNode = self.getParent();

    let lineClasses = self.getDiscreteLineClasses() || '';

    if ($isLinedCodeNode(codeNode)) {
      const {theme} = codeNode.getOptions();
      const nextLineNumber = String(self.getLineNumber());
      const prevLineNumber = dom.getAttribute('line-number');
      const prevClasses = dom.className;
      const direction = self.getDirection();

      if (theme && theme.codeLine && theme.codeLine.classes) {
        lineClasses = `${lineClasses} ${theme.codeLine.classes}`;
      }

      // fyi, lineNumber should be true, too...
      if (theme && theme.codeLine && theme.codeLine.numberClasses) {
        lineClasses = `${lineClasses} ${theme.codeLine.numberClasses}`;
      }

      if (direction !== null && config.theme[direction]) {
        lineClasses = `${lineClasses} ${config.theme[direction]}`;
      }

      const classesNeedUpdate = lineClasses.split(' ').some((cls) => {
        return !dom.classList.contains(cls);
      });

      if (classesNeedUpdate) {
        if (prevClasses) {
          removeClassNamesFromElement(dom, prevClasses);
        }

        // if you're here, lineClasses must exist
        addClassNamesToElement(dom, lineClasses);
      }

      if (prevLineNumber !== nextLineNumber) {
        dom.setAttribute('line-number', nextLineNumber);
      }

      return update;
    }

    return false;
  }

  getLineNumber() {
    return this.getLatest().getIndexWithinParent() + 1;
  }

  static importJSON(
    serializedNode: SerializedLinedCodeLineNode,
  ): LinedCodeLineNode {
    const node = $createLinedCodeLineNode();
    node.setDirection(serializedNode.direction);
    return node;
  }

  exportJSON(): SerializedLinedCodeLineNode {
    return {
      ...super.exportJSON(),
      discreteLineClasses: this.getLatest().getDiscreteLineClasses(),
      type: 'code-line',
      version: 1,
    };
  }

  extractWithChild(): boolean {
    return true;
  }
}

export function $createLinedCodeLineNode(discreteLineClasses?: string) {
  return new LinedCodeLineNode(discreteLineClasses);
}

export function $isLinedCodeLineNode(
  node: LexicalNode | null | undefined,
): node is LinedCodeLineNode {
  return node instanceof LinedCodeLineNode;
}
