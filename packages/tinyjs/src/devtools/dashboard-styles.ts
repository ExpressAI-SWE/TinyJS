export const dashboardStyles = `
.dt-panel{pointer-events:auto;position:fixed;inset:auto 14px 54px auto;width:min(var(--dt-width,850px),calc(100vw - 28px));height:min(var(--dt-height,540px),calc(100dvh - 75px));display:grid;grid-template-rows:auto minmax(0,1fr);border:1px solid #35383f;background:#000;color:#e9eaf0;border-radius:4px;box-shadow:0 12px 35px #0009;font:12px/1.45 ui-monospace,Consolas,monospace;animation:dt-enter .13s ease-out}
.dt-panel[data-position$="right"]{right:auto;left:14px}
.dt-panel[data-position^="top"]{top:54px;bottom:auto}
.dt-panel[data-fullscreen="true"]{inset:0;width:100vw;height:100dvh;border:0;border-radius:0}
@keyframes dt-enter{from{opacity:.45;transform:translateY(4px)}}
@media(prefers-reduced-motion:reduce){.dt-panel{animation:none}}
.dt-toolbar{display:flex;align-items:center;gap:4px;padding:4px 6px;min-height:35px;border-bottom:1px solid #292b30;background:#0b0c0d}
.dt-title{font-family:ui-sans-serif,system-ui,sans-serif;font-weight:700;white-space:nowrap;margin-right:6px}
.dt-spacer{flex:1}
.dt-live{color:#91a3ba;font-size:11px;margin:0 5px;white-space:nowrap}
.dt-live[data-connected="true"]{color:#69d7a2}
.dt-button{border:1px solid #35383f;border-radius:3px;background:#111317;color:#eceef4;padding:4px 7px;min-height:25px;text-align:left}
.dt-toolbar .dt-button{border-color:transparent;background:transparent}
.dt-button:hover,.dt-toolbar .dt-button:hover{background:#222733;border-color:#4b5569}
.dt-button[aria-pressed="true"],.dt-button[aria-current="page"],.dt-button.primary{background:#18243e;border-color:#354f83;color:#cbdcff}
.dt-button:disabled{opacity:.5;cursor:default}
.dt-body{display:grid;grid-template-columns:132px minmax(0,1fr);min-height:0}
.dt-body[data-collapsed="true"]{grid-template-columns:41px minmax(0,1fr)}
.dt-sidebar{border-right:1px solid #292b30;padding:5px 4px;overflow:auto;background:#090a0d}
.dt-sidebar .dt-button{display:flex;align-items:center;gap:7px;width:100%;min-height:28px;border-color:transparent;background:transparent;margin-bottom:2px;white-space:nowrap}
.dt-sidebar .dt-button[aria-current="page"]{background:#192644;border-color:#2b4169}
.dt-sidebar-icon{min-width:13px;text-align:center;color:#abc2f3}
.dt-body[data-collapsed="true"] .dt-sidebar-label{display:none}
.dt-content{overflow:auto;padding:10px 12px;min-width:0;scrollbar-color:#3a4160 #101219}
.dt-content h2,.dt-content h3{font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.2;margin:0 0 8px;font-weight:650}
.dt-content h2{font-size:15px}
.dt-content h3{font-size:13px;margin-top:12px}
.dt-muted{color:#a2acbb}
.dt-content p{margin:6px 0 9px}
.dt-filters{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:7px}
.dt-filters input,.dt-filters select,.dt-settings select{background:#080a0f;color:#e9eaf0;border:1px solid #343a47;padding:4px 6px;border-radius:3px;min-height:25px;max-width:100%}
.dt-filters input{flex:1;min-width:min(160px,100%)}
.dt-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));border-top:1px solid #252933;border-left:1px solid #252933;margin:0 0 9px}
.dt-metrics div{min-width:0;background:#080b10;border-right:1px solid #252933;border-bottom:1px solid #252933;padding:6px 7px}
.dt-metrics dt{color:#a2acbb;font-size:10px}
.dt-metrics dd{margin:2px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
.dt-table-wrap{width:100%;max-height:280px;overflow:auto;border:1px solid #242832}
.dt-table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}
.dt-table th,.dt-table td{padding:4px 7px;border-bottom:1px solid #20232b;max-width:420px;overflow:hidden;text-overflow:ellipsis}
.dt-table th{position:sticky;top:0;background:#14171e;color:#abb5c5;font-weight:600;z-index:1}
.dt-table tr:nth-child(even){background:#0a0d12}
.dt-table tr[data-selected="true"]{background:#182640}
.dt-table th:first-child,.dt-table td:first-child{width:1%}
.dt-link{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;padding:0;border:0;color:#a8c3ff;background:none;white-space:nowrap;text-align:left}
.dt-link:hover,.dt-link[aria-pressed="true"]{color:#d1e0ff;text-decoration:underline}
.dt-code{white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;margin:5px 0;padding:8px;border:1px solid #242832;background:#090c12;color:#e5e9f2;font:inherit}
.dt-detail{border-top:1px solid #262a33;margin-top:10px}
.dt-detail details{margin:6px 0}
.dt-detail summary,.dt-tree summary{cursor:pointer;color:#c0d4ff}
.dt-tree{list-style:none;margin:4px 0 7px;padding:0 0 0 11px}
.dt-route-tree{margin:0 0 7px}
.dt-route-tree>summary{cursor:pointer;color:#c0d4ff}
.dt-tree li{margin:3px 0}
.dt-kind{color:#94a5bf;margin-left:8px}
.dt-chart{border:1px solid #242832;padding:6px 8px;max-height:240px;overflow:auto}
.dt-bar-row{display:grid;grid-template-columns:minmax(100px,1fr) minmax(85px,2fr) auto;align-items:center;gap:6px;margin:2px 0}
.dt-bar-track{width:100%;height:9px;position:relative;background:#131822;display:block;overflow:hidden}
.dt-bar-fill{position:absolute;background:#6f9cf8;height:100%;min-width:2px}
.dt-bar-fill.slow{background:#eeab5e}
.dt-treemap{height:190px;position:relative;border:1px solid #35517e}
.dt-treemap button{position:absolute;min-height:0;border-radius:0;padding:0 2px;overflow:hidden;text-overflow:ellipsis;background:#12203a;border-color:#35517e;white-space:nowrap;text-align:left}
.dt-treemap button:hover,.dt-treemap button:focus-visible{z-index:1;background:#253e6d}
.dt-resize{position:absolute;right:3px;top:2px;width:11px;height:11px;border-top:1px solid #8ca1bd;border-right:1px solid #8ca1bd;cursor:nesw-resize;touch-action:none}
.dt-panel[data-position$="left"] .dt-resize{right:auto;left:2px;border-right:0;border-left:1px solid #8ca1bd;cursor:nwse-resize}
.dt-panel[data-position^="top"] .dt-resize{top:auto;bottom:2px;border-top:0;border-bottom:1px solid #8ca1bd}
.dt-settings{display:grid;gap:9px;justify-items:start}
.dt-settings label{display:flex;gap:7px;align-items:center}
.dt-settings kbd{background:#121622;border:1px solid #343a47;padding:1px 4px;border-radius:2px;color:#d2e3ff}
@media(max-width:540px){.dt-title{display:none}.dt-body{grid-template-columns:41px minmax(0,1fr)}.dt-sidebar-label{display:none}.dt-content{padding:8px}.dt-toolbar .dt-button{padding-inline:5px}}
`;
