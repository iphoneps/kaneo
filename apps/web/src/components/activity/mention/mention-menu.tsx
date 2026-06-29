import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import type { MentionMember, MentionMenuState } from "./use-mention-menu";

type MentionMenuProps = {
  state: MentionMenuState;
  members: MentionMember[];
  position: "absolute" | "fixed";
  emptyLabel: string;
  onSelect: (member: MentionMember) => void;
  onHover: (index: number) => void;
};

export default function MentionMenu({
  state,
  members,
  position,
  emptyLabel,
  onSelect,
  onHover,
}: MentionMenuProps) {
  return (
    <div
      className="kaneo-tiptap-mention-menu"
      style={{ top: state.top, left: state.left, position }}
    >
      {members.length > 0 ? (
        members.map((member, index) => (
          <button
            key={member.id}
            type="button"
            className={cn(
              "kaneo-tiptap-mention-item",
              state.selectedIndex === index && "is-selected",
            )}
            onMouseEnter={() => onHover(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(member);
            }}
          >
            <Avatar className="h-6 w-6">
              <AvatarImage src={member.image ?? ""} alt={member.name} />
              <AvatarFallback className="bg-muted text-xs font-medium">
                {member.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="kaneo-tiptap-mention-text">
              <span className="kaneo-tiptap-mention-name">{member.name}</span>
              {member.email && (
                <span className="kaneo-tiptap-mention-email">
                  {member.email}
                </span>
              )}
            </span>
          </button>
        ))
      ) : (
        <div className="kaneo-tiptap-slash-empty">{emptyLabel}</div>
      )}
    </div>
  );
}
