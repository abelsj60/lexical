/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

// eslint-disable-next-line simple-import-sort/imports
import {HashtagNode} from '@lexical/hashtag';
import {AutoLinkNode, LinkNode} from '@lexical/link';
import {ListItemNode, ListNode} from '@lexical/list';
import {MarkNode} from '@lexical/mark';
import {OverflowNode} from '@lexical/overflow';
import {HorizontalRuleNode} from '@lexical/react/LexicalHorizontalRuleNode';
import {HeadingNode, QuoteNode} from '@lexical/rich-text';
import {TableCellNode, TableNode, TableRowNode} from '@lexical/table';
import {Klass, LexicalNode} from 'lexical';
import {getCodeNodes} from '../../../lexical-code/src/codeHltrNext';

import {CollapsibleContainerNode} from '../plugins/CollapsiblePlugin/CollapsibleContainerNode';
import {CollapsibleContentNode} from '../plugins/CollapsiblePlugin/CollapsibleContentNode';
import {CollapsibleTitleNode} from '../plugins/CollapsiblePlugin/CollapsibleTitleNode';
import {AutocompleteNode} from './AutocompleteNode';
import {EmojiNode} from './EmojiNode';
import {EquationNode} from './EquationNode';
import {ExcalidrawNode} from './ExcalidrawNode';
import {FigmaNode} from './FigmaNode';
import {ImageNode} from './ImageNode';
import {KeywordNode} from './KeywordNode';
import {MentionNode} from './MentionNode';
import {PollNode} from './PollNode';
import {StickyNode} from './StickyNode';
import {TableNode as NewTableNode} from './TableNode';
import {TweetNode} from './TweetNode';
import {YouTubeNode} from './YouTubeNode';
import {CodeNodeN} from '../../../lexical-code/src/cnNext';
import {CodeLineNodeN} from '../../../lexical-code/src/clnNext';
import {CodeHighlightNodeN} from '../../../lexical-code/src/chnNext';

const PlaygroundNodes: Array<Klass<LexicalNode>> = [
  HeadingNode,
  ListNode,
  ListItemNode,
  QuoteNode,
  NewTableNode,
  TableNode,
  TableCellNode,
  TableRowNode,
  HashtagNode,
  AutoLinkNode,
  LinkNode,
  OverflowNode,
  PollNode,
  StickyNode,
  ImageNode,
  MentionNode,
  EmojiNode,
  ExcalidrawNode,
  EquationNode,
  AutocompleteNode,
  KeywordNode,
  HorizontalRuleNode,
  TweetNode,
  YouTubeNode,
  FigmaNode,
  MarkNode,
  CollapsibleContainerNode,
  CollapsibleContentNode,
  CollapsibleTitleNode,
  ...getCodeNodes(),
];

export default PlaygroundNodes;
