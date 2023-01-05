/* eslint-disable header/header */
// eslint-disable-next-line simple-import-sort/imports
import {
  $getSelection,
  $isRangeSelection,
  LexicalNode,
  Point,
  RangeSelection,
} from 'lexical';
import {$isLinedCodeHighlightNode} from './LinedCodeHighlightNode';

import {
  $isLinedCodeLineNode,
  LinedCodeLineNode,
  NormalizedToken,
  Token,
} from './LinedCodeLineNode';
import {$isLinedCodeNode, LinedCodeNode} from './LinedCodeNode';

type BorderPoints = {
  bottomPoint: Point;
  topPoint: Point;
};
type SelectedLines = {
  bottomLine?: LinedCodeLineNode;
  lineRange?: LinedCodeLineNode[];
  splitText?: string[];
  topLine?: LinedCodeLineNode;
};
type PartialLinesFromSelection = BorderPoints & Partial<SelectedLines>;
type LinesFromSelection = BorderPoints & SelectedLines;

export function getNormalizedTokens(
  tokens: (string | Token)[],
): NormalizedToken[] {
  return tokens.reduce((line, token) => {
    const isPlainText = typeof token === 'string';

    if (isPlainText) {
      line.push({content: token, type: undefined});
    } else {
      const {content, type} = token;

      const isStringToken = typeof content === 'string';
      const isNestedStringToken =
        Array.isArray(content) &&
        content.length === 1 &&
        typeof content[0] === 'string';
      const isNestedTokenArray = Array.isArray(content);

      if (isStringToken) {
        line.push({content: content as string, type});
      } else if (isNestedStringToken) {
        line.push({content: content[0] as string, type});
      } else if (isNestedTokenArray) {
        line.push(...getNormalizedTokens(content));
      }
    }

    return line;
  }, [] as NormalizedToken[]);
}

function getLineFromPoint(point: Point): LinedCodeLineNode | null {
  const pointNode = point.getNode();

  if ($isLinedCodeHighlightNode(pointNode)) {
    return pointNode.getParent();
  } else if ($isLinedCodeLineNode(pointNode)) {
    const isCodeLineNodeAssertion = (
      node: LexicalNode,
    ): node is LinedCodeLineNode => {
      return 'getHighlightNodes' in node;
    };

    if (isCodeLineNodeAssertion(pointNode)) {
      return pointNode;
    }
  }

  return null;
}

export function getLinesFromSelection(selection: RangeSelection) {
  const anchor = selection.anchor;
  const focus = selection.focus;

  const codeNode = getLinedCodeNode();
  const partialLineData = {} as PartialLinesFromSelection;

  partialLineData.topPoint = selection.isBackward() ? focus : anchor;
  partialLineData.bottomPoint = selection.isBackward() ? anchor : focus;

  const topLine = getLineFromPoint(partialLineData.topPoint);
  const bottomLine = getLineFromPoint(partialLineData.bottomPoint);

  const skipLineSearch =
    !$isLinedCodeNode(codeNode) ||
    !$isLinedCodeLineNode(topLine) ||
    !$isLinedCodeLineNode(bottomLine);

  if (!skipLineSearch) {
    const start = topLine.getIndexWithinParent();
    const end = bottomLine.getIndexWithinParent() + 1;
    const lineData = Object.assign({}, partialLineData) as LinesFromSelection;

    lineData.lineRange = codeNode
      .getChildren<LinedCodeLineNode>()
      .slice(start, end);
    lineData.topLine = topLine;
    lineData.bottomLine = bottomLine;

    const topLineOffset = topLine.getLineOffset(lineData.topPoint);
    const bottomLineOffset = bottomLine.getLineOffset(lineData.bottomPoint);

    const [textBefore] = topLine.splitLineText(topLineOffset);
    const [, textAfter] = bottomLine.splitLineText(bottomLineOffset);

    lineData.splitText = [textBefore, textAfter];

    return lineData;
  }

  return partialLineData;
}

export function getLinedCodeNode(): LinedCodeNode | null {
  const selection = $getSelection();

  if ($isRangeSelection(selection)) {
    const anchor = selection.anchor;
    const anchorNode = anchor.getNode().getLatest();
    const parentNode = anchorNode.getParent();
    const grandparentNode = parentNode && parentNode.getParent();

    if (parentNode !== null && grandparentNode !== null) {
      const codeNode =
        [
          anchorNode.getLatest(),
          parentNode.getLatest(),
          grandparentNode.getLatest(),
        ].find((node): node is LinedCodeNode => {
          return $isLinedCodeNode(node);
        }) || null;

      return codeNode;
    }
  }

  return null;
}

// export function getCodeNode(): LinedCodeNode | null {
//   const selection = $getSelection();

//   if ($isRangeSelection(selection)) {
//     const anchor = selection.anchor;
//     const anchorNode = anchor.getNode().getLatest();
//     const codeNode = $getNearestRootOrShadowRoot(anchorNode);

//     if ($isLinedCodeNode(codeNode)) {
//       return codeNode;
//     }
//   }

//   return null;
// }
