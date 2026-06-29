import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";

export type MentionMember = {
  id: string; // the USER id (used as the mention target)
  name: string;
  email?: string | null;
  image?: string | null;
};

export type MentionMenuState = {
  from: number;
  to: number;
  query: string;
  top: number;
  left: number;
  selectedIndex: number;
};

type UseMentionMenuParams = {
  editor: Editor | null;
  readOnly?: boolean;
  disabled?: boolean;
  // Reuse each editor's existing overlay-position math.
  getCoords: (editor: Editor, pos: number) => { top: number; left: number };
};

const MAX_RESULTS = 8;

// Mirrors the editor's custom slash-command menu, but triggered by "@" and
// backed by the active workspace's members. Resolves the workspace + members
// internally so the (deeply nested) editors don't need new props.
export function useMentionMenu({
  editor,
  readOnly = false,
  disabled = false,
  getCoords,
}: UseMentionMenuParams) {
  const { data: activeWorkspace } = useActiveWorkspace();
  const { data: rawMembers } = useGetActiveWorkspaceUsers(
    activeWorkspace?.id ?? "",
  );

  const members = useMemo<MentionMember[]>(() => {
    return (rawMembers?.members ?? [])
      .map((member) => ({
        id: member.userId,
        name: member.user?.name ?? "",
        email: member.user?.email ?? null,
        image: member.user?.image ?? null,
      }))
      .filter((member) => member.id && member.name);
  }, [rawMembers]);

  const [menu, setMenu] = useState<MentionMenuState | null>(null);

  const filteredMembers = useMemo<MentionMember[]>(() => {
    if (!menu) return [];
    const query = menu.query.trim().toLowerCase();
    const list = query
      ? members.filter(
          (member) =>
            member.name.toLowerCase().includes(query) ||
            member.email?.toLowerCase().includes(query),
        )
      : members;
    return list.slice(0, MAX_RESULTS);
  }, [members, menu]);

  const sync = useCallback(
    (activeEditor: Editor) => {
      if (readOnly || disabled || members.length === 0) {
        setMenu(null);
        return;
      }

      const { selection } = activeEditor.state;
      if (!selection.empty) {
        setMenu(null);
        return;
      }

      const { $from } = selection;
      if (!$from.parent.isTextblock) {
        setMenu(null);
        return;
      }

      const textBefore = $from.parent.textBetween(
        0,
        $from.parentOffset,
        "\0",
        "\0",
      );
      const match = textBefore.match(/(?:^|\s)@([^\s@]*)$/);
      if (!match) {
        setMenu(null);
        return;
      }

      const query = match[1] || "";
      const matchText = match[0];
      const startsWithSpace = matchText.startsWith(" ");
      const atOffset =
        $from.parentOffset - matchText.length + (startsWithSpace ? 1 : 0);
      const from = $from.start() + atOffset;
      const to = from + matchText.trimStart().length;
      const { top, left } = getCoords(activeEditor, $from.pos);

      setMenu((current) => ({
        from,
        to,
        query,
        top,
        left,
        selectedIndex: current?.query === query ? current.selectedIndex : 0,
      }));
    },
    [readOnly, disabled, members.length, getCoords],
  );

  useEffect(() => {
    if (!editor) return;
    const handler = () => sync(editor);
    editor.on("selectionUpdate", handler);
    editor.on("update", handler);
    return () => {
      editor.off("selectionUpdate", handler);
      editor.off("update", handler);
    };
  }, [editor, sync]);

  const close = useCallback(() => setMenu(null), []);

  const selectMember = useCallback(
    (member: MentionMember) => {
      if (!editor || !menu) return;
      editor
        .chain()
        .focus()
        .deleteRange({ from: menu.from, to: menu.to })
        .insertContent([
          {
            type: "kaneoMention",
            attrs: { id: member.id, label: member.name },
          },
          { type: "text", text: " " },
        ])
        .run();
      setMenu(null);
    },
    [editor, menu],
  );

  const setSelectedIndex = useCallback((index: number) => {
    setMenu((current) =>
      current ? { ...current, selectedIndex: index } : current,
    );
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent): boolean => {
      if (!menu) return false;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMenu((current) =>
          current
            ? {
                ...current,
                selectedIndex:
                  (current.selectedIndex + 1) %
                  Math.max(filteredMembers.length, 1),
              }
            : current,
        );
        return true;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMenu((current) =>
          current
            ? {
                ...current,
                selectedIndex:
                  (current.selectedIndex -
                    1 +
                    Math.max(filteredMembers.length, 1)) %
                  Math.max(filteredMembers.length, 1),
              }
            : current,
        );
        return true;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        if (filteredMembers.length === 0) {
          setMenu(null);
          return false;
        }
        event.preventDefault();
        const member =
          filteredMembers[
            Math.min(menu.selectedIndex, filteredMembers.length - 1)
          ];
        if (member) selectMember(member);
        return true;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(null);
        return true;
      }

      return false;
    },
    [menu, filteredMembers, selectMember],
  );

  return {
    menu,
    members: filteredMembers,
    selectMember,
    setSelectedIndex,
    onKeyDown,
    close,
  };
}
