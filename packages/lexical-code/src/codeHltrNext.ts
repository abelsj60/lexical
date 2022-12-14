/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

// eslint-disable-next-line simple-import-sort/imports
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  COPY_COMMAND,
  createCommand,
  LexicalCommand,
  PASTE_COMMAND,
  Point,
} from 'lexical';
import * as React from 'react';

import {mergeRegister} from '../../lexical-utils/src';
import {
  $getNodeByKey,
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  INDENT_CONTENT_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  LexicalEditor,
  MOVE_TO_END,
  MOVE_TO_START,
  OUTDENT_CONTENT_COMMAND,
  ParagraphNode,
  TextNode,
} from '../../lexical/src';
import {$isCodeHighlightNodeN, CodeHighlightNodeN} from './chnNext';
import {
  $isCodeLineNodeN,
  CodeLineNodeN,
  getCodeNode,
  getLinesFromSelection,
  isCodeNodeActive,
  Tokenizer,
} from './clnNext';
import {$isCodeNodeN, CodeNodeConverter, CodeNodeN} from './cnNext';

type ArrowTypes = 'KEY_ARROW_UP_COMMAND' | 'KEY_ARROW_DOWN_COMMAND';
type DentTypes = 'INDENT_CONTENT_COMMAND' | 'OUTDENT_CONTENT_COMMAND';

function updateHighlightsWhenTyping(highlightNode: CodeHighlightNodeN) {
  const selection = $getSelection();

  if ($isRangeSelection(selection)) {
    // always has parent line, so casting for convenience
    const line = highlightNode.getParent() as CodeLineNodeN;

    if ($isCodeLineNodeN(line)) {
      if (!line.isLineCurrent()) {
        const {topPoint} = getLinesFromSelection(selection);
        // get lineOffset before update, as it may change
        const lineOffset = line.getLineOffset(topPoint);

        if (line.updateLineCode()) {
          line.nextSelection(lineOffset);
        }
      }
    }
  }
}

function updateCodeGutter(node: CodeNodeN, editor: LexicalEditor): void {
  const codeElement = editor.getElementByKey(node.getKey());

  if (codeElement === null) {
    return;
  }

  const children = node.getChildren();
  const childrenLength = children.length; // @ts-ignore: internal field

  if (childrenLength === codeElement.__cachedChildrenLength) {
    // Avoid updating the attribute if the children length hasn't changed.
    return;
  } // @ts-ignore:: internal field

  const firstChildNode = node.getChildAtIndex(0);
  const isLine = $isCodeLineNodeN(firstChildNode);
  // @ts-ignore:: internal field
  codeElement.__cachedChildrenLength = childrenLength;
  let gutter = '1';
  let count = 1;

  for (let i = 0; i < childrenLength; i++) {
    // TODO: still needed - no grafs?
    if (!isLine) {
      // TODO: still needed??? No more line breaks...
      if ($isLineBreakNode(children[i])) {
        gutter += '\n' + ++count;
      }
    } else if (count <= childrenLength - 1) {
      gutter += '\n' + ++count;
    }
  }

  codeElement.setAttribute('data-gutter', gutter);
}

function doLineIndent(line: CodeLineNodeN, type: DentTypes) {
  const text = line.getTextContent();

  if (type === 'INDENT_CONTENT_COMMAND') {
    line.replaceLineCode(`\t${text}`);
  } else if (text.startsWith('\t')) {
    line.replaceLineCode(text.substring(1));
  }
}

function getNextLineOffset(
  point: Point,
  line: CodeLineNodeN,
  isIndent: boolean,
) {
  const offset = line.getLineOffset(point);

  if (!isIndent) {
    const text = line.getTextContent();
    const isViableUpdate = offset - 1 > -1 && text[0] === '\t';

    return isViableUpdate ? offset - 1 : offset;
  } else {
    return offset + 1;
  }
}

function handleDents(type: DentTypes): boolean {
  const selection = $getSelection();

  if (!$isRangeSelection(selection) || selection.isCollapsed()) {
    return false;
  }

  const {
    bottomLine,
    topLine,
    topPoint,
    bottomPoint,
    lineRange: linesForUpdate,
  } = getLinesFromSelection(selection);
  const isViableDent =
    $isCodeLineNodeN(topLine) &&
    $isCodeLineNodeN(bottomLine) &&
    Array.isArray(linesForUpdate);

  if (isViableDent) {
    const isIndent = type === 'INDENT_CONTENT_COMMAND';
    const topLineOffset = getNextLineOffset(topPoint, topLine, isIndent);
    const bottomLineOffset = getNextLineOffset(
      bottomPoint,
      bottomLine,
      isIndent,
    );

    // must after next line offset to ensure stability...
    linesForUpdate.forEach((line) => doLineIndent(line, type));

    const {
      childFromLineOffset: nextTopNode,
      updatedChildOffset: nextTopOffset,
    } = topLine.getChildFromLineOffset(topLineOffset);
    const {
      childFromLineOffset: nextBottomNode,
      updatedChildOffset: nextBottomOffset,
    } = bottomLine.getChildFromLineOffset(bottomLineOffset);

    if (
      [nextTopNode, nextTopOffset, nextBottomNode, nextBottomOffset].every(
        (val) => {
          return typeof val !== 'undefined';
        },
      )
    ) {
      selection.setTextNodeRange(
        nextTopNode as TextNode,
        nextTopOffset as number,
        nextBottomNode as TextNode,
        nextBottomOffset as number,
      );
    }

    return true;
  }

  return false;
}

function handleBorders(type: ArrowTypes, event: KeyboardEvent): boolean {
  const selection = $getSelection();

  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

  const {topLine: line} = getLinesFromSelection(selection);

  if ($isCodeLineNodeN(line)) {
    const codeNode = line.getParent();

    if ($isCodeNodeN(codeNode)) {
      if (!codeNode.getConfig().codeOnly) {
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

function handleShiftingLines(type: ArrowTypes, event: KeyboardEvent): boolean {
  // We only care about the alt+arrow keys
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) {
    return false;
  }

  const {
    bottomPoint,
    topLine,
    topPoint,
    lineRange: linesForUpdate,
  } = getLinesFromSelection(selection);
  const isArrowUp = type === 'KEY_ARROW_UP_COMMAND';

  if ($isCodeLineNodeN(topLine) && Array.isArray(linesForUpdate)) {
    // From here, we may not be able to be able to move the lines around,
    // but we want to return true either way to prevent
    // the event's default behavior.

    event.preventDefault();
    event.stopPropagation(); // required to stop cursor movement under Firefox

    const displacedLine = isArrowUp
      ? topLine.getPreviousSibling()
      : topLine.getNextSibling();

    if ($isCodeLineNodeN(displacedLine)) {
      const codeNode = topLine.getParent();

      if ($isCodeNodeN(codeNode)) {
        const topNode = topPoint.getNode();
        const bottomNode = bottomPoint.getNode();
        const canSetRange =
          $isCodeHighlightNodeN(topNode) && $isCodeHighlightNodeN(bottomNode);
        const displacedLineIndex = displacedLine.getIndexWithinParent();

        codeNode.splice(displacedLineIndex, 0, linesForUpdate);

        if (canSetRange) {
          selection.setTextNodeRange(
            topNode,
            topPoint.offset,
            bottomNode,
            bottomPoint.offset,
          );
        }
      }
    }
  }

  return true;
}

function handleMoveTo(
  type: 'MOVE_TO_START' | 'MOVE_TO_END',
  event: KeyboardEvent,
): boolean {
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) {
    return false;
  }

  const {topLine: line} = getLinesFromSelection(selection);

  if ($isCodeLineNodeN(line)) {
    const isMoveToStart = type === 'MOVE_TO_START';

    event.preventDefault();
    event.stopPropagation();

    const {topPoint} = getLinesFromSelection(selection);
    const lineOffset = line.getLineOffset(topPoint);
    const firstCharacterIndex = line.getFirstCharacterIndex(lineOffset);
    const lastCharacterIndex = line.getTextContentSize();
    const {childFromLineOffset, updatedChildOffset} = isMoveToStart
      ? line.getChildFromLineOffset(firstCharacterIndex)
      : line.getChildFromLineOffset(lastCharacterIndex);

    if ($isCodeHighlightNodeN(childFromLineOffset)) {
      if (typeof updatedChildOffset === 'number') {
        childFromLineOffset.select(updatedChildOffset, updatedChildOffset);
      }
    }
  }

  return true;
}

function swapParagraphForCodeLine() {
  return {
    replace: ParagraphNode,
    // @ts-ignore
    with: (node) => {
      const codeNode = getCodeNode();

      if ($isCodeNodeN(codeNode)) {
        if (!codeNode.hasBreakOutLine()) {
          return new CodeLineNodeN();
        }
      }

      return node;
    },
  };
}

function swapTextForCodeHighlight() {
  return {
    replace: TextNode,
    // @ts-ignore
    with: (node) => {
      const codeNode = getCodeNode();

      if ($isCodeNodeN(codeNode)) {
        return new CodeHighlightNodeN('');
      }

      return node;
    },
  };
}

export function getCodeOverrides() {
  return [swapTextForCodeHighlight(), swapParagraphForCodeLine()];
}

export function getCodeNodes() {
  return [CodeNodeN, CodeLineNodeN, CodeHighlightNodeN, CodeNodeConverter];
}

export const CODE_TO_PLAIN_TEXT_COMMAND: LexicalCommand<void> = createCommand();
export function dispatchCodeToPlainTextCommand(editor: LexicalEditor) {
  editor.dispatchCommand(CODE_TO_PLAIN_TEXT_COMMAND, undefined);
}

function addUnserializableFunctions(
  node: CodeNodeN,
  unserializable: Unserializable | undefined,
) {
  if (unserializable) {
    if (unserializable.tokenizer) {
      node.setTokenizer(unserializable.tokenizer);
    }
  }
}

function convertCodeToPlainText(): boolean {
  const selection = $getSelection();

  if ($isRangeSelection(selection)) {
    const codeNode = getCodeNode();

    if ($isCodeNodeN(codeNode)) {
      const parent = codeNode.getParent();

      const firstCodeLine = codeNode.getFirstChild() as CodeLineNodeN;
      const lastCodeLine = codeNode.getLastChild() as CodeLineNodeN;

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

export function registerCodeHighlightingN(
  editor: LexicalEditor,
  unserializable?: Unserializable,
) {
  if (!editor.hasNodes([CodeNodeN, CodeLineNodeN, CodeHighlightNodeN])) {
    throw new Error(
      'CodeHighlightPlugin: CodeNodeN, CodeLineNodeN, or CodeHighlightNodeN not registered on editor',
    );
  }

  return mergeRegister(
    editor.registerMutationListener(CodeNodeN, (mutations) => {
      editor.update(() => {
        for (const [key, type] of mutations) {
          const node = $getNodeByKey(key);

          if ($isCodeNodeN(node)) {
            if (type !== 'destroyed') {
              updateCodeGutter(node, editor);
            }

            if (type === 'created') {
              addUnserializableFunctions(node, unserializable);
            }
          }
        }
      });
    }),
    editor.registerNodeTransform(CodeHighlightNodeN, (node) => {
      if (isCodeNodeActive()) {
        updateHighlightsWhenTyping(node);
      }
    }),
    editor.registerCommand(
      CODE_TO_PLAIN_TEXT_COMMAND,
      () => {
        if (isCodeNodeActive()) {
          return convertCodeToPlainText();
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      COPY_COMMAND,
      // PASTE_COMMAND,
      (payload) => {
        const selection = $getSelection();

        // if (isCodeNodeActive()) {
        if ($isRangeSelection(selection)) {
          // const clipboardData = payload.clipboardData;
          // if (clipboardData === null) {
          //   return false;
          // }
          // if (clipboardData !== null) {
          //   console.log(
          //     '1.',
          //     $getHtmlContent(editor),
          //   );
          //   console.log(
          //     '2.',
          //     $getLexicalContent(editor),
          //   );
          //   console.log(
          //     '3.',
          //     clipboardData,
          //   );
          // }
        }
        if (payload) {
          // console.log('==', payload.dataTransfer.getData('application/x-lexical-editor'), payload)
        }
        // }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      PASTE_COMMAND,
      (payload) => {
        const selection = $getSelection();

        if ($isRangeSelection(selection)) {
          // const clipboardData = payload.clipboardData;
          // if (clipboardData === null) {
          //   return false;
          // }
          // if (clipboardData !== null) {
          // console.log(
          //   '1.',
          //   JSON.stringify(clipboardData.getData('text/plain')),
          // );
          // console.log(
          //   '2.',
          //   clipboardData.getData('text/html'),
          // );
          // console.log(
          //   '3.',
          //   clipboardData.getData('application/x-lexical-editor'),
          // );
          // }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      () => {
        const selection = $getSelection();

        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor;
          const anchorNode = anchor.getNode();
          const lineNode = anchorNode.getParent();

          if ($isCodeLineNodeN(lineNode)) {
            lineNode.insertNewAfter();
            return true;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      CODE_TO_PLAIN_TEXT_COMMAND,
      () => {
        if (isCodeNodeActive()) {
          return convertCodeToPlainText();
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      () => {
        const selection = $getSelection();

        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor;
          const anchorNode = anchor.getNode();
          const lineNode = anchorNode.getParent();

          if ($isCodeLineNodeN(lineNode)) {
            lineNode.insertNewAfter();
            return true;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      INDENT_CONTENT_COMMAND,
      () => {
        if (isCodeNodeActive()) {
          return handleDents('INDENT_CONTENT_COMMAND');
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      OUTDENT_CONTENT_COMMAND,
      () => {
        if (isCodeNodeActive()) {
          return handleDents('OUTDENT_CONTENT_COMMAND');
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (payload) => {
        if (isCodeNodeActive()) {
          if (!payload.altKey) {
            return handleBorders('KEY_ARROW_UP_COMMAND', payload);
          } else {
            return handleShiftingLines('KEY_ARROW_UP_COMMAND', payload);
          }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (payload) => {
        if (isCodeNodeActive()) {
          if (!payload.altKey) {
            return handleBorders('KEY_ARROW_DOWN_COMMAND', payload);
          } else {
            return handleShiftingLines('KEY_ARROW_DOWN_COMMAND', payload);
          }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      MOVE_TO_END,
      (payload) => {
        if (isCodeNodeActive()) {
          return handleMoveTo('MOVE_TO_END', payload);
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      MOVE_TO_START,
      (payload) => {
        if (isCodeNodeActive()) {
          return handleMoveTo('MOVE_TO_START', payload);
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
}

interface Unserializable {
  tokenizer?: Tokenizer;
}

export default function CodeHighlightPluginN({
  unserializable,
}: {unserializable?: Unserializable} = {}): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const unserializableRef = React.useRef(unserializable);

  React.useEffect(() => {
    return registerCodeHighlightingN(editor, unserializableRef.current);
  }, [editor]);

  return null;
}
