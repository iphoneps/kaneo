import { mergeAttributes, Node } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

function KaneoMentionView({ node }: NodeViewProps) {
  const label = String(node.attrs.label || "");
  return (
    <NodeViewWrapper
      as="span"
      className="kaneo-mention-chip"
      data-type="kaneo-mention"
    >
      @{label}
    </NodeViewWrapper>
  );
}

// Keep the markdown token (<kaneo-mention id="..." label="..." />) well-formed
// even when a display name contains characters that would break the tag. The
// backend targets on `id` (a cuid2) only, so a sanitized label never affects
// notification routing.
function sanitizeLabel(label: string) {
  return label.replace(/"/g, "'").replace(/[<>/]/g, "").trim();
}

export const KaneoMention = Node.create({
  name: "kaneoMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      id: { default: "" },
      label: { default: "" },
    };
  },

  parseHTML() {
    return [
      { tag: "kaneo-mention[id]" },
      { tag: "span[data-type='kaneo-mention'][data-id]" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "kaneo-mention",
      mergeAttributes(HTMLAttributes, {
        "data-type": "kaneo-mention",
        "data-id": HTMLAttributes.id,
        "data-label": HTMLAttributes.label,
        id: HTMLAttributes.id,
        label: HTMLAttributes.label,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KaneoMentionView);
  },

  renderMarkdown(
    node: { attrs?: { id?: string; label?: string } },
    _helpers: unknown,
    _context: unknown,
  ) {
    const id = String(node.attrs?.id || "");
    const label = sanitizeLabel(String(node.attrs?.label || ""));
    if (!id) return "";
    return `<kaneo-mention id="${id}" label="${label}" />`;
  },
});
