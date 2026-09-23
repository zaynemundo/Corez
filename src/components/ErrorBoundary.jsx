import { Component } from "react";
import { useI18n } from "../i18n/index.jsx";

function ErrorBoundaryFallback({ error, onReload }) {
  const { t } = useI18n();
  return (
    <div className="error-boundary-fallback">
      <div className="error-boundary-content">
        <h2>{t("canvas.errorBoundary.title")}</h2>
        <p className="error-boundary-detail">
          {error?.message || t("canvas.errorBoundary.detail")}
        </p>
        <button type="button" className="code-btn" onClick={onReload}>
          {t("canvas.errorBoundary.reload")}
        </button>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorBoundaryFallback
          error={this.state.error}
          onReload={() => {
            this.setState({ hasError: false, error: null });
            window.location.reload();
          }}
        />
      );
    }
    return this.props.children;
  }
}
