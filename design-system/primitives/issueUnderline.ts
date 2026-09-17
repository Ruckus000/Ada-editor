import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { EditorState } from 'prosemirror-state';
import { SEVERITY_ENCODING } from './severity';
import type { Issue } from './types';

export const issueUnderlineKey = new PluginKey<DecorationSet>('adaIssueUnderline');

/**
 * Inline underlines as ProseMirror decorations.
 *
 * Decorations are the correct mechanism here because they are derived from
 * plugin state and never touch the document: a finding cannot corrupt the
 * user's prose, and undo history stays clean. This is the single strongest
 * reason to build on ProseMirror rather than an editor whose decorator model is
 * oriented around embedded nodes.
 *
 * IMPORTANT — this layer is an ENHANCEMENT, not the interface. Everything here
 * is also reachable, readable and actionable from <IssueList>. If you are
 * tempted to put an action in here that exists nowhere else, don't.
 */
export function issueUnderlinePlugin(getIssues: (state: EditorState) => Issue[]) {
  const build = (state: EditorState) =>
    DecorationSet.create(
      state.doc,
      getIssues(state).map((issue) => {
        const { underline, label } = SEVERITY_ENCODING[issue.severity];
        return Decoration.inline(issue.from, issue.to, {
          class: 'ada-underline',
          'data-severity': issue.severity,
          'data-issue-id': issue.id,
          // Inline style carries the shape, which is the channel that survives
          // greyscale, forced-colors and every CVD type. Colour comes from the
          // stylesheet and is redundant.
          style: `text-decoration-line: underline;
                  text-decoration-style: ${underline};
                  text-decoration-thickness: ${underline === 'double' ? '2px' : '1px'};
                  text-underline-offset: 3px;`,
          // A tooltip is not an accessible name, so this is supplementary only.
          title: `${label}: ${issue.title}`,
        });
      })
    );

  return new Plugin<DecorationSet>({
    key: issueUnderlineKey,
    state: {
      init: (_config, state) => build(state),
      apply: (tr, value, _old, newState) =>
        tr.docChanged || tr.getMeta(issueUnderlineKey) ? build(newState) : value.map(tr.mapping, tr.doc),
    },
    props: {
      decorations: (state) => issueUnderlineKey.getState(state),
      attributes: {
        // The editing surface announces itself and points at the findings
        // region, so a screen reader user knows the list exists at all.
        'aria-describedby': 'ada-issues-heading',
      },
    },
  });
}
