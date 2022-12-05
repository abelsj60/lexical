/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import * as React from 'react';

import {
  $createTextNode,
  $getNodeByKey,
  $getPreviousSelection,
  $getSelection,
  $isLineBreakNode,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  COMMAND_PRIORITY_LOW,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
  DELETE_CHARACTER_COMMAND,
  INDENT_CONTENT_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_TAB_COMMAND,
  LexicalEditor,
  MOVE_TO_END,
  MOVE_TO_START,
  OUTDENT_CONTENT_COMMAND,
  ParagraphNode,
  PASTE_COMMAND,
  TextNode,
} from '../../lexical/src';
import {mergeRegister} from '../../lexical-utils/src';
import {$isCodeHighlightNodeN, CodeHighlightNodeN} from './chnNext';
import {
  $createCodeLineNode,
  $isCodeLineNodeN,
  CodeLineNodeN,
  DEFAULT_CODE_LANGUAGE,
  getLinesFromSelection,
  isInsideCodeNode,
} from './clnNext';
import {$isCodeNodeN, CodeNodeN} from './cnNext';

type ArrowTypes = 'KEY_ARROW_UP_COMMAND' | 'KEY_ARROW_DOWN_COMMAND';
type DentTypes = 'INDENT_CONTENT_COMMAND' | 'OUTDENT_CONTENT_COMMAND';

function plainTextToCodeTransform(codeNode: CodeNodeN) {
  // When new code block inserted it might not have language selected
  if (codeNode.getLanguage() === undefined) {
    codeNode.setLanguage(DEFAULT_CODE_LANGUAGE);
  }

  const lines = codeNode.getChildren().reduce((lineHolder, child) => {
    child
      .getTextContent()
      .split(/\n/g)
      .forEach((line) => {
        const newLine = $createCodeLineNode();
        const code = newLine.getHighlightNodes(line) as CodeHighlightNodeN[];

        newLine.append(...code);
        lineHolder.push(newLine);
      });

    return lineHolder;
  }, [] as CodeLineNodeN[]);

  codeNode.splice(0, lines.length, lines);

  const lastLine = codeNode.getLastChild();

  if (lastLine !== null) {
    lastLine.nextSelection(lastLine.getChildrenSize());
  }
}

function updateHighlightsTransform(highlightNode: CodeHighlightNodeN) {
  const line = highlightNode.getParent();

  if ($isCodeLineNodeN(line)) {
    const selection = $getSelection();

    if (selection !== null && $isRangeSelection(selection)) {
      const {topPoint} = getLinesFromSelection(selection);
      // comes first b/c offset changes after update!
      const lineOffset = line.getLineOffset(topPoint);

      if (line.updateLineCode()) {
        line.nextSelection(lineOffset);
      }
    }
  }
}

function codeToPlainTextTransform(node: TextNode) {
  if (!$isCodeHighlightNodeN(node)) return;

  // When code block converted into paragraph or other element
  // code highlight nodes converted back to normal text
  node.replace($createTextNode(node.__text));
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
  const isCodeLineOrParagraphNode =
    $isCodeLineNodeN(firstChildNode) || $isParagraphNode(firstChildNode);
  // @ts-ignore:: internal field
  codeElement.__cachedChildrenLength = childrenLength;
  let gutter = '1';
  let count = 1;

  for (let i = 0; i < childrenLength; i++) {
    // TODO: still needed - no grafs?
    if (!isCodeLineOrParagraphNode) {
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

function getTopNode() {
  const selection = $getSelection();

  if (selection !== null && $isRangeSelection(selection)) {
    const {topPoint} = getLinesFromSelection(selection);
    const topNode = topPoint.getNode();

    return topNode;
  }

  return null;
}

function doLineIndent(line: CodeLineNodeN, type: DentTypes) {
  const spaces = 2;

  const text = line.getTextContent();
  const lineSpacers = line.makeSpace(spaces);

  if (type === 'INDENT_CONTENT_COMMAND') {
    line.replaceLineCode(`${lineSpacers}${text}`);
  } else if (text.startsWith(lineSpacers)) {
    line.replaceLineCode(text.substring(spaces));
  }
}

function handleDents(type: DentTypes): boolean {
  const selection = $getSelection();

  if (selection !== null && $isRangeSelection(selection)) {
    if (!selection.isCollapsed()) {
      const spaces = 2;

      const {
        bottomLine,
        topLine,
        topPoint,
        bottomPoint,
        lineRangeFromSelection: linesForUpdate,
      } = getLinesFromSelection(selection);
      const isIndent = type === 'INDENT_CONTENT_COMMAND';

      if (
        typeof topLine !== 'undefined' &&
        typeof bottomLine !== 'undefined' &&
        Array.isArray(linesForUpdate)
      ) {
        const topLineOffset = topLine.getLineOffset(topPoint);
        const bottomLineOffset = bottomLine.getLineOffset(bottomPoint);

        linesForUpdate.forEach((line) => doLineIndent(line, type));

        const getNextOffset = (offset: number) => {
          return isIndent ? offset + spaces : offset - spaces;
        };
        const nextTopLineOffset = getNextOffset(topLineOffset);
        const nextBottomLineOffset = getNextOffset(bottomLineOffset);

        // get updated values then update selection
        if (nextTopLineOffset >= 0 && nextBottomLineOffset >= 0) {
          const {bottomLine: nextBottomLine, topLine: nextTopLine} =
            getLinesFromSelection(selection);

          if (
            typeof nextTopLine !== 'undefined' &&
            typeof nextBottomLine !== 'undefined'
          ) {
            const {
              childFromLineOffset: nextTopNode,
              updatedChildOffset: nextTopOffset,
            } = nextTopLine.getChildFromLineOffset(nextTopLineOffset);
            const {
              childFromLineOffset: nextBottomNode,
              updatedChildOffset: nextBottomOffset,
            } = nextBottomLine.getChildFromLineOffset(nextBottomLineOffset);

            // TODO: Please re-evaluate this
            if (
              typeof nextTopNode !== 'undefined' &&
              typeof nextTopOffset !== 'undefined' &&
              typeof nextBottomNode !== 'undefined' &&
              typeof nextBottomOffset !== 'undefined'
            ) {
              selection.setTextNodeRange(
                nextTopNode as TextNode,
                nextTopOffset,
                nextBottomNode as TextNode,
                nextBottomOffset,
              );
            }
          }
        }

        return true;
      }
    }
  }

  return false;
}

function handleTabs(event: KeyboardEvent) {
  const selection = $getSelection();

  if (selection !== null && $isRangeSelection(selection)) {
    if (!selection.isCollapsed()) return false;

    const {topLine: line, topPoint: anchor} = getLinesFromSelection(selection);

    if (typeof line !== 'undefined') {
      const spaces = 2;
      const lineOffset = line.getLineOffset(anchor);
      const remainder = lineOffset % spaces;

      event.preventDefault();

      if (!event.shiftKey) {
        // indent
        const isLineEmpty = line.getChildrenSize() === 0;
        let nextLineOffset = spaces;

        if (isLineEmpty) {
          const lineSpacers = line.makeSpace(spaces);
          const code = line.getHighlightNodes(
            lineSpacers,
          ) as CodeHighlightNodeN[];

          line.append(...code);
        } else {
          const [beforeSplitText, afterSplitText] =
            line.splitLineText(lineOffset);
          const viableSpace = remainder === 0 ? spaces : spaces - remainder;
          const textWithTab = `${line.makeSpace(viableSpace)}${afterSplitText}`;
          nextLineOffset = lineOffset + viableSpace;

          line.replaceLineCode(`${beforeSplitText}${textWithTab}`);
        }

        line.nextSelection(nextLineOffset);
      } else {
        // outdent
        const isTabStop = remainder === 0;
        const lineText = line.getTextContent();
        const nextLineOffset = lineOffset - spaces;
        const lineTextNominatedForRemoval = lineText.slice(
          nextLineOffset,
          lineOffset,
        );
        const canRemoveTab =
          isTabStop && lineTextNominatedForRemoval === line.makeSpace(spaces);

        if (canRemoveTab) {
          const hasOneChild = line.getChildrenSize() === 1;
          const willEmptyLine = hasOneChild && lineText.length === spaces;

          if (willEmptyLine) {
            // trueadm says empty text nodes are an anti pattern, so we'll
            // remove them as they reach empty
            anchor.getNode().remove();
            line.selectStart();
          } else {
            const [beforeSplitText, afterSplitText] =
              line.splitLineText(lineOffset);
            const textWithoutTab = beforeSplitText.slice(
              0,
              beforeSplitText.length - spaces,
            );

            line.replaceLineCode(`${textWithoutTab}${afterSplitText}`);
            line.nextSelection(nextLineOffset);
          }
        }
      }
    }
  }

  return true;
}

function handleBorders(type: ArrowTypes, event: KeyboardEvent): boolean {
  // handle cursor when it reaches the beginnig or end of the code block because
  // it has no siblings to move to without our direct intervention

  const selection = $getSelection();

  if (selection !== null && $isRangeSelection(selection)) {
    if (!selection.isCollapsed() || !$isRangeSelection(selection)) {
      return false;
    }

    const {topLine: line} = getLinesFromSelection(selection);

    if ($isCodeLineNodeN(line)) {
      const codeNode = line.getParent();

      if ($isCodeNodeN(codeNode)) {
        const isArrowUp = type === 'KEY_ARROW_UP_COMMAND';

        const goToPreviousBlock = isArrowUp && line.isStartOfFirstLine();
        const goToNextBlock = !isArrowUp && line.isEndOfLastLine();

        if (goToPreviousBlock) {
          const prevSibling = codeNode.getPreviousSibling();

          if (prevSibling === null) {
            event.preventDefault();
            codeNode.selectPrevious();

            return true;
          }
        } else if (goToNextBlock) {
          const nextSibling = codeNode.getNextSibling();

          if (!$isRootNode(codeNode)) {
            // TODO: yeah?
            if (nextSibling === null) {
              event.preventDefault();
              codeNode.selectNext();

              return true;
            }
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
  } // I'm not quite sure why, but it seems like calling anchor.getNode() collapses the selection here
  // So first, get the anchor and the focus, then get their nodes

  const {
    bottomPoint,
    topLine,
    topPoint,
    lineRangeFromSelection: linesForUpdate,
  } = getLinesFromSelection(selection);
  const isArrowUp = type === 'KEY_ARROW_UP_COMMAND';

  if (typeof topLine !== 'undefined' && Array.isArray(linesForUpdate)) {
    if (!$isCodeNodeN(topLine.getParent())) {
      // TODO: what about adjacent code blocks?
      // we only want to move lines around if they're in a code block
      return false;
    }

    // After this point, we know the selection is within the codeblock. We may not be able to
    // actually move the lines around, but we want to return true either way to prevent
    // the event's default behavior

    event.preventDefault();
    event.stopPropagation(); // required to stop cursor movement under Firefox

    const displacedLine = isArrowUp
      ? topLine.getPreviousSibling()
      : topLine.getNextSibling();

    if (displacedLine !== null) {
      const codeNode = topLine.getParent();

      if ($isCodeNodeN(codeNode)) {
        const displacedLineIndex = displacedLine.getIndexWithinParent();

        codeNode.splice(displacedLineIndex, 0, linesForUpdate);

        // TODO: Please re-evaluate this
        if (
          typeof topPoint !== 'undefined' &&
          typeof bottomPoint !== 'undefined'
        ) {
          selection.setTextNodeRange(
            topPoint.getNode() as TextNode,
            topPoint.offset,
            bottomPoint.getNode() as TextNode,
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

    const text = line.getTextContent();
    const firstCharacterIndex = line.getFirstCharacterIndex(text);
    const lastCharacterIndex = line.getTextContentSize();
    const {childFromLineOffset, updatedChildOffset} = isMoveToStart
      ? line.getChildFromLineOffset(firstCharacterIndex)
      : line.getChildFromLineOffset(lastCharacterIndex);

    if ($isCodeLineNodeN(childFromLineOffset)) {
      childFromLineOffset.select(updatedChildOffset, updatedChildOffset);
    }
  }

  return true;
}

export function registerCodeHighlightingN(editor: LexicalEditor) {
  if (!editor.hasNodes([CodeNodeN, CodeLineNodeN, CodeHighlightNodeN])) {
    throw new Error(
      'CodeHighlightPlugin: CodeNodeN, CodeLineNodeN, or CodeHighlightNodeN not registered on editor',
    );
  }

  return mergeRegister(
    editor.registerMutationListener(CodeNodeN, (mutations) => {
      editor.update(() => {
        if (isInsideCodeNode($getSelection())) {
          for (const [key, type] of mutations) {
            if (type !== 'destroyed') {
              const node = $getNodeByKey(key);

              if (node !== null) {
                updateCodeGutter(node as CodeNodeN, editor);
              }
            }
          }
        }
      });
    }),
    editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      () => {
        if (isInsideCodeNode($getSelection())) {
          // DON'T use KEY_ENTER_COMMAND b/c Lexical will
          // try to run paragraph logic, which results
          // in two newLines for many enters
          const selection = $getSelection();

          if (!$isRangeSelection(selection)) return false;

          const topNode = getTopNode();

          switch (true) {
            case $isCodeNodeN(topNode):
            case $isCodeLineNodeN(topNode):
            case $isCodeHighlightNodeN(topNode):
              // cancel command and run manually to prevent conflicts
              // with insertParagraph
              (
                topNode as CodeNodeN | CodeLineNodeN | CodeHighlightNodeN
              ).insertNewAfter();
              return true;
            case $isRootNode(selection.anchor.getNode()):
              // cancel and run manually to prevent errors
              selection.insertParagraph();
              return true;
            default:
              return false;
          }
        }
        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      CONTROLLED_TEXT_INSERTION_COMMAND,
      (payload) => {
        if (isInsideCodeNode($getSelection())) {
          // cancel and run manually to prevent conflicts
          // with default text/paragraph logic

          const topNode = getTopNode();

          switch (true) {
            // run custom insertion on empty lines
            case $isCodeLineNodeN(topNode) && topNode.isEmptyLine():
              // TODO: check this (could also be InputEvent?)
              return (topNode as CodeLineNodeN).insertControlledText(
                payload as string,
              );
            default:
              return false;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      CUT_COMMAND,
      (payload) => {
        if (isInsideCodeNode($getSelection())) {
          // cancel and run manually to prevent conflicts
          // with default text/paragraph logic

          const topNode = getTopNode();

          switch (true) {
            // run custom insertion on empty lines
            case $isCodeLineNodeN(topNode):
              return (topNode as CodeLineNodeN).isEmptyLine();
            default:
              return false;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      PASTE_COMMAND,
      (payload) => {
        if (isInsideCodeNode($getSelection())) {
          switch (true) {
            // run custom insertion on empty lines
            // case $isCodeLineNodeN(topNode):
            //   return topNode.isEmptyLine();
            default:
              return false;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      DELETE_CHARACTER_COMMAND,
      () => {
        if (isInsideCodeNode($getSelection())) {
          // cancel and run manually to prevent conflicts
          // with default text/paragraph logic
          const topNode = getTopNode();

          switch (true) {
            case $isCodeLineNodeN(topNode):
            case $isCodeHighlightNodeN(topNode):
              // codeLine: delete empty line (no kids)
              // codeHighlight: delete line and merge text w/prev
              return (
                topNode as CodeLineNodeN | CodeHighlightNodeN
              ).deleteLine();
            default:
              return false;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerNodeTransform(CodeNodeN, (node) => {
      const isInitialized = node.getChildren().some((child) => {
        return $isCodeLineNodeN(child);
      });

      if (isInitialized) return;
      plainTextToCodeTransform(node);
    }),
    editor.registerNodeTransform(ParagraphNode, (node) => {
      // const selection = $getSelection();
    }),
    editor.registerNodeTransform(TextNode, (node) => {
      if (isInsideCodeNode($getSelection())) {
        codeToPlainTextTransform(node);
      }

      return false;
    }),
    editor.registerNodeTransform(CodeHighlightNodeN, (node) => {
      // TODO: init check may not work in playground...
      if (isInsideCodeNode($getSelection())) {
        const isInitialized = $getPreviousSelection() !== null;
        const selection = $getSelection();

        if ($isRangeSelection(selection)) {
          if (!isInitialized) return; // TODO: REMOVE! not working

          switch (true) {
            case isInitialized:
              return updateHighlightsTransform(node);
            default:
              return false;
          }
        }
      }

      return false;
    }),
    editor.registerCommand(
      INDENT_CONTENT_COMMAND,
      (payload) => {
        if (isInsideCodeNode($getSelection())) {
          return handleDents('INDENT_CONTENT_COMMAND');
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      OUTDENT_CONTENT_COMMAND,
      (payload) => {
        if (isInsideCodeNode($getSelection())) {
          return handleDents('OUTDENT_CONTENT_COMMAND');
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_TAB_COMMAND,
      (payload) => {
        if (isInsideCodeNode($getSelection())) {
          return handleTabs(payload);
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (payload) => {
        if (isInsideCodeNode($getSelection())) {
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
        if (isInsideCodeNode($getSelection())) {
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
        if (isInsideCodeNode($getSelection())) {
          return handleMoveTo('MOVE_TO_END', payload);
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      MOVE_TO_START,
      (payload) => {
        if (isInsideCodeNode($getSelection())) {
          return handleMoveTo('MOVE_TO_START', payload);
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
}

export default function CodeHighlightPluginN(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    return registerCodeHighlightingN(editor);
  }, [editor]);

  return null;
}
