// ============================================================================
// The window title bar: Windows XP "Luna" for the Notes 8 theme, the Windows
// 98 navy-to-blue caption with small gray buttons for Classic R5.
// ============================================================================

import { activeTabOf, useUI, VIEWS } from "../data/ui";

export default function TitleBar() {
  const theme = useUI((s) => s.theme);
  const tab = useUI(activeTabOf);
  const exit = useUI((s) => s.exit);
  const title = tab ? tab.title ?? VIEWS[tab.view].title : "Welcome";
  const product = theme === "r5" ? "Lotus Notes" : "IBM Lotus Notes";

  if (theme === "r5") {
    return (
      <div className="titlebar tb98">
        <span className="tb98-icon" aria-hidden>
          <i style={{ background: "#e7b416" }} />
          <i style={{ background: "#d33f3f" }} />
          <i style={{ background: "#3f9d3f" }} />
          <i style={{ background: "#2f6fd0" }} />
        </span>
        <span className="titlebar-title">
          {product} - [{title}]
        </span>
        <span className="titlebar-spacer" />
        <div className="tb98-btns">
          <span className="tb98-btn" title="Minimize">
            <i className="g-min" />
          </span>
          <span className="tb98-btn" title="Maximize">
            <i className="g-max" />
          </span>
          <span className="tb98-btn close" title="Close" onClick={exit}>
            <i className="g-close">✕</i>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="titlebar">
      <span className="tb-appicon" aria-hidden>
        <span className="tb-appicon-mark">❋</span>
      </span>
      <span className="titlebar-title">
        {title} - {product}
      </span>
      <span className="titlebar-spacer" />
      <div className="titlebar-btns">
        <span className="titlebar-btn min" title="Minimize">
          <i className="xp-min" />
        </span>
        <span className="titlebar-btn max" title="Maximize">
          <i className="xp-max" />
        </span>
        <span className="titlebar-btn close" title="Close" onClick={exit}>
          ✕
        </span>
      </div>
    </div>
  );
}
