import { Settings } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useI18n } from "../../i18n/index.jsx";

// Two letters read as an identity in the narrow rail, and still fit the
// profile row where the same account is named in full beside them.
export function profileInitials(displayName) {
  return displayName.trim().slice(0, 2).toUpperCase() || "G";
}

export function SidebarProfileRow({ onOpenSettings }) {
  const { t } = useI18n();
  let auth;
  try {
    auth = useAuth();
  } catch {
    auth = null;
  }
  const email = auth?.user?.email || "";
  const username = email ? email.split("@")[0] : t("common.sidebar.guest");
  const displayName = username.charAt(0).toUpperCase() + username.slice(1);
  const initials = profileInitials(displayName);
  return (
    <div className="sidebar-profile-row">
      <div className="sidebar-profile-left" title={email}>
        <div className="sidebar-avatar" aria-hidden="true">
          {initials}
        </div>
        <span className="sidebar-username">{displayName}</span>
      </div>
      <button
        type="button"
        className="sidebar-settings-icon"
        onClick={onOpenSettings}
        aria-label={t("common.sidebar.openSettings")}
        title={t("common.sidebar.settings")}
      >
        <Settings size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function SidebarRailProfile({ onOpenSettings }) {
  const { t } = useI18n();
  let auth;
  try {
    auth = useAuth();
  } catch {
    auth = null;
  }
  const email = auth?.user?.email || "";
  const username = email ? email.split("@")[0] : t("common.sidebar.guest");
  const displayName = username.charAt(0).toUpperCase() + username.slice(1);
  return (
    <button
      type="button"
      className="sidebar-rail-profile"
      onClick={onOpenSettings}
      title={email || t("common.sidebar.settings")}
      aria-label={t("common.sidebar.openSettings")}
    >
      <span className="sidebar-avatar sidebar-rail-avatar" aria-hidden="true">
        {profileInitials(displayName)}
      </span>
    </button>
  );
}
