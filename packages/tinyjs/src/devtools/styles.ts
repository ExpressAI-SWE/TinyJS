export const indicatorStyles = `
:host{all:initial;position:fixed;z-index:2147483600;pointer-events:none;color:#f3f4f6;font:13px/1.45 ui-monospace,Consolas,monospace;color-scheme:dark}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
button,input,select{font:inherit}
button{cursor:pointer}
button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible, [tabindex="0"]:focus-visible{outline:2px solid #86a9ff;outline-offset:-2px}
.shell{pointer-events:auto;position:fixed;display:flex;flex-direction:column;align-items:flex-start;gap:6px;inset:auto auto 14px 14px}
.shell[data-position$="right"]{right:14px;left:auto;align-items:flex-end}
.shell[data-position^="top"]{top:14px;bottom:auto;flex-direction:column-reverse}
.launcher{display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid #36383d;border-radius:4px;background:#000;color:#f3f4f6;box-shadow:0 2px 10px #0008}
.launcher:hover,.icon-button:hover{background:#191d24}
.mark{font-weight:800;letter-spacing:-.065em}
.status{width:6px;height:6px;border-radius:50%;background:#82848a}
.status[data-state="ready"]{background:#57d69a}
.status[data-state="busy"]{background:#f6c36a}
.status[data-state="error"]{background:#ff8a90}
.badge,.warning-badge{padding:0 4px;color:#ffadb1;background:#361415;border-radius:2px;font-size:11px}
.warning-badge{background:#402e12;color:#ffd58c}
.menu{order:-1;display:grid;grid-template-columns:1fr 1fr;gap:2px;width:min(276px,calc(100vw - 28px));padding:6px;border:1px solid #36383d;border-radius:4px;background:#000;box-shadow:0 8px 22px #0009}
.menu button,.icon-button{color:#f3f4f6;border:1px solid transparent;background:transparent;border-radius:3px;padding:5px 7px;text-align:left}
.menu button:hover{background:#171a20}
.menu-item{display:flex;align-items:center;gap:7px}
.menu-icon{display:inline-grid;place-items:center;width:13px;color:#9cacd0}
.menu-action{grid-column:1/-1;border-top:1px solid #292b30!important;color:#c2c8d5!important}
.load-error{grid-column:1/-1;margin:5px;color:#ffadb1}
.app-highlight{position:fixed;pointer-events:none;background:#628fff38;outline:2px solid #8babff;outline-offset:-2px}
.error-overlay{pointer-events:auto;position:fixed;top:14px;left:50%;transform:translateX(-50%);width:min(760px,calc(100vw - 32px));max-height:70vh;overflow:auto;padding:12px 14px;background:#100609;color:#ffe3e5;border:1px solid #a74752;box-shadow:0 8px 32px #000b;border-radius:3px}
.error-overlay header{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.error-overlay strong{flex:1 1 180px}
.error-overlay pre{overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#000;padding:8px;font:inherit;font-size:11px;color:#f9afb6}
.error-overlay p{margin:6px 0;overflow-wrap:anywhere}
`;
