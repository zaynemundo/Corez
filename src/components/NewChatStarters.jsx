import {
  Gamepad2,
  Globe,
  Image as ImageIcon,
  Search,
} from "lucide-react";
import { useI18n } from "../i18n/index.jsx";

/**
 * The suggestion rows under the new-chat composer.
 *
 * Familiar row shape — an outline icon, then the label, one per line — carrying
 * CoreZ's own four commands: @website, @game, @image and @research. The label is
 * translated, the token on the right is the code the row inserts, and the icon
 * matches the same command in the composer's "@" menu.
 *
 * A row PRE-FILLS the composer instead of sending anything, so the user sees
 * what is about to be asked before it goes out. Each command is also safe to
 * send on its own: CoreZ answers "@image" with a request for the description and
 * "@website" with a website build.
 */
const STARTERS = [
  {
    id: "website",
    labelKey: "common.newChat.starterWebsite",
    icon: Globe,
    insert: "@website ",
  },
  {
    id: "game",
    labelKey: "common.newChat.starterGame",
    icon: Gamepad2,
    insert: "@game ",
  },
  {
    id: "image",
    labelKey: "common.newChat.starterImage",
    icon: ImageIcon,
    insert: "@image ",
  },
  {
    id: "research",
    labelKey: "common.newChat.starterResearch",
    icon: Search,
    insert: "@research ",
  },
];

export default function NewChatStarters({ onSelect, hidden = false }) {
  const { t } = useI18n();

  return (
    <div
      className={`new-chat-starters${hidden ? " is-hidden" : ""}`}
      role="group"
      aria-label={t("common.newChat.startersLabel")}
      aria-hidden={hidden || undefined}
      inert={hidden ? "" : undefined}
    >
      {STARTERS.map((starter) => {
        const Icon = starter.icon;
        return (
          <button
            key={starter.id}
            type="button"
            className="new-chat-starter"
            onClick={() => onSelect?.(starter.insert)}
          >
            <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
            <span className="new-chat-starter-label">
              {t(starter.labelKey)}
            </span>
            <code className="new-chat-starter-token">
              {starter.insert.trim()}
            </code>
          </button>
        );
      })}
    </div>
  );
}
