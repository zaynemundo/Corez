import { Globe, Image as ImageIcon, PenLine } from "lucide-react";
import { useI18n } from "../i18n/index.jsx";

/**
 * The three starter rows under the new-chat composer.
 *
 * Each row PRE-FILLS the composer instead of sending anything, so the user
 * always sees what is about to be asked before it goes out. Two rows insert
 * translated sentences the user continues; the image row inserts CoreZ's real
 * `@image` command token, which is code rather than copy and therefore stays
 * untranslated.
 */
const STARTERS = [
  {
    id: "image",
    labelKey: "common.newChat.starterImage",
    icon: ImageIcon,
    insert: "@image ",
  },
  {
    id: "write",
    labelKey: "common.newChat.starterWrite",
    icon: PenLine,
    insertKey: "common.newChat.starterWritePrompt",
  },
  {
    id: "search",
    labelKey: "common.newChat.starterSearch",
    icon: Globe,
    insertKey: "common.newChat.starterSearchPrompt",
  },
];

export default function NewChatStarters({ onSelect }) {
  const { t } = useI18n();

  return (
    <div
      className="new-chat-starters"
      role="group"
      aria-label={t("common.newChat.startersLabel")}
    >
      {STARTERS.map((starter) => {
        const Icon = starter.icon;
        return (
          <button
            key={starter.id}
            type="button"
            className="new-chat-starter"
            onClick={() =>
              onSelect?.(starter.insertKey ? t(starter.insertKey) : starter.insert)
            }
          >
            <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
            <span className="new-chat-starter-label">{t(starter.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
