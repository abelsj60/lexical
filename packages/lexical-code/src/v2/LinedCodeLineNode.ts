/* eslint-disable header/header */
// eslint-disable-next-line simple-import-sort/imports
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  EditorConfig,
  LexicalNode,
  NodeKey,
  ParagraphNode,
  Point,
  SerializedParagraphNode,
  Spread,
} from 'lexical';

import {
  addClassNamesToElement,
  removeClassNamesFromElement,
} from '../../../lexical-utils/src';
import {$isLinedCodeNode, LinedCodeNode} from './LinedCodeNode';
import {$getLinesFromSelection, isTabOrSpace} from './utils';

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

    // You'll generally only set this in response to user interaction, not
    // during initialization. We include it as a constructor option so
    // it .clone and .updateDOM keep it during reconciliation.
    this.__discreteLineClasses = discreteLineClasses;
  }

  // View

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement('div');

    const self = this.getLatest();
    const codeNode = self.getParent();

    let lineClasses = self.getDiscreteLineClasses() || '';

    if ($isLinedCodeNode(codeNode)) {
      const {lineNumbers, theme} = codeNode.getSettings();
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
      const {theme} = codeNode.getSettings();
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

  // Mutation

  collapseAtStart(): boolean {
    const self = this.getLatest();
    const codeNode = self.getParent();

    if ($isLinedCodeNode(codeNode)) {
      return codeNode.collapseAtStart();
    }

    return false;
  }

  insertNewAfter(): LinedCodeLineNode | ParagraphNode {
    const self = this.getLatest();

    const codeNode = self.getParent() as LinedCodeNode;

    if (codeNode.hasBreakOutLine()) {
      return codeNode.insertNewAfter();
    }

    const selection = $getSelection();

    if ($isRangeSelection(selection)) {
      const {
        topPoint,
        splitText = [],
        topLine: line,
        lineRange: linesForUpdate,
      } = $getLinesFromSelection(selection);

      if ($isLinedCodeLineNode(line) && Array.isArray(linesForUpdate)) {
        const newLine = $createLinedCodeLineNode();

        const lineOffset = line.getLineOffset(topPoint);
        const firstCharacterIndex = line.getFirstCharacterIndex(lineOffset);
        const lineSpacers =
          firstCharacterIndex > 0
            ? line.getTextContent().slice(0, firstCharacterIndex)
            : '';
        const [beforeSplit, afterSplit] = splitText;
        const shouldTrimEnd = afterSplit
          .slice(0, lineSpacers.length)
          .split('')
          .every((char) => {
            return isTabOrSpace(char);
          });
        const afterSplitAndSpacers = `${lineSpacers}${
          shouldTrimEnd ? afterSplit.trimEnd() : afterSplit
        }`;
        const code = codeNode.getHighlightNodes(afterSplitAndSpacers);

        newLine.append(...code);

        line.insertAfter(newLine);
        codeNode.replaceLineCode(beforeSplit, line);
        linesForUpdate.slice(1).forEach((ln) => ln.remove());

        const hasChildren = newLine.getChildrenSize() > 0;

        newLine.setDirection(self.getDirection());
        newLine.selectNext(hasChildren ? lineSpacers.length : 0);

        return newLine;
      }
    }

    return $createLinedCodeLineNode();
  }

  selectNext(anchorOffset?: number, focusOffset?: number) {
    const self = this.getLatest();
    const isEmpty = self.isEmpty();
    const canSelectNextLinePosition =
      typeof anchorOffset !== 'undefined' || isEmpty;

    if (canSelectNextLinePosition) {
      const canSelectCollapsedPoint =
        typeof anchorOffset === 'number' && typeof focusOffset !== 'number';
      const canSelectRange =
        typeof anchorOffset === 'number' && typeof focusOffset === 'number';

      if (isEmpty) {
        return self.selectStart();
      } else if (canSelectCollapsedPoint) {
        const {childFromLineOffset: nextChild, updatedOffset: nextOffset} =
          self.getChildFromLineOffset(anchorOffset);
        const canSelectNewChild = nextChild && typeof nextOffset === 'number';

        if (canSelectNewChild) {
          return nextChild.select(nextOffset, nextOffset);
        }
      } else if (canSelectRange) {
        const {childFromLineOffset: nextChildA, updatedOffset: nextOffsetA} =
          self.getChildFromLineOffset(anchorOffset);
        const {childFromLineOffset: nextChildB, updatedOffset: nextOffsetB} =
          self.getChildFromLineOffset(focusOffset);

        const canSelectA = nextChildA && typeof nextOffsetA === 'number';
        const canSelectB = nextChildB && typeof nextOffsetB === 'number';

        if (canSelectA && canSelectB) {
          const selection = $getSelection();

          if ($isRangeSelection(selection)) {
            selection.anchor.set(
              nextChildA.getKey(),
              nextOffsetA,
              $isTextNode(nextChildA) ? 'text' : 'element',
            );
            selection.focus.set(
              nextChildB.getKey(),
              nextOffsetB,
              $isTextNode(nextChildB) ? 'text' : 'element',
            );

            return $getSelection();
          }
        }
      }
    }

    return super.selectNext(anchorOffset, focusOffset);
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

  // Helpers

  getDiscreteLineClasses() {
    return this.getLatest().__discreteLineClasses;
  }

  getLineOffset(point: Point) {
    const pointNode = point.getNode();
    const isEmpty = $isLinedCodeLineNode(pointNode) && pointNode.isEmpty();

    if (isEmpty) {
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

  getFirstCharacterIndex(lineOffset: number): number {
    const self = this.getLatest();
    const text = self.getTextContent();
    const splitText = text.slice(0, lineOffset).split('');
    const isAllSpaces = splitText.every((char) => {
      return isTabOrSpace(char);
    });

    if (isAllSpaces) return splitText.length;

    return splitText.findIndex((char) => {
      return !isTabOrSpace(char);
    });
  }

  getLineNumber() {
    return this.getLatest().getIndexWithinParent() + 1;
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
