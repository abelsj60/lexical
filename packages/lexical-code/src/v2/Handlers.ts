/* eslint-disable header/header */
// eslint-disable-next-line simple-import-sort/imports
import {
  $getPreviousSelection,
  $getSelection,
  $isRangeSelection,
  LexicalNode,
  ParagraphNode,
  Point,
  TextNode,
} from 'lexical';
import {$isLinedCodeHighlightNode} from './LinedCodeHighlightNode';
import {$isLinedCodeLineNode, LinedCodeLineNode} from './LinedCodeLineNode';
import {$isLinedCodeNode, LinedCodeNode} from './LinedCodeNode';
import {getLinedCodeNode, getLinesFromSelection} from './utils';

type ArrowTypes = 'KEY_ARROW_UP_COMMAND' | 'KEY_ARROW_DOWN_COMMAND';
type DentTypes = 'INDENT_CONTENT_COMMAND' | 'OUTDENT_CONTENT_COMMAND';
type MoveTypes = 'MOVE_TO_START' | 'MOVE_TO_END';

function getNewTextSelectionKey(node: LexicalNode | null) {
  // The selection is set to type 'element' when the line is empty.
  // When a tab or space is added, it should be updated to type
  // 'text.' As we took over, it needs a helping hand...

  if ($isLinedCodeLineNode(node)) {
    const children = node.getChildren();

    if (children.length > 0) {
      return children[0].getKey();
    }
  }
}

function setPointAfterDent(
  isIndent: boolean,
  originalLineOffset: number,
  originalLineTextLength: number,
  line: LinedCodeLineNode,
  point: Point,
) {
  // note: There can be a slight delay when returning the selection
  // to 0 via the OUTDENT command. it would be nice to fix someday.
  const canUpdatePoint = isIndent
    ? line.getTextContentSize() > originalLineTextLength
    : originalLineTextLength > line.getTextContentSize();

  if (canUpdatePoint) {
    const pointNode = point.getNode();
    const newTextSelectionKey =
      isIndent && originalLineOffset === 0
        ? getNewTextSelectionKey(pointNode)
        : undefined;
    const nextOffset = isIndent
      ? originalLineOffset + 1
      : originalLineOffset > 0
      ? originalLineOffset - 1
      : originalLineOffset;

    if (nextOffset === 0) {
      if ($isLinedCodeLineNode(pointNode)) {
        pointNode.nextSelection(nextOffset);
      }
    } else {
      const {childFromLineOffset, updatedOffset} =
        line.getChildFromLineOffset(nextOffset);
      const isValid = childFromLineOffset && updatedOffset;

      if (isValid) {
        // use prevSelection for current status. seleciton updates
        // too fast...
        const prevSelection = $getPreviousSelection();
        const key =
          isIndent && newTextSelectionKey
            ? newTextSelectionKey
            : childFromLineOffset.getKey();
        const offset =
          newTextSelectionKey &&
          $isRangeSelection(prevSelection) &&
          !prevSelection.isCollapsed()
            ? 0
            : updatedOffset;
        const type =
          newTextSelectionKey || $isLinedCodeHighlightNode(childFromLineOffset)
            ? 'text'
            : 'element';

        point.set(key, offset, type);
      }
    }
  }
}

function doDent(line: LinedCodeLineNode, isIndent: boolean) {
  const lineText = line.getTextContent();
  const codeNode = line.getParent() as LinedCodeNode;

  if (isIndent) {
    codeNode.replaceLineCode(`\t${lineText}`, line);
  } else {
    const hasTabOrSpaceForDelete =
      lineText.startsWith('\t') || lineText.startsWith(' ');

    if (hasTabOrSpaceForDelete) {
      codeNode.replaceLineCode(lineText.substring(1), line);
    }
  }
}

export function handleDents(type: DentTypes): boolean {
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) {
    return false;
  }

  const {
    bottomLine,
    topLine,
    topPoint,
    bottomPoint,
    lineRange: linesForUpdate,
  } = getLinesFromSelection(selection);

  const isValid =
    $isLinedCodeLineNode(topLine) &&
    $isLinedCodeLineNode(bottomLine) &&
    Array.isArray(linesForUpdate);

  if (isValid) {
    const isIndent = type === 'INDENT_CONTENT_COMMAND';

    const topLineOffset = topLine.getLineOffset(topPoint);
    const bottomLineOffset = bottomLine.getLineOffset(bottomPoint);

    const topLineTextLength = topLine.getTextContentSize();
    const bottomLineTextLength = bottomLine.getTextContentSize();

    linesForUpdate.forEach((line) => doDent(line, isIndent));

    setPointAfterDent(
      isIndent,
      topLineOffset,
      topLineTextLength,
      topLine,
      topPoint,
    );

    setPointAfterDent(
      isIndent,
      bottomLineOffset,
      bottomLineTextLength,
      bottomLine,
      bottomPoint,
    );

    return true;
  }

  return false;
}

export function handleBorders(type: ArrowTypes, event: KeyboardEvent): boolean {
  const selection = $getSelection();

  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

  const {topLine: line} = getLinesFromSelection(selection);

  if ($isLinedCodeLineNode(line)) {
    const codeNode = line.getParent();

    if ($isLinedCodeNode(codeNode)) {
      if (!codeNode.getSettings().isLockedBlock) {
        const isArrowUp = type === 'KEY_ARROW_UP_COMMAND';

        if (isArrowUp && line.isStartOfFirstLine()) {
          if (codeNode.getPreviousSibling() === null) {
            event.preventDefault();
            codeNode.selectPrevious();
            return true;
          }
        } else if (!isArrowUp && line.isEndOfLastLine()) {
          if (codeNode.getNextSibling() === null) {
            event.preventDefault();
            codeNode.selectNext();
            return true;
          }
        }
      }
    }
  }

  return false;
}

function setMultiLineRange(
  topLineOffset: number,
  bottomLineOffset: number,
  topPoint: Point,
  bottomPoint: Point,
  topLine: LinedCodeLineNode,
  bottomLine: LinedCodeLineNode,
) {
  const {childFromLineOffset: nextTopNode, updatedOffset: nextTopOffset} =
    topLine.getChildFromLineOffset(topLineOffset);
  const {childFromLineOffset: nextBottomNode, updatedOffset: nextBottomOffset} =
    bottomLine.getChildFromLineOffset(bottomLineOffset);

  const isTopLine = typeof nextTopNode === 'undefined';
  const isBottomLine = typeof nextBottomNode === 'undefined';

  const topKey = !isTopLine ? nextTopNode.getKey() : topLine.getKey();
  const topOffset = !isTopLine ? (nextTopOffset as number) : 0;
  const topNodeType = !isTopLine ? 'text' : 'element';

  const bottomKey = !isBottomLine
    ? nextBottomNode.getKey()
    : bottomLine.getKey();
  const bottomOffset = !isBottomLine ? (nextBottomOffset as number) : 0;
  const bottomNodeType = !isBottomLine ? 'text' : 'element';

  topPoint.set(topKey, topOffset, topNodeType);
  bottomPoint.set(bottomKey, bottomOffset, bottomNodeType);
}

export function handleShiftingLines(
  type: ArrowTypes,
  event: KeyboardEvent,
): boolean {
  // We only care about the alt+arrow keys
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) {
    return false;
  }

  const {
    bottomPoint,
    topLine,
    bottomLine,
    topPoint,
    lineRange: linesForUpdate,
  } = getLinesFromSelection(selection);
  const isArrowUp = type === 'KEY_ARROW_UP_COMMAND';
  const isCollapsed = selection.isCollapsed();

  if ($isLinedCodeLineNode(topLine) && Array.isArray(linesForUpdate)) {
    // From here, we may not be able to be able to move the lines around,
    // but we want to return true either way to prevent
    // the event's default behavior.

    event.preventDefault();
    event.stopPropagation(); // required to stop cursor movement under Firefox

    const codeNode = topLine.getParent();

    if ($isLinedCodeNode(codeNode)) {
      const displacedLine = isArrowUp
        ? topLine.getPreviousSibling()
        : topLine.getNextSibling();
      const isEndOfBlock =
        $isLinedCodeLineNode(bottomLine) &&
        bottomLine.getKey() ===
          (codeNode.getLastChild() as LinedCodeLineNode).getKey();
      const isOutOfRoom =
        (!isArrowUp && isEndOfBlock) ||
        (isArrowUp && topLine.getPreviousSibling() === null);

      if (!isOutOfRoom && $isLinedCodeLineNode(displacedLine)) {
        const displacedLineIndex = displacedLine.getIndexWithinParent();
        const originalTopLineOffset = topLine.getLineOffset(topPoint);
        const originalBottomLineOffset =
          !isCollapsed && $isLinedCodeLineNode(bottomLine)
            ? bottomLine.getLineOffset(bottomPoint)
            : undefined;

        linesForUpdate.forEach((ln) => ln.remove());
        codeNode.splice(displacedLineIndex, 0, linesForUpdate);

        if (isCollapsed) {
          topLine.nextSelection(originalTopLineOffset);
        } else {
          const isMultiLineRange =
            $isLinedCodeLineNode(bottomLine) &&
            typeof originalBottomLineOffset === 'number';

          if (isMultiLineRange) {
            setMultiLineRange(
              originalTopLineOffset,
              originalBottomLineOffset,
              topPoint,
              bottomPoint,
              topLine,
              bottomLine,
            );
          }
        }
      }
    }
  }

  return true;
}

export function handleMoveTo(type: MoveTypes, event: KeyboardEvent): boolean {
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) {
    return false;
  }

  const {topLine: line} = getLinesFromSelection(selection);

  if ($isLinedCodeLineNode(line)) {
    const isMoveToStart = type === 'MOVE_TO_START';

    event.preventDefault();
    event.stopPropagation();

    const {topPoint} = getLinesFromSelection(selection);
    const lineOffset = line.getLineOffset(topPoint);
    const firstCharacterIndex = line.getFirstCharacterIndex(lineOffset);
    const lastCharacterIndex = line.getTextContentSize();
    const {childFromLineOffset, updatedOffset} = isMoveToStart
      ? line.getChildFromLineOffset(firstCharacterIndex)
      : line.getChildFromLineOffset(lastCharacterIndex);

    if ($isLinedCodeHighlightNode(childFromLineOffset)) {
      if (typeof updatedOffset === 'number') {
        childFromLineOffset.select(updatedOffset, updatedOffset);
      }
    }
  }

  return true;
}

export function handlePlainTextConversion(): boolean {
  const selection = $getSelection();

  if ($isRangeSelection(selection)) {
    const codeNode = getLinedCodeNode();

    if ($isLinedCodeNode(codeNode)) {
      const parent = codeNode.getParent();

      const firstCodeLine = codeNode.getFirstChild() as LinedCodeLineNode;
      const lastCodeLine = codeNode.getLastChild() as LinedCodeLineNode;

      const firstCodeLineIndex = firstCodeLine.getIndexWithinParent();
      const lastCodeLineIndex = lastCodeLine.getIndexWithinParent();

      codeNode.convertToPlainText();

      if (parent !== null) {
        const firstParagraph = parent.getChildAtIndex(
          firstCodeLineIndex,
        ) as ParagraphNode;
        const lastParagraph = parent.getChildAtIndex(
          lastCodeLineIndex,
        ) as ParagraphNode;

        const firstTextChild = firstParagraph.getFirstChild() as TextNode;
        const lastTextChild = lastParagraph.getLastChild() as TextNode;

        selection.setTextNodeRange(
          firstTextChild,
          0,
          lastTextChild,
          lastTextChild.getTextContentSize(),
        );
      }

      return true;
    }
  }

  return false;
}
