/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
// eslint-disable-next-line simple-import-sort/imports
import {
  Spread,
  // ElementNode,
  $getSelection,
  $isParagraphNode,
  NodeKey,
  Point,
  $isNodeSelection,
  LexicalNode,
  RangeSelection,
  EditorConfig,
  $isRangeSelection,
  SerializedElementNode,
  NodeSelection,
  GridSelection,
  ParagraphNode,
  $createParagraphNode,
} from 'lexical';

import * as Prism from 'prismjs';

import {
  $createCodeHighlightNode,
  $isCodeHighlightNodeN,
  CodeHighlightNodeN,
} from './chnNext';
import {$isCodeNodeN} from './cnNext';

export const DEFAULT_CODE_LANGUAGE = 'javascript';

type SerializedCodeLineNode = Spread<
  {
    type: 'code-line';
    version: 1;
  },
  SerializedElementNode
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

export class CodeLineNodeN extends ParagraphNode {
  // export class CodeLineNodeN extends ElementNode {
  constructor(key?: NodeKey) {
    super(key);
  }

  static getType() {
    return 'code-line';
  }

  static clone(node: CodeLineNodeN): CodeLineNodeN {
    return new CodeLineNodeN(node.__key);
  }

  // append(nodesToAppend: CodeHighlightNodeN[]): this {
  //   if (Array.isArray(nodesToAppend)) {
  //     const self = this.getLatest();
  //     const childrenSize = self.getChildrenSize();
  //     const startingIndex = childrenSize > 0
  //       ? childrenSize - 1
  //       : 0;

  //     // nodesToAppend.forEach((node) => {
  //     //   nodes.push(node);
  //     // });

  //     return super.splice(startingIndex, 0, nodesToAppend);
  //   }

  //   return null;
  // }

  splitLineText(offset: number) {
    const self = this.getLatest();
    const lineText = self.getTextContent();

    const textBeforeSplit = lineText.slice(0, offset);
    const textAfterSplit = lineText.slice(offset, lineText.length);

    return [textBeforeSplit, textAfterSplit];
  }

  tokenizePlainText(text: string) {
    const self = this.getLatest();
    const codeNode = self.getParent();
    const parentLanguage =
      codeNode !== null ? codeNode.getLanguage() || '' : '';
    const currentLanguage =
      Prism.languages[parentLanguage] || Prism.languages[DEFAULT_CODE_LANGUAGE];

    return Prism.tokenize(text, currentLanguage);
  }

  getLineComparison(text: string) {
    if (text.length === 0) return [];

    const self = this.getLatest();
    const tokens = self.tokenizePlainText(text);

    return getHighlightNodes(tokens, true);
  }

  getHighlightNodes(text: string) {
    if (text.length === 0) return [];

    const self = this.getLatest();
    const tokens = self.tokenizePlainText(text);

    return getHighlightNodes(tokens);
  }

  nextSelection(aOffset: number, bOffset?: number) {
    const self = this.getLatest();
    const selectStart = aOffset === 0 || self.isEmptyLine();

    if (selectStart) {
      self.selectStart();
    } else {
      const {childFromLineOffset: nextChildA, updatedChildOffset: nextOffsetA} =
        self.getChildFromLineOffset(aOffset);

      if (typeof bOffset === 'undefined' && typeof nextChildA !== 'undefined') {
        nextChildA.select(nextOffsetA, nextOffsetA);
      }

      // else if (typeof bOffset !== 'undefined') {
      //   const {
      //     childFromLineOffset: nextChildB,
      //     updatedChildOffset: nextOffsetB
      //   } = self.getChildFromLineOffset(bOffset);
      //   const selection = $getSelection();

      //   if (selection !== null) {
      //     selection.set(nextChildA, nextOffsetA, nextChildB, nextOffsetB);
      //   }
      // }
    }
  }

  updateLineCode() {
    const self = this.getLatest();
    const text = self.getTextContent();

    if (text.length > 0) {
      const children = self.getChildren();
      const comparison = self.getLineComparison(text);
      const isCurrent = children.every((child, idx) => {
        const expected = comparison[idx];
        return (
          child.__highlightType === expected.type &&
          child.__text === expected.content
        );
      });

      if (!isCurrent) {
        const code = self.getHighlightNodes(text) as CodeHighlightNodeN[];
        self.splice(0, self.getChildrenSize(), code);

        return true;
      }
    }

    return false;
  }

  replaceLineCode(text: string) {
    // TODO: set text, run update instead?
    // add initial code via .append
    const self = this.getLatest();
    const code = self.getHighlightNodes(text) as CodeHighlightNodeN[];

    self.splice(0, self.getChildrenSize(), code);
  }

  getLineOffset(point: Point) {
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
    let updatedChildOffset = lineOffset;

    const childFromLineOffset = children.find((_node) => {
      const textContentSize = _node.getTextContentSize();

      if (textContentSize >= updatedChildOffset) {
        return true;
      }

      updatedChildOffset -= textContentSize;

      return false;
    });

    return {
      childFromLineOffset,
      updatedChildOffset:
        typeof updatedChildOffset === 'number' ? updatedChildOffset : undefined,
    };
  }

  isEndOfLine() {
    const selection = $getSelection();

    if (selection !== null && !$isNodeSelection(selection)) {
      const self = this.getLatest();
      const anchor = selection.anchor;
      const lastChild = self.getLastChild();

      // null === empty line
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
    const self = this.getLatest();
    return self.getChildrenSize() === 0;
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

    if (codeNode !== null) {
      const childrenSize = codeNode.getChildrenSize();

      const isEndOfLine = self.isEndOfLine();
      const isLastLine = self.getIndexWithinParent() === childrenSize - 1;

      return isEndOfLine && isLastLine;
    }

    return false;
  }

  getFirstCharacterIndex(text: string) {
    const self = this.getLatest();
    const splitText = text.split('');
    const allSpaces = splitText.every((char) => {
      return self.isTabOrSpace(char);
    });

    if (allSpaces) return text.length;

    return splitText.findIndex((char) => {
      return !self.isTabOrSpace(char);
    });
  }

  getLineSpacers() {
    const self = this.getLatest();
    const lineText = self.getTextContent();
    const endIndex = self.getFirstCharacterIndex(lineText);

    return lineText.slice(0, endIndex > -1 ? endIndex : 0);
  }

  makeSpace(num: number) {
    return ' '.repeat(num);
  }

  insertControlledText(text: string) {
    const selection = $getSelection();

    if (selection !== null && $isRangeSelection(selection)) {
      const isCollapsed = selection.isCollapsed();
      const isStringPayload = typeof text === 'string';

      if (isStringPayload) {
        const {
          topPoint,
          splitText,
          topLine: line,
          lineRangeFromSelection: linesForUpdate,
        } = getLinesFromSelection(selection);

        if (typeof line !== 'undefined' && Array.isArray(linesForUpdate)) {
          if (isCollapsed) {
            // is empty line, help lexical insert initial text
            const code = line.getHighlightNodes(text) as CodeHighlightNodeN[];
            const firstHighlight = line.getFirstChild();

            line.append(...code);

            if (firstHighlight !== null) {
              firstHighlight.select();
            }
          } else if (Array.isArray(splitText)) {
            const lineOffset = line.getLineOffset(topPoint);
            const [textBeforeSplit, textAfterSplit] = splitText;
            const isTopLineEmpty = topPoint.getNode().isEmptyLine();

            if (isTopLineEmpty) {
              // top line of range is an empty line
              line.replaceLineCode(`${text}${textAfterSplit}`);
            } else {
              // bottom line of range is empty line
              line.replaceLineCode(`${textBeforeSplit}${text}`);
            }

            line.nextSelection(isTopLineEmpty ? 1 : lineOffset + 1);
            linesForUpdate.slice(1).forEach((ln) => ln.remove());
          }

          return true;
        }
      }
    }

    return false;
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
          // delete one empty line
          const prevLine = line.getPreviousSibling();

          if (prevLine !== null) {
            line.remove();
            prevLine.select();
          }
        } else {
          // delete ranges: line-to-line, line-to-highlight
          // same logic as used by highlight nodes...
          handleMultiLineDelete(line, linesForUpdate, topPoint);
        }

        return true;
      }
    }

    return false;
  }

  insertNewAfter(): ParagraphNode {
    const self = this.getLatest();
    const codeNode = self.getParent();

    if ($isCodeNodeN(codeNode)) {
      const lastLine = codeNode.getLastChild();

      if (lastLine !== null) {
        const prevLine = self.getPreviousSibling();
        const isLastLine = self.getKey() === lastLine.getKey();

        const isEmptyLastLine = isLastLine && self.getChildrenSize() === 0;
        const isEmptySecondToLastLine =
          isLastLine && prevLine?.getChildrenSize() === 0;
        const hasTwoEmptyLastLines = isEmptyLastLine && isEmptySecondToLastLine;

        if (hasTwoEmptyLastLines) {
          prevLine.remove();
          self.remove(); // must be last!

          return codeNode.insertNewAfter();
        }

        const selection = $getSelection();

        if (selection !== null && $isRangeSelection(selection)) {
          const isCollapsed = selection.isCollapsed();

          const {
            topPoint,
            bottomPoint,
            splitText,
            topLine: line,
            lineRangeFromSelection: linesForUpdate,
          } = getLinesFromSelection(selection);
          const isMultiLineRange =
            !isCollapsed && topPoint.key !== bottomPoint.key;

          if (typeof line !== 'undefined' && Array.isArray(linesForUpdate)) {
            const lineSpacers = line.getLineSpacers();
            const newLine = $createCodeLineNode();

            if (!isMultiLineRange) {
              const code = line.getHighlightNodes(
                lineSpacers,
              ) as CodeHighlightNodeN[];
              newLine.append(...code); // append initial code
            } else if (Array.isArray(splitText)) {
              const [textBeforeSplit, textAfterSplit] = splitText;
              let code;

              if (!selection.isBackward()) {
                code = line.getHighlightNodes(
                  `${lineSpacers}${textAfterSplit}`,
                ) as CodeHighlightNodeN[];
              } else {
                // is CodeLineNodeN when a backward selection starts at the bottom
                const newLineText = !$isCodeLineNodeN(bottomPoint.getNode())
                  ? `${lineSpacers}${textAfterSplit}`
                  : lineSpacers;
                code = line.getHighlightNodes(
                  newLineText,
                ) as CodeHighlightNodeN[];
                line.replaceLineCode(textBeforeSplit);
              }

              newLine.append(...code);
              linesForUpdate.slice(1).forEach((ln) => ln.remove());
            }

            // test b/c 0-idx strings make no children!
            const hasChildren = newLine.getChildrenSize() > 0;

            line.insertAfter(newLine);
            newLine.nextSelection(hasChildren ? lineSpacers.length : 0);

            return newLine;
          }
        }
      }
    }

    return $createParagraphNode();
  }

  createDOM(config: EditorConfig) {
    const dom = document.createElement('div');
    return dom;
  }

  // updateDOM(
  //   prevNode: ParagraphNode,
  //   dom: HTMLElement,
  // ): boolean {
  //   return false;
  // }

  // updateDOM(
  //   prevNode: CodeHighlightNodeN,
  //   dom: HTMLElement,
  //   config: EditorConfig,
  // ) {
  //   return false;
  // }

  // static importDOM() {
  //   return {};
  // }

  static importJSON(): CodeLineNodeN {
    // static importJSON(serializedNode: SerializedCodeLineNode): CodeLineNodeN {
    return $createCodeLineNode();
  }

  exportJSON(): SerializedCodeLineNode {
    const node: SerializedCodeLineNode = {
      ...super.exportJSON(),
      type: 'code-line',
      version: 1,
    };

    return node;
  }
}

export function $createCodeLineNode() {
  return new CodeLineNodeN();
}

export function $isCodeLineNodeN(
  node: LexicalNode | null | undefined,
): node is CodeLineNodeN {
  return node instanceof CodeLineNodeN;
}

// export function $isCodeLineNodeN(
//   node: LexicalNode | CodeLineNodeN | null | undefined,
// ): node is CodeLineNodeN {
//   return node instanceof CodeLineNodeN;
// }

interface PlainHighlight {
  content: Prism.TokenStream;
  type?: string;
}

function getHighlightNodes(
  tokens: (string | Prism.Token)[],
  forComparison = false,
) {
  const nextLine: (PlainHighlight | CodeHighlightNodeN)[] = [];

  tokens.forEach((token, idx) => {
    if (typeof token === 'string') {
      // not a token, just plain text
      const partials = token.split('\n');

      for (let i = 0; i < partials.length; i++) {
        const text = partials[i];

        if (text.length > 0) {
          nextLine.push(
            forComparison ? {content: text} : $createCodeHighlightNode(text),
          );
        }
      }
    } else {
      const {content, type} = token;

      if (typeof content === 'string' || idx === tokens.length - 1) {
        // a token representing code, as determined by prism
        nextLine.push(
          forComparison
            ? {content, type}
            : $createCodeHighlightNode(content as string, type),
        );
      } else if (
        Array.isArray(content) &&
        content.length === 1 &&
        typeof content[0] === 'string'
      ) {
        // a one-token array of code, decode and handle normally
        nextLine.push(
          forComparison
            ? {content: content[0], type}
            : $createCodeHighlightNode(content[0], type),
        );
      } else if (Array.isArray(content)) {
        // a multi-token array of code, process by recursion!
        nextLine.push(...getHighlightNodes(content));
      }
    }
  });

  return nextLine;
}

export function getLinesFromSelection(selection: RangeSelection) {
  const anchor = selection.anchor;
  const focus = selection.focus;

  // use original selection to normalize
  const topPoint = selection.isBackward() ? focus : anchor;
  const bottomPoint = selection.isBackward() ? anchor : focus;

  const topLine = (getLineFromPoint(topPoint) as CodeLineNodeN) || null;
  const bottomLine = (getLineFromPoint(bottomPoint) as CodeLineNodeN) || null;

  const skipLineSearch =
    topLine === null || bottomLine === null || !isInsideCodeNode(selection);

  if (skipLineSearch) {
    return {bottomPoint, topPoint};
  }

  const codeNode = topLine.getParent();

  if (codeNode === null) {
    return {bottomPoint, topPoint};
  }

  const startingLineIndex = topLine.getIndexWithinParent();
  const endingLineIndex = bottomLine.getIndexWithinParent() + 1;

  const lineRangeFromSelection = codeNode
    .getChildren()
    .slice(startingLineIndex, endingLineIndex) as CodeLineNodeN[];

  const topLineOffset = topLine.getLineOffset(topPoint);
  const bottomLineOffset = bottomLine.getLineOffset(bottomPoint);

  const [textBeforeSplit] = topLine.splitLineText(topLineOffset);
  const [, textAfterSplit] = bottomLine.splitLineText(bottomLineOffset);

  const splitText = [textBeforeSplit, textAfterSplit];

  return {
    bottomLine,
    bottomPoint,
    lineRangeFromSelection,
    splitText,
    topLine,
    topPoint,
  };
}

export function handleMultiLineDelete(
  line: CodeLineNodeN,
  linesForUpdate: CodeLineNodeN[],
  topPoint: Point,
) {
  const originalOffset = topPoint.offset;
  const lineOffset = line.getLineOffset(topPoint);
  const selection = $getSelection();

  if (selection !== null && $isRangeSelection(selection)) {
    const {splitText} = getLinesFromSelection(selection);

    if (Array.isArray(splitText)) {
      const [textBeforeSplit, textAfterSplit] = splitText;

      line.replaceLineCode(`${textBeforeSplit}${textAfterSplit}`);
      linesForUpdate.slice(1).forEach((ln) => ln.remove());

      if (originalOffset === 0) {
        line.selectStart();
      } else {
        const {childFromLineOffset: nextChild, updatedChildOffset: nextOffset} =
          line.getChildFromLineOffset(lineOffset);

        if (typeof nextChild !== 'undefined') {
          nextChild.select(nextOffset, nextOffset);
        }
      }
    }
  }
}

function getLineFromPoint(point: Point) {
  const pointNode = point.getNode();
  const parentNode = pointNode.getParent();

  if (
    parentNode !== null &&
    $isCodeLineNodeN(parentNode) &&
    parentNode.getChildren().length > 0
  ) {
    return parentNode;
  } else if ($isCodeLineNodeN(pointNode) || $isParagraphNode(pointNode)) {
    return pointNode;
  }

  return null;
}

export function isInsideCodeNode(
  selection: RangeSelection | NodeSelection | GridSelection | null,
) {
  if (!$isRangeSelection(selection)) return false;

  const anchor = selection?.anchor;
  const anchorNode = anchor?.getNode();

  switch (true) {
    case $isCodeHighlightNodeN(anchorNode):
    case $isCodeLineNodeN(anchorNode):
    case $isCodeNodeN(anchorNode):
      return true;
    default:
      return false;
  }
}
